import cds from "@sap/cds";
import { LeaveRuleError, leaveBalance, overlaps, planLeave, planLeaveBetween, type Holiday, type LeavePlan } from "./lib/leave-calendar.js";
import { buildLeavePdf } from "./lib/leave-pdf.js";
import { appUrl } from "../lib/app-links.js";
import { today } from "../lib/today.js";

const LOG = cds.log("hr");
const { SELECT, INSERT, UPDATE } = cds.ql;

type Employee = {
  ID: string;
  firstName: string;
  lastName: string;
  department?: string | null;
  manager_ID?: string | null;
  annualLeaveEntitlement: number;
};

type LeaveRow = {
  ID: string;
  number: string;
  startDate: string;
  endDate: string;
  returnDate: string;
  workingDays: number;
  status: string;
  reason?: string | null;
  pdfFileName?: string | null;
};

type TeamRow = LeaveRow & { employee_ID: string; createdAt?: string | null; decisionNote?: string | null; decidedAt?: string | null };

/** Only requests filed through `submitLeave` have a PDF; older ones get no link rather than a broken one. */
const summary = ({ pdfFileName, ...r }: LeaveRow) => ({
  ...r,
  pdfUrl: pdfFileName ? `/odata/v4/leave/MyLeaveRequests(${r.ID})/pdf` : null,
  appUrl: appUrl("LeaveService.MyLeaveRequests", r.ID),
});
const fullName = (e: Pick<Employee, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`;
/** A plan in the shape of the `LeavePlan` type: `timeOff` flattened, the balance around it added. */
const planResult = ({ timeOff, ...plan }: LeavePlan, remaining: number) => ({
  ...plan,
  timeOffFrom: timeOff.from,
  timeOffTo: timeOff.to,
  calendarDaysOff: timeOff.calendarDays,
  remainingBefore: remaining,
  remainingAfter: remaining - plan.workingDays,
});
const teamPdfUrl = (ID: string) => `/odata/v4/leave/TeamLeaveRequests(${ID})/pdf`;
const REQUEST_COLUMNS = ["ID", "number", "startDate", "endDate", "returnDate", "workingDays", "status", "reason", "pdfFileName"];

/**
 * Implementation of {@link file://./leave-service.cds}. The rules live in
 * `srv/lib/leave-calendar.ts`; this class reads what they need from the
 * database, applies them and writes the result.
 */
export default class LeaveService extends cds.ApplicationService {
  async init() {
    const { Employees, LeaveRequests, PublicHolidays } = cds.entities("hr");

    /** The employee behind the logged-in user, or a 403 the agent can explain. */
    const currentEmployee = async (req: cds.Request): Promise<Employee> => {
      const employee = (await SELECT.one.from(Employees).where({ userId: req.user.id })) as Employee | undefined;
      if (!employee) {
        return req.reject(403, `No employee record is linked to the user "${req.user.id}". Ask HR to link the account.`);
      }
      return employee;
    };

    const holidays = async (): Promise<Holiday[]> => (await SELECT.from(PublicHolidays).columns("date", "name")) as Holiday[];

    const activeRequests = async (employeeId: string): Promise<LeaveRow[]> =>
      (await SELECT.from(LeaveRequests)
        .where({ employee_ID: employeeId, status: { in: ["submitted", "approved"] } })
        .orderBy("startDate desc")) as LeaveRow[];

    /**
     * Plans a leave and checks it against the balance and existing requests.
     * Shared by `planLeave` and `submitLeave`, so a plan that was shown to the
     * user is exactly what gets filed.
     */
    const checkedPlan = async (
      req: cds.Request,
      employee: Employee,
      startDate: string,
      length: { workingDays: number } | { endDate: string },
    ) => {
      let plan: LeavePlan;
      try {
        plan =
          "endDate" in length
            ? planLeaveBetween(startDate, length.endDate, await holidays(), today())
            : planLeave(startDate, length.workingDays, await holidays(), today());
      } catch (err) {
        if (err instanceof LeaveRuleError) return req.reject(400, err.message);
        throw err;
      }

      const existing = await activeRequests(employee.ID);
      const clash = existing.find((r) => overlaps(plan.startDate, plan.endDate, r.startDate, r.endDate));
      if (clash) {
        return req.reject(
          409,
          `The period ${plan.startDate} – ${plan.endDate} overlaps request ${clash.number} ` +
            `(${clash.startDate} – ${clash.endDate}, ${clash.status}). Suggest different dates or cancelling ${clash.number}.`,
        );
      }

      const year = Number(plan.startDate.slice(0, 4));
      const balance = leaveBalance(year, employee.annualLeaveEntitlement, existing);
      if (plan.workingDays > balance.remaining) {
        return req.reject(
          409,
          `Only ${balance.remaining} days of annual leave remain for ${year}, but ${plan.workingDays} were requested. ` +
            `Offer a shorter leave of at most ${balance.remaining} days.`,
        );
      }
      return { plan, balance };
    };

    const employeeById = async (ID?: string | null) =>
      ID ? ((await SELECT.one.from(Employees).where({ ID })) as Employee | undefined) : undefined;

    /**
     * Renders a request's PDF form and stores it with the request. Used when
     * the request is filed and again when the manager decides, so the form
     * always shows the current status. The balance shown is the one around
     * this request: what was used before it and what remains after it.
     */
    const storePdf = async (
      request: LeaveRow & { requestedOn: string },
      employee: Employee,
      decision?: { by: string; on: string; note?: string | null },
    ) => {
      const year = Number(request.startDate.slice(0, 4));
      const others = (await activeRequests(employee.ID)).filter((r) => r.ID !== request.ID);
      const before = leaveBalance(year, employee.annualLeaveEntitlement, others);
      // The plan only supplies the skipped days here; passing the start as
      // "today" keeps the past-date check from refusing a request being decided late.
      const { skippedDays, timeOff } = planLeave(request.startDate, request.workingDays, await holidays(), request.startDate);
      const manager = await employeeById(employee.manager_ID);
      const pdf = await buildLeavePdf({
        number: request.number,
        requestedOn: request.requestedOn,
        employee: { id: employee.ID, name: fullName(employee), department: employee.department, manager: manager && fullName(manager) },
        startDate: request.startDate,
        endDate: request.endDate,
        returnDate: request.returnDate,
        workingDays: request.workingDays,
        skippedDays,
        timeOff,
        reason: request.reason,
        balance: {
          year,
          entitlement: before.entitlement,
          usedBefore: before.used + before.pending,
          remainingAfter: before.remaining - request.workingDays,
        },
        status: request.status,
        decision,
      });
      await UPDATE.entity(LeaveRequests, request.ID).with({ pdf: Buffer.from(pdf), pdfFileName: `${request.number}.pdf` });
    };

    this.on("getBalance", async (req) => {
      const employee = await currentEmployee(req);
      const year = (req.data.year as number | undefined) ?? Number(today().slice(0, 4));
      const balance = leaveBalance(year, employee.annualLeaveEntitlement, await activeRequests(employee.ID));
      return { employeeId: employee.ID, employee: fullName(employee), today: today(), ...balance };
    });

    this.on("planLeave", async (req) => {
      const { startDate, workingDays } = req.data as { startDate: string; workingDays: number };
      const employee = await currentEmployee(req);
      const { plan, balance } = await checkedPlan(req, employee, startDate, { workingDays });
      return planResult(plan, balance.remaining);
    });

    this.on("planLeaveBetween", async (req) => {
      const { startDate, endDate } = req.data as { startDate: string; endDate: string };
      const employee = await currentEmployee(req);
      const { plan, balance } = await checkedPlan(req, employee, startDate, { endDate });
      return planResult(plan, balance.remaining);
    });

    this.on("submitLeave", async (req) => {
      const { startDate, workingDays, reason } = req.data as { startDate: string; workingDays: number; reason?: string };
      const employee = await currentEmployee(req);
      const { plan } = await checkedPlan(req, employee, startDate, { workingDays });

      const year = plan.startDate.slice(0, 4);
      const { count } = (await SELECT.one.from(LeaveRequests).columns("count(1) as count").where({ number: { like: `LR-${year}-%` } })) as { count: number };
      const number = `LR-${year}-${String(count + 1).padStart(4, "0")}`;
      const ID = cds.utils.uuid();

      const { startDate: start, endDate, returnDate } = plan;
      const dates = { startDate: start, endDate, returnDate, workingDays: plan.workingDays };
      const row: LeaveRow = { ID, number, ...dates, status: "submitted", reason: reason ?? null, pdfFileName: `${number}.pdf` };
      await INSERT.into(LeaveRequests).entries({ ...row, employee_ID: employee.ID, type: "annual" });
      await storePdf({ ...row, requestedOn: today() }, employee);

      LOG.info("leave request filed", { number, employee: employee.ID, startDate: plan.startDate, workingDays: plan.workingDays });
      return summary(row);
    });

    this.on("getLeaveRequests", async (req) => {
      const employee = await currentEmployee(req);
      const year = (req.data.year as number | undefined) ?? Number(today().slice(0, 4));
      const rows = (await SELECT.from(LeaveRequests)
        .columns(...REQUEST_COLUMNS)
        .where({ employee_ID: employee.ID, startDate: { between: `${year}-01-01`, and: `${year}-12-31` } })
        .orderBy("startDate desc")) as LeaveRow[];
      return rows.map(summary);
    });

    this.on("cancelLeave", async (req) => {
      const { requestId } = req.data as { requestId: string };
      const employee = await currentEmployee(req);
      const request = (await SELECT.one.from(LeaveRequests)
        .columns(...REQUEST_COLUMNS)
        .where({ ID: requestId, employee_ID: employee.ID })) as LeaveRow | undefined;
      if (!request) return req.reject(404, `No leave request ${requestId} found for you. Call getLeaveRequests to list your requests.`);
      if (!["submitted", "approved"].includes(request.status)) {
        return req.reject(409, `Request ${request.number} is already ${request.status} and cannot be cancelled.`);
      }
      if (request.startDate <= today()) {
        return req.reject(409, `Request ${request.number} has already started on ${request.startDate}; HR has to handle that cancellation.`);
      }
      await UPDATE.entity(LeaveRequests, requestId).with({ status: "cancelled" });
      return summary({ ...request, status: "cancelled" });
    });

    // ── Approvals ────────────────────────────────────────────────────────────

    /** The manager behind the logged-in user, or a 403 the agent can explain. */
    const currentManager = async (req: cds.Request): Promise<Employee> => {
      if (!req.user.is("Manager")) return req.reject(403, `Only managers can see or decide leave approvals; "${req.user.id}" is not one.`);
      return currentEmployee(req);
    };

    const directReports = async (managerId: string) =>
      (await SELECT.from(Employees).where({ manager_ID: managerId })) as Employee[];

    this.on("getPendingApprovals", async (req) => {
      const manager = await currentManager(req);
      const team = new Map((await directReports(manager.ID)).map((e) => [e.ID, e]));
      if (!team.size) return [];
      const teamRequests = (await SELECT.from(LeaveRequests)
        .columns(...REQUEST_COLUMNS, "employee_ID", "createdAt")
        .where({ employee_ID: { in: [...team.keys()] }, status: { in: ["submitted", "approved"] } })
        .orderBy("createdAt", "startDate")) as TeamRow[];

      const pending = teamRequests.filter((r) => r.status === "submitted");
      return Promise.all(
        pending.map(async (r) => {
          const employee = team.get(r.employee_ID)!;
          const year = Number(r.startDate.slice(0, 4));
          const balance = leaveBalance(year, employee.annualLeaveEntitlement, await activeRequests(employee.ID));
          const teamOverlaps = teamRequests
            .filter((o) => o.ID !== r.ID && o.employee_ID !== r.employee_ID && overlaps(r.startDate, r.endDate, o.startDate, o.endDate))
            .map((o) => `${fullName(team.get(o.employee_ID)!)}, ${o.startDate} – ${o.endDate} (${o.status})`);
          return {
            ID: r.ID,
            number: r.number,
            employeeId: employee.ID,
            employee: fullName(employee),
            department: employee.department,
            requestedOn: r.createdAt?.slice(0, 10) ?? null,
            startDate: r.startDate,
            endDate: r.endDate,
            returnDate: r.returnDate,
            workingDays: r.workingDays,
            reason: r.reason ?? null,
            // `pending` already contains this request, so `remaining` is the balance after approving it.
            remainingAfter: balance.remaining,
            teamOverlaps,
            pdfUrl: r.pdfFileName ? teamPdfUrl(r.ID) : null,
            appUrl: appUrl("LeaveService.TeamLeaveRequests", r.ID),
          };
        }),
      );
    });

    this.on("decideLeave", async (req) => {
      const { requestId, decision, note } = req.data as { requestId: string; decision: "approve" | "reject"; note?: string | null };
      const manager = await currentManager(req);
      const request = (await SELECT.one.from(LeaveRequests)
        .columns(...REQUEST_COLUMNS, "employee_ID", "createdAt")
        .where({ ID: requestId })) as TeamRow | undefined;
      const employee = request && (await employeeById(request.employee_ID));
      if (!request || !employee || employee.manager_ID !== manager.ID) {
        return req.reject(404, `No leave request ${requestId} of your team found. Call getPendingApprovals to list the requests waiting for you.`);
      }
      if (request.status !== "submitted") {
        return req.reject(409, `Request ${request.number} is already ${request.status}; only waiting requests can be decided.`);
      }
      if (decision === "reject" && !note?.trim()) {
        return req.reject(400, `A rejection needs a note for ${fullName(employee)}. Ask the manager why ${request.number} is rejected.`);
      }

      const status = decision === "approve" ? "approved" : "rejected";
      const decidedAt = new Date().toISOString();
      await UPDATE.entity(LeaveRequests, request.ID).with({ status, decidedBy_ID: manager.ID, decidedAt, decisionNote: note?.trim() || null });
      await storePdf(
        { ...request, status, requestedOn: request.createdAt?.slice(0, 10) ?? today() },
        employee,
        { by: fullName(manager), on: today(), note: note?.trim() || null },
      );

      LOG.info("leave request decided", { number: request.number, employee: employee.ID, manager: manager.ID, status });
      return {
        ID: request.ID,
        number: request.number,
        employee: fullName(employee),
        startDate: request.startDate,
        endDate: request.endDate,
        workingDays: request.workingDays,
        status,
        decisionNote: note?.trim() || null,
        decidedAt,
        pdfUrl: teamPdfUrl(request.ID),
        appUrl: appUrl("LeaveService.TeamLeaveRequests", request.ID),
      };
    });

    return super.init();
  }
}
