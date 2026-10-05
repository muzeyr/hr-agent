import cds from "@sap/cds";
import { forward, toLeaveRequest, type LeaveRequestRow } from "../../lib/hr-vocabulary.js";

/** `listMyLeaveRequests` — the user's requests in a year, newest first. */
export function listMyLeaveRequests(leave: cds.Service) {
  return async function (req: cds.Request) {
    const { year } = req.data as { year?: number | null };
    const rows = (await forward(req, () => leave.send("getLeaveRequests", { year: year ?? undefined }))) as LeaveRequestRow[];
    return rows.map(toLeaveRequest);
  };
}
