import cds from "@sap/cds";
import { beforeAll, describe, expect, it } from "vitest";

/**
 * The agents' tools end to end: HrAgent, LeaveAgent, TimesheetAgent → the
 * base services → SQLite → PDF.
 *
 * `llm-mock` never calls a tool, so the model is left out and the tools are
 * called the way the plugin calls them — as operations of the agent services,
 * on behalf of a user. In-memory database, today pinned to Sunday 4 October
 * 2026, so the run neither touches db.sqlite nor depends on the date.
 */
process.env.CDS_CONFIG = JSON.stringify({
  requires: { db: { kind: "sqlite", credentials: { url: ":memory:" } } },
  hr: { today: "2026-10-04" },
});

const test = cds.test(new URL("../..", import.meta.url).pathname);
const alice = new cds.User({ id: "alice", roles: ["Employee"], attr: {} });
const bob = new cds.User({ id: "bob", roles: ["Employee"], attr: {} });
const carol = new cds.User({ id: "carol", roles: ["Employee", "Manager"], attr: {} });
const pdfBytes = async (entity: string, ID: string) => {
  const { pdf } = await SELECT.one.from(entity).columns("pdf").where({ ID });
  return Buffer.isBuffer(pdf) ? pdf : Buffer.from(await new Response(pdf).arrayBuffer());
};

let hr: cds.Service, leaveAgent: cds.Service, timesheetAgent: cds.Service;
const as = (srv: () => cds.Service, user: cds.User) => (event: string, data: object = {}) =>
  srv().tx({ user }, (tx) => tx.send(event, data));

beforeAll(async () => {
  [hr, leaveAgent, timesheetAgent] = await Promise.all(["HrAgent", "LeaveAgent", "TimesheetAgent"].map((s) => cds.connect.to(s)));
});

describe("HrAgent wiring", () => {
  it("has its own write tools plus one A2A tool per subagent", async () => {
    const tools = (await hr.tx({ user: alice }, (tx) => tx.send("buildTools"))) as { name: string }[];
    const names = tools.map((t) => t.name);
    expect(names).toEqual(expect.arrayContaining(["submitAnnualLeave", "decideLeaveRequest", "recordTimeEntries", "submitTimesheetWeek"]));
    expect(names.filter((n) => /leave.?agent/i.test(n))).toHaveLength(1);
    expect(names.filter((n) => /timesheet.?agent/i.test(n))).toHaveLength(1);
  });
});

