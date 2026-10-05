import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";
import { today } from "../../lib/today.js";
import { workDateFrom, type WorkDayArgs } from "../lib/vocabulary.js";

/** `getDayEntries` — the bookings of one day; no date means today. */
export function getDayEntries(timesheet: cds.Service) {
  return async function (req: cds.Request) {
    const workDate = workDateFrom(req, req.data as WorkDayArgs, today());
    return forward(req, () => timesheet.send("getDay", { workDate }));
  };
}
