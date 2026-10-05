import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";

/** `listMyProjects` — what the user can book on. */
export function listMyProjects(timesheet: cds.Service) {
  return async function (req: cds.Request) {
    return forward(req, () => timesheet.send("getMyProjects", {}));
  };
}
