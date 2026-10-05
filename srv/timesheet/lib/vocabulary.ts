import cds from "@sap/cds";
import { TimesheetRuleError, resolveWorkDate } from "./timesheet-rules.js";

/**
 * Tool arguments → TimesheetService calls: a day and month the user said into
 * an ISO date. Shared by the timesheet subagent and the HR agent.
 */
export type WorkDayArgs = { workDay?: number | null; workMonth?: number | null; workYear?: number | null };

export function workDateFrom(req: cds.Request, args: WorkDayArgs, todayIso: string): string {
  try {
    return resolveWorkDate(args.workDay ?? undefined, args.workMonth ?? undefined, args.workYear ?? undefined, todayIso);
  } catch (err) {
    if (err instanceof TimesheetRuleError) return req.reject(400, err.message);
    throw err;
  }
}
