import cds from "@sap/cds";
import { forward, toLeaveRequest, type LeaveRequestRow } from "../../lib/hr-vocabulary.js";

/** `cancelLeaveRequest` — cancels a request that has not started. Gated by `@agent.hitl`. */
export function cancelLeaveRequest(leave: cds.Service) {
  return async function (req: cds.Request) {
    const { requestId } = req.data as { requestId: string };
    const row = (await forward(req, () => leave.send("cancelLeave", { requestId }))) as LeaveRequestRow;
    return toLeaveRequest(row);
  };
}
