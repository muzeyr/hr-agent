import cds from "@sap/cds";
import { getLeaveBalance } from "./handlers/get-leave-balance.js";
import { listMyLeaveRequests } from "./handlers/list-my-leave-requests.js";
import { listPendingApprovals } from "./handlers/list-pending-approvals.js";
import { planAnnualLeave, planAnnualLeaveBetween } from "./handlers/plan-annual-leave.js";

/**
 * Implementation of {@link file://./leave-agent.cds}: wiring only. The tools
 * call LeaveService in-process; `cds.context` carries the user, also when the
 * HR agent delegates here over A2A.
 */
export default class LeaveAgent extends cds.ApplicationService {
  async init() {
    const leave = await cds.connect.to("LeaveService");
    this.on("getLeaveBalance", getLeaveBalance(leave));
    this.on("planAnnualLeave", planAnnualLeave(leave));
    this.on("planAnnualLeaveBetween", planAnnualLeaveBetween(leave));
    this.on("listMyLeaveRequests", listMyLeaveRequests(leave));
    this.on("listPendingApprovals", listPendingApprovals(leave));
    return super.init();
  }
}
