import cds from "@sap/cds";
import { forward, startDateFrom, toLeaveRequest, type LeaveRequestRow } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";

/**
 * `submitAnnualLeave` — files the request and creates its PDF.
 *
 * Gated by `@agent.hitl`: the plugin pauses before this runs and asks the user
 * to approve. LeaveService re-checks the plan, so a request that became
 * invalid between planning and approval is refused instead of filed.
 */
export function submitAnnualLeave(leave: cds.Service) {
  return async function (req: cds.Request) {
    const args = req.data as { startDay: number; startMonth: number; startYear: number; workingDays: number; reason?: string | null };
    const startDate = startDateFrom(req, args, today());
    const row = (await forward(req, () =>
      leave.send("submitLeave", { startDate, workingDays: args.workingDays, reason: args.reason || undefined }),
    )) as LeaveRequestRow;
    return toLeaveRequest(row);
  };
}
