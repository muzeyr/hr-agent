import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";
import { workDateFrom, type WorkDayArgs } from "../lib/vocabulary.js";

/** `getWeekSummary` — totals for the week containing the given day; no date means this week. */
export function getWeekSummary(timesheet: cds.Service) {
  return async function (req: cds.Request) {
    const anyDay = workDateFrom(req, req.data as WorkDayArgs, today());
    return forward(req, () => timesheet.send("getWeek", { anyDay }));
  };
}
