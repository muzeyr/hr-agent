import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";

/** `getLeaveBalance` — the user's remaining annual leave, read from LeaveService. */
export function getLeaveBalance(leave: cds.Service) {
  return async function (req: cds.Request) {
    const { year } = req.data as { year?: number | null };
    const balance = (await forward(req, () => leave.send("getBalance", { year: year ?? undefined }))) as Record<string, unknown>;
    // The personnel number is LeaveService's business, not the conversation's.
    const { employeeId: _employeeId, ...rest } = balance;
    return rest;
  };
}
