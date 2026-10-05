import cds from "@sap/cds";
import { getDayEntries } from "./handlers/get-day-entries.js";
import { getWeekSummary } from "./handlers/get-week-summary.js";
import { listMyProjects } from "./handlers/list-my-projects.js";

/** Implementation of {@link file://./timesheet-agent.cds}: wiring only; the tools call TimesheetService in-process. */
export default class TimesheetAgent extends cds.ApplicationService {
  async init() {
    const timesheet = await cds.connect.to("TimesheetService");
    this.on("listMyProjects", listMyProjects(timesheet));
    this.on("getDayEntries", getDayEntries(timesheet));
    this.on("getWeekSummary", getWeekSummary(timesheet));
    return super.init();
  }
}