describe("Leave: LeaveAgent plans, HrAgent files", () => {
  const leave = as(() => leaveAgent, alice);
  const write = as(() => hr, alice);

  it("plans 3 days from 10 November without saving anything", async () => {
    const plan = await leave("planAnnualLeave", { startDay: 10, startMonth: 11, workingDays: 3 });
    expect(plan).toMatchObject({ startDate: "2026-11-10", endDate: "2026-11-12", returnDate: "2026-11-13", remainingAfter: 7 });
    expect(await leave("listMyLeaveRequests")).toHaveLength(1);
  });

  it("plans a range that ends on a weekend: trimmed, with the whole break", async () => {
    const plan = await leave("planAnnualLeaveBetween", { startDay: 4, startMonth: 12, endDay: 6, endMonth: 12 });
    expect(plan).toMatchObject({ startDate: "2026-12-04", endDate: "2026-12-04", workingDays: 1, returnDate: "2026-12-07", calendarDaysOff: 3 });
    expect(plan.adjustments).toHaveLength(1);
  });

  it("resolves a range across the new year", async () => {
    const plan = await leave("planAnnualLeaveBetween", { startDay: 28, startMonth: 12, endDay: 4, endMonth: 1 });
    expect(plan).toMatchObject({ startDate: "2026-12-28", endDate: "2027-01-04" });
    expect(plan.skippedDays.map((d: { reason: string }) => d.reason)).toContain("New Year's Day");
  });

  it("files the request with a PDF and counts it as pending", async () => {
    const request = await write("submitAnnualLeave", { startDay: 10, startMonth: 11, startYear: 2026, workingDays: 3, reason: "Family visit" });
    expect(request).toMatchObject({ number: "LR-2026-0003", status: "submitted" });
    expect((await pdfBytes("hr.LeaveRequests", request.requestId)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(request.appUrl).toBe(`/leave-requests/webapp/index.html#/MyLeaveRequests(${request.requestId})`);
    expect(await leave("getLeaveBalance")).toMatchObject({ used: 4, pending: 3, remaining: 7 });
  });

  it("refuses an overlapping plan with a message the model can act on", async () => {
    await expect(leave("planAnnualLeave", { startDay: 11, startMonth: 11, workingDays: 2 })).rejects.toThrow(/overlaps request LR-2026-0003/);
  });

  it("keeps each employee's requests to themselves", async () => {
    const bobs = await as(() => leaveAgent, bob)("listMyLeaveRequests");
    expect(bobs.map((r: { number: string }) => r.number)).toEqual(["LR-2026-0002"]);
  });

  it("cancels a request that has not started", async () => {
    const [latest] = await leave("listMyLeaveRequests");
    expect((await write("cancelLeaveRequest", { requestId: latest.requestId })).status).toBe("cancelled");
  });
});

describe("Leave approval: LeaveAgent lists, HrAgent decides as the manager", () => {
  const pending = as(() => leaveAgent, carol);
  const decide = as(() => hr, carol);
  type Pending = { requestId: string; number: string; employee: string; remainingAfter: number; teamOverlaps: string[]; pdfUrl: string | null };

  it("refuses the approval list to someone who is not a manager", async () => {
    await expect(as(() => leaveAgent, alice)("listPendingApprovals")).rejects.toThrow(/Only managers/);
  });

  it("lists the team's waiting requests, oldest first, with balance and overlaps", async () => {
    await as(() => hr, alice)("submitAnnualLeave", { startDay: 21, startMonth: 12, startYear: 2026, workingDays: 2 });
    const list = (await pending("listPendingApprovals")) as Pending[];
    expect(list.map((r) => [r.number, r.employee])).toEqual([
      ["LR-2026-0002", "Bob Miller"],
      ["LR-2026-0004", "Alice Smith"],
    ]);
    expect(list[1]).toMatchObject({ remainingAfter: 8, teamOverlaps: ["Bob Miller, 2026-12-21 – 2026-12-24 (submitted)"] });
    expect(list[0].pdfUrl).toBeNull(); // seeded without a form
  });

  it("links every waiting request to its record in the Team Leave Requests app", async () => {
    const [first] = (await pending("listPendingApprovals")) as (Pending & { appUrl: string })[];
    expect(first.appUrl).toBe(`/team-leave-requests/webapp/index.html#/TeamLeaveRequests(${first.requestId})`);
    // … and the record behind that link is readable by the manager, with the app's calculated elements.
    const { data } = await test.get(`/odata/v4/leave/TeamLeaveRequests(${first.requestId})?$select=number,employeeName,statusText`, {
      auth: { username: "carol", password: "" },
    });
    expect(data).toMatchObject({ number: "LR-2026-0002", employeeName: "Bob Miller", statusText: "Waiting for approval" });
  });

  it("needs a note to reject", async () => {
    const [bobs] = (await pending("listPendingApprovals")) as Pending[];
    await expect(decide("decideLeaveRequest", { requestId: bobs.requestId, decision: "reject" })).rejects.toThrow(/needs a note/);
  });

  it("approves a request, updates its PDF and the employee's balance", async () => {
    const alices = ((await pending("listPendingApprovals")) as Pending[]).find((r) => r.employee === "Alice Smith")!;
    const decided = await decide("decideLeaveRequest", { requestId: alices.requestId, decision: "approve" });
    expect(decided).toMatchObject({ number: "LR-2026-0004", status: "approved", employee: "Alice Smith" });
    expect((await pdfBytes("hr.LeaveRequests", alices.requestId)).subarray(0, 5).toString()).toBe("%PDF-");
    expect(await as(() => leaveAgent, alice)("getLeaveBalance")).toMatchObject({ used: 6, pending: 0, remaining: 8 });
    await expect(decide("decideLeaveRequest", { requestId: alices.requestId, decision: "approve" })).rejects.toThrow(/already approved/);
  });

  it("rejects with a note, which the employee then sees, and empties the list", async () => {
    const [bobs] = (await pending("listPendingApprovals")) as Pending[];
    const decided = await decide("decideLeaveRequest", { requestId: bobs.requestId, decision: "reject", note: "Year-end closing that week" });
    expect(decided).toMatchObject({ status: "rejected", decisionNote: "Year-end closing that week" });
    expect((await as(() => leaveAgent, bob)("listMyLeaveRequests"))[0]).toMatchObject({ number: "LR-2026-0002", status: "rejected" });
    expect(await pending("listPendingApprovals")).toEqual([]);
  });

  it("refuses decisions from someone who is not the employee's manager", async () => {
    const [own] = await as(() => leaveAgent, bob)("listMyLeaveRequests");
    await expect(as(() => hr, alice)("decideLeaveRequest", { requestId: own.requestId, decision: "approve" })).rejects.toThrow(/Only managers/);
  });

  it("serves the team's PDFs to the manager only over OData", async () => {
    const [own] = await as(() => leaveAgent, bob)("listMyLeaveRequests");
    const url = `/odata/v4/leave/TeamLeaveRequests(${own.requestId})/pdf`;
    const res = await test.get(url, { auth: { username: "carol", password: "" }, responseType: "arraybuffer" });
    expect(res.headers["content-type"]).toBe("application/pdf");
    await expect(test.get(url, { auth: { username: "alice", password: "" } })).rejects.toThrow(/403/);
  });
});

describe("Timesheet: TimesheetAgent reads, HrAgent books and submits", () => {
  const ts = as(() => timesheetAgent, alice);
  const write = as(() => hr, alice);

  it("lists the user's active projects only", async () => {
    const { projects } = await ts("listMyProjects");
    expect(projects.map((p: { ID: string }) => p.ID).sort()).toEqual(["P100", "P900"]);
  });

  it("previews bookings without saving them", async () => {
    const preview = await write("previewTimeEntries", {
      workDay: 2,
      workMonth: 10,
      entries: [{ project: "Apollo", activityType: "development", hours: 6 }],
    });
    expect(preview).toMatchObject({ workDate: "2026-10-02", dayTotal: 6 });
    expect(preview.entries[0]).toMatchObject({ projectId: "P100", hours: 6 });
    expect((await ts("getDayEntries", { workDay: 2, workMonth: 10 })).entries).toEqual([]);
  });

  it("records bookings and shows them in the week", async () => {
    const saved = await write("recordTimeEntries", {
      workDay: 2,
      workMonth: 10,
      entries: [
        { project: "Apollo", activityType: "development", hours: 6, description: "Cut-over rehearsal" },
        { project: "P900", activityType: "meeting", hours: 2 },
      ],
    });
    const week = await ts("getWeekSummary", { workDay: 2, workMonth: 10 });
    expect(week).toMatchObject({ weekStart: "2026-09-28", total: 40, target: 40, status: "open" });    // Saved bookings link to the My Timesheet app.
    const [first] = saved.entries as { ID: string; appUrl: string }[];
    expect(first.appUrl).toBe(`/timesheet/webapp/index.html#/MyTimeEntries(${first.ID})`);
  });

  it("refuses a booking on a leave day, naming the request", async () => {
    await expect(
      write("previewTimeEntries", { workDay: 15, workMonth: 7, entries: [{ project: "Apollo", activityType: "development", hours: 8 }] }),
    ).rejects.toThrow(/on annual leave on 2026-07-15 \(request LR-2026-0001\)/);
  });

  it("refuses a project the user is not assigned to, listing theirs", async () => {
    await expect(write("previewTimeEntries", { entries: [{ project: "Atlas", activityType: "testing", hours: 1 }] })).rejects.toThrow(
      /projects you can book on are/,
    );
  });

  it("submits the week, stores the PDF and locks the bookings", async () => {
    const week = await write("submitTimesheetWeek", { workDay: 1, workMonth: 10 });
    expect(week).toMatchObject({ status: "submitted", total: 40 });
    expect(week.pdfUrl).toMatch(/\/odata\/v4\/timesheet\/MyTimesheetWeeks\(.+\)\/pdf$/);
    const ID = week.pdfUrl.match(/\((.+)\)/)[1];
    expect((await pdfBytes("hr.TimesheetWeeks", ID)).subarray(0, 5).toString()).toBe("%PDF-");
    await expect(write("recordTimeEntries", { workDay: 2, workMonth: 10, entries: [{ project: "P900", activityType: "support", hours: 1 }] })).rejects.toThrow(
      /already been submitted/,
    );
  });

  it("serves the timesheet PDF only to its owner over OData", async () => {
    const { pdfUrl } = await ts("getWeekSummary", { workDay: 1, workMonth: 10 });
    const own = await test.get(pdfUrl, { auth: { username: "alice", password: "" }, responseType: "arraybuffer" });
    expect(own.headers["content-type"]).toBe("application/pdf");
    await expect(test.get(pdfUrl, { auth: { username: "bob", password: "" } })).rejects.toThrow(/404/);
  });
});
