import cds from "@sap/cds";
import { forward } from "../../lib/hr-vocabulary.js";

/**
 * `decideLeaveRequest` — a manager approves or rejects a team member's request.
 *
 * Gated by `@agent.hitl`, like every write. LeaveService checks that the
 * caller is a manager, that the request belongs to one of their direct
 * reports and is still waiting, and updates the PDF form with the decision.
 */
export function decideLeaveRequest(leave: cds.Service) {
  return async function (req: cds.Request) {
    const { requestId, decision, note } = req.data as { requestId: string; decision: "approve" | "reject"; note?: string | null };
    const { ID, decidedAt: _decidedAt, ...rest } = (await forward(req, () =>
      leave.send("decideLeave", { requestId, decision, note: note || undefined }),
    )) as { ID: string; decidedAt: string } & Record<string, unknown>;
    return { requestId: ID, ...rest };
  };
}
