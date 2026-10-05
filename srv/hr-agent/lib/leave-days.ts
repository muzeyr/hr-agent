import cds from "@sap/cds";
import { addDays } from "../../timesheet/lib/timesheet-rules.js";

type LeaveRow = { number: string; startDate: string; endDate: string; status: string };

/**
 * The days between `from` and `to` (inclusive) the user is on leave, with the
 * request that covers each. This is where the two domains meet: LeaveService
 * and TimesheetService do not know each other, so the HR agent asks the one
 * before writing to the other.
 */
export async function leaveDaysBetween(leave: cds.Service, from: string, to: string): Promise<Map<string, string>> {
  const years = [...new Set([from.slice(0, 4), to.slice(0, 4)])].map(Number);
  const requests = (await Promise.all(years.map((year) => leave.send("getLeaveRequests", { year })))).flat() as LeaveRow[];
  const days = new Map<string, string>();
  for (const r of requests) {
    if (!["submitted", "approved"].includes(r.status)) continue;
    for (let d = r.startDate; d <= r.endDate; d = addDays(d, 1)) {
      if (d >= from && d <= to) days.set(d, r.number);
    }
  }
  return days;
}
