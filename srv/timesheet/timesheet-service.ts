import cds from "@sap/cds";
import { appUrl } from "../lib/app-links.js";
import { today } from "../lib/today.js";
import { buildTimesheetPdf } from "./lib/timesheet-pdf.js";
import {
  TimesheetRuleError,
  addDays,
  checkDay,
  resolveActivity,
  resolveProject,
  weekDays,
  weekOf,
  type ActivityType,
  type Project,
} from "./lib/timesheet-rules.js";

const LOG = cds.log("hr");
const { SELECT, INSERT, DELETE, UPDATE } = cds.ql;

type Employee = { ID: string; firstName: string; lastName: string; department?: string | null; manager_ID?: string | null; dailyHours: number };
type EntryInput = { project: string; activityType: string; hours: number; description?: string | null };
type EntryRow = {
  ID: string;
  workDate: string;
  project_ID: string;
  activityType_code: string;
  hours: number | string;
  description?: string | null;
  status: string;
};

const fullName = (e: Pick<Employee, "firstName" | "lastName">) => `${e.firstName} ${e.lastName}`;

/** Runs a rule check and turns its refusal into a 400 the model can act on. */
function rule<T>(req: cds.Request, check: () => T): T {
  try {
    return check();
  } catch (err) {
    if (err instanceof TimesheetRuleError) return req.reject(400, err.message);
    throw err;
  }
}

