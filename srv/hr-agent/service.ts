import cds from "@sap/cds";
import { cancelLeaveRequest } from "./handlers/cancel-leave-request.js";
import { decideLeaveRequest } from "./handlers/decide-leave-request.js";
import { submitAnnualLeave } from "./handlers/submit-annual-leave.js";
import { submitTimesheetWeek } from "./handlers/submit-timesheet-week.js";
import { deleteTimeEntry, previewTimeEntries, recordTimeEntries } from "./handlers/time-entries.js";

/**
 * Implementation of {@link file://./service.cds}: wiring only. Questions go to
 * the subagents over A2A (the plugin builds those tools from
 * `@agent.connect`); the tools wired here write, and call the base services
 * in-process. `cds.context` carries the user in both cases.
 */
export default class HrAgent extends cds.ApplicationService {
  async init() {
    const [leave, timesheet] = await Promise.all([cds.connect.to("LeaveService"), cds.connect.to("TimesheetService")]);

    this.on("submitAnnualLeave", submitAnnualLeave(leave));
    this.on("cancelLeaveRequest", cancelLeaveRequest(leave));
    this.on("decideLeaveRequest", decideLeaveRequest(leave));

    this.on("previewTimeEntries", previewTimeEntries(leave, timesheet));
    this.on("recordTimeEntries", recordTimeEntries(leave, timesheet));
    this.on("deleteTimeEntry", deleteTimeEntry(timesheet));
    this.on("submitTimesheetWeek", submitTimesheetWeek(leave, timesheet));

    return super.init();
  }
}
