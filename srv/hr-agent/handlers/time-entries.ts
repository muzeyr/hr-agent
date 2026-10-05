import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";
import { workDateFrom, type WorkDayArgs } from "../../timesheet/lib/vocabulary.js";
import { leaveDaysBetween } from "../lib/leave-days.js";

type Args = WorkDayArgs & { entries: { project: string; activityType: string; hours: number; description?: string | null }[] };

/**
 * `previewTimeEntries` and `recordTimeEntries` — the same steps, ending in a
 * check or a save: resolve the date, refuse a leave day, then let
 * TimesheetService apply its own rules. Sharing them guarantees that what was
 * previewed is exactly what gets saved.
 */
function timeEntries(leave: cds.Service, timesheet: cds.Service, event: "checkEntries" | "addEntries") {
  return async function (req: cds.Request) {
    const args = req.data as Args;
    const workDate = workDateFrom(req, args, today());
    const onLeave = (await forward(req, () => leaveDaysBetween(leave, workDate, workDate))).get(workDate);
    if (onLeave) {
      return req.reject(409, `You are on annual leave on ${workDate} (request ${onLeave}); no time can be booked for that day.`);
    }
    return forward(req, () => timesheet.send(event, { workDate, entries: args.entries }));
  };
}

export const previewTimeEntries = (leave: cds.Service, timesheet: cds.Service) => timeEntries(leave, timesheet, "checkEntries");

/** Gated by `@agent.hitl`: the plugin pauses before this runs and asks the user to approve. */
export const recordTimeEntries = (leave: cds.Service, timesheet: cds.Service) => timeEntries(leave, timesheet, "addEntries");

/** `deleteTimeEntry` — removes one draft booking. Gated by `@agent.hitl`. */
export function deleteTimeEntry(timesheet: cds.Service) {
  return async function (req: cds.Request) {
    const { entryId } = req.data as { entryId: string };
    return forward(req, () => timesheet.send("deleteEntry", { entryId }));
  };
}
