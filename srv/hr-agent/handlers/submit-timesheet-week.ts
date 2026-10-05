import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";
import { weekOf } from "../../timesheet/lib/timesheet-rules.js";
import { workDateFrom, type WorkDayArgs } from "../../timesheet/lib/vocabulary.js";
import { leaveDaysBetween } from "../lib/leave-days.js";

/**
 * `submitTimesheetWeek` — locks the week and creates its PDF. The leave days
 * of the week are looked up here and handed to TimesheetService, so the PDF
 * shows them as leave rather than as missing hours. Gated by `@agent.hitl`.
 */
export function submitTimesheetWeek(leave: cds.Service, timesheet: cds.Service) {
  return async function (req: cds.Request) {
    const anyDay = workDateFrom(req, req.data as WorkDayArgs, today());
    const { weekStart, weekEnd } = weekOf(anyDay);
    const leaveDays = [...(await forward(req, () => leaveDaysBetween(leave, weekStart, weekEnd))).keys()];
    return forward(req, () => timesheet.send("submitWeek", { anyDay, leaveDays }));
  };
}