/** Implementation of {@link file://./timesheet-service.cds}; the rules live in `lib/timesheet-rules.ts`. */
export default class TimesheetService extends cds.ApplicationService {
  async init() {
    const { Employees, PublicHolidays, Projects, ProjectAssignments, ActivityTypes, TimeEntries, TimesheetWeeks } = cds.entities("hr");

    const currentEmployee = async (req: cds.Request): Promise<Employee> => {
      const employee = (await SELECT.one.from(Employees).where({ userId: req.user.id })) as Employee | undefined;
      if (!employee) return req.reject(403, `No employee record is linked to the user "${req.user.id}". Ask HR to link the account.`);
      return { ...employee, dailyHours: Number(employee.dailyHours ?? 8) };
    };

    const assignedProjects = async (employeeId: string): Promise<Project[]> => {
      const ids = ((await SELECT.from(ProjectAssignments).columns("project_ID").where({ employee_ID: employeeId })) as { project_ID: string }[]).map(
        (a) => a.project_ID,
      );
      return ids.length ? ((await SELECT.from(Projects).where({ ID: { in: ids } })) as Project[]) : [];
    };

    const activityTypes = async () => (await SELECT.from(ActivityTypes)) as (ActivityType & { billable: boolean })[];

    const holidayMap = async () =>
      new Map(((await SELECT.from(PublicHolidays).columns("date", "name")) as { date: string; name: string }[]).map((h) => [h.date, h.name]));

    const weekSubmitted = async (employeeId: string, workDate: string) =>
      !!(await SELECT.one.from(TimesheetWeeks).where({ employee_ID: employeeId, weekStart: weekOf(workDate).weekStart }));

    const entriesOn = async (employeeId: string, from: string, to: string) =>
      (await SELECT.from(TimeEntries)
        .where({ employee_ID: employeeId, workDate: { between: from, and: to } })
        .orderBy("workDate", "createdAt")) as EntryRow[];

    const toEntry = (r: EntryRow, projects: Map<string, string>) => ({
      ID: r.ID,
      workDate: r.workDate,
      projectId: r.project_ID,
      project: projects.get(r.project_ID) ?? r.project_ID,
      activityType: r.activityType_code,
      hours: Number(r.hours),
      description: r.description ?? null,
      status: r.status,
      appUrl: appUrl("TimesheetService.MyTimeEntries", r.ID),
    });

    const projectNames = async () =>
      new Map(((await SELECT.from(Projects).columns("ID", "name")) as Project[]).map((p) => [p.ID, p.name]));

    /** Resolves and checks bookings for a day; shared by checkEntries and addEntries so a preview is what gets saved. */
    const prepare = async (req: cds.Request) => {
      const { workDate, entries = [] } = req.data as { workDate: string; entries?: EntryInput[] };
      const employee = await currentEmployee(req);
      const [projects, activities, holidays, submitted, existing] = await Promise.all([
        assignedProjects(employee.ID),
        activityTypes(),
        holidayMap(),
        weekSubmitted(employee.ID, workDate),
        entriesOn(employee.ID, workDate, workDate),
      ]);
      const resolved = rule(req, () =>
        entries.map((e) => ({
          project: resolveProject(e.project, projects),
          activity: resolveActivity(e.activityType, activities),
          hours: Number(e.hours),
          description: e.description ?? null,
        })),
      );
      const { dayTotal, warnings } = rule(req, () =>
        checkDay({
          workDate,
          today: today(),
          hours: resolved.map((r) => r.hours),
          bookedBefore: existing.reduce((sum, r) => sum + Number(r.hours), 0),
          weekSubmitted: submitted,
          holiday: holidays.get(workDate),
          dailyHours: employee.dailyHours,
        }),
      );
      return { employee, workDate, resolved, dayTotal, warnings, existing };
    };

    this.on("getMyProjects", async (req) => {
      const employee = await currentEmployee(req);
      const projects = (await assignedProjects(employee.ID)).filter((p) => p.active);
      return { projects: projects.map(({ ID, name, customer }) => ({ ID, name, customer })), activities: await activityTypes(), today: today() };
    });

    this.on("checkEntries", async (req) => {
      const { workDate, resolved, dayTotal, warnings } = await prepare(req);
      const entries = resolved.map((r) => ({
        workDate,
        projectId: r.project.ID,
        project: r.project.name,
        activityType: r.activity.code,
        hours: r.hours,
        description: r.description,
        status: "draft",
      }));
      return { workDate, entries, dayTotal, warnings };
    });

    this.on("addEntries", async (req) => {
      const { employee, workDate, resolved, dayTotal, warnings } = await prepare(req);
      const rows = resolved.map((r) => ({
        ID: cds.utils.uuid(),
        employee_ID: employee.ID,
        workDate,
        project_ID: r.project.ID,
        activityType_code: r.activity.code,
        hours: r.hours,
        description: r.description,
        status: "draft",
      }));
      await INSERT.into(TimeEntries).entries(rows);
      LOG.info("time booked", { employee: employee.ID, workDate, entries: rows.length, dayTotal });
      const names = await projectNames();
      return { workDate, entries: rows.map((r) => toEntry(r as EntryRow, names)), dayTotal, warnings };
    });

    this.on("deleteEntry", async (req) => {
      const { entryId } = req.data as { entryId: string };
      const employee = await currentEmployee(req);
      const entry = (await SELECT.one.from(TimeEntries).where({ ID: entryId, employee_ID: employee.ID })) as EntryRow | undefined;
      if (!entry) return req.reject(404, `No booking ${entryId} found for you. List the day's bookings to find its ID.`);
      if (entry.status !== "draft") return req.reject(409, `The booking on ${entry.workDate} belongs to a submitted week and is locked.`);
      await DELETE.from(TimeEntries).where({ ID: entryId });
      return toEntry(entry, await projectNames());
    });

    this.on("getDay", async (req) => {
      const { workDate } = req.data as { workDate: string };
      const employee = await currentEmployee(req);
      const rows = await entriesOn(employee.ID, workDate, workDate);
      const names = await projectNames();
      return { workDate, entries: rows.map((r) => toEntry(r, names)), dayTotal: rows.reduce((s, r) => s + Number(r.hours), 0), warnings: [] };
    });

    /** Builds the week summary; shared by getWeek and submitWeek. */
    const summarize = async (req: cds.Request) => {
      const { anyDay, leaveDays = [] } = req.data as { anyDay: string; leaveDays?: string[] };
      const employee = await currentEmployee(req);
      const { weekStart, weekEnd } = weekOf(anyDay);
      const [rows, holidays, names, activities, week] = await Promise.all([
        entriesOn(employee.ID, weekStart, weekEnd),
        holidayMap(),
        projectNames(),
        activityTypes(),
        SELECT.one.from(TimesheetWeeks).columns("ID", "status").where({ employee_ID: employee.ID, weekStart }),
      ]) as [EntryRow[], Map<string, string>, Map<string, string>, (ActivityType & { billable: boolean })[], { ID: string; status: string } | undefined];
      const days = weekDays(weekStart, rows.map((r) => ({ workDate: r.workDate, hours: Number(r.hours) })), holidays, new Set(leaveDays), employee.dailyHours);
      const billable = new Set(activities.filter((a) => a.billable).map((a) => a.code));
      const byProjectMap = new Map<string, { project: string; hours: number; billable: number }>();
      for (const r of rows) {
        const name = names.get(r.project_ID) ?? r.project_ID;
        const p = byProjectMap.get(name) ?? { project: name, hours: 0, billable: 0 };
        p.hours += Number(r.hours);
        if (billable.has(r.activityType_code)) p.billable += Number(r.hours);
        byProjectMap.set(name, p);
      }
      const total = days.reduce((s, d) => s + d.hours, 0);
      const target = days.reduce((s, d) => s + d.target, 0);
      return {
        employee,
        rows,
        names,
        activities,
        summary: {
          weekStart,
          weekEnd,
          days,
          byProject: [...byProjectMap.values()],
          total,
          target,
          status: week ? week.status : "open",
          pdfUrl: week ? `/odata/v4/timesheet/MyTimesheetWeeks(${week.ID})/pdf` : null,
        },
      };
    };

    this.on("getWeek", async (req) => (await summarize(req)).summary);

    this.on("submitWeek", async (req) => {
      const { employee, rows, names, activities, summary } = await summarize(req);
      if (summary.status !== "open") return req.reject(409, `The week starting ${summary.weekStart} has already been submitted.`);
      if (summary.weekStart > today()) return req.reject(400, `The week starting ${summary.weekStart} has not started yet.`);
      if (rows.length === 0) return req.reject(400, `There are no bookings in the week starting ${summary.weekStart}. Book time first.`);

      const manager = employee.manager_ID ? ((await SELECT.one.from(Employees).where({ ID: employee.manager_ID })) as Employee | undefined) : undefined;
      const activityName = new Map(activities.map((a) => [a.code, a.name]));
      const pdf = await buildTimesheetPdf({
        employee: { id: employee.ID, name: fullName(employee), department: employee.department, manager: manager && fullName(manager) },
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        submittedOn: today(),
        entries: rows.map((r) => ({
          workDate: r.workDate,
          project: names.get(r.project_ID) ?? r.project_ID,
          activity: activityName.get(r.activityType_code) ?? r.activityType_code,
          hours: Number(r.hours),
          description: r.description,
        })),
        days: summary.days,
        byProject: summary.byProject,
        total: summary.total,
        target: summary.target,
      });

      const ID = cds.utils.uuid();
      await INSERT.into(TimesheetWeeks).entries({
        ID,
        employee_ID: employee.ID,
        weekStart: summary.weekStart,
        weekEnd: summary.weekEnd,
        totalHours: summary.total,
        status: "submitted",
        pdf: Buffer.from(pdf),
        pdfFileName: `timesheet-${employee.ID}-${summary.weekStart}.pdf`,
      });
      await UPDATE.entity(TimeEntries)
        .set({ status: "submitted" })
        .where({ employee_ID: employee.ID, workDate: { between: summary.weekStart, and: addDays(summary.weekStart, 6) } });
      LOG.info("timesheet submitted", { employee: employee.ID, weekStart: summary.weekStart, total: summary.total });
      return { ...summary, status: "submitted", pdfUrl: `/odata/v4/timesheet/MyTimesheetWeeks(${ID})/pdf` };
    });

    return super.init();
  }
}
