import cds from "@sap/cds";
import { forward, startDateFrom } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";

/**
 * `planAnnualLeave` — turns "3 days from 10 November" into a concrete plan.
 *
 * The year is resolved here rather than by the model, which does not know
 * today's date; everything else — working days, holidays, balance, overlaps —
 * is LeaveService's job, and its rejections reach the model word for word.
 */
export function planAnnualLeave(leave: cds.Service) {
  return async function (req: cds.Request) {
    const args = req.data as { startDay: number; startMonth: number; startYear?: number | null; workingDays: number };
    const startDate = startDateFrom(req, args, today());
    return forward(req, () => leave.send("planLeave", { startDate, workingDays: args.workingDays }));
  };
}

/** `planAnnualLeaveBetween` — "from 6 to 13 November": the range's working days, trimmed at weekend or holiday ends. */
export function planAnnualLeaveBetween(leave: cds.Service) {
  return async function (req: cds.Request) {
    const args = req.data as { startDay: number; startMonth: number; startYear?: number | null; endDay: number; endMonth: number; endYear?: number | null };
    const startDate = startDateFrom(req, args, today());
    // The end is resolved against the start, so "28 December to 4 January" crosses into the next year.
    const endDate = startDateFrom(req, { startDay: args.endDay, startMonth: args.endMonth, startYear: args.endYear }, startDate);
    return forward(req, () => leave.send("planLeaveBetween", { startDate, endDate }));
  };
}

