import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";

/** `listPendingApprovals` — the team's requests waiting for the manager, read from LeaveService. */
export function listPendingApprovals(leave: cds.Service) {
  return async function (req: cds.Request) {
    const rows = (await forward(req, () => leave.send("getPendingApprovals", {}))) as ({ ID: string; employeeId: string } & Record<string, unknown>)[];
    // `ID` is exposed as `requestId`, like everywhere else in the agents; the personnel number stays in LeaveService.
    return rows.map(({ ID, employeeId: _employeeId, ...rest }) => ({ requestId: ID, ...rest }));
  };
}
