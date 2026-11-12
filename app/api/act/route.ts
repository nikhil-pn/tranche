// Every button in the app lands here. The model never calls this route.
// The browser sends the signed workspace plus one action; the reply is the next signed workspace.

import type { ActResult, PlanChange, RedTeamScenario } from "@/lib/contract";
import * as ops from "@/lib/ops";
import { HttpFail, appUrl, errorResponse, json, rateLimit, readEnvelope, requireCode, seal } from "@/lib/server";

export const maxDuration = 60;

/** Actions that write to PayPal. They need the access code when the server has one. */
const PAYPAL_WRITES = new Set([
  "gate.requestHold",
  "gate.captureDeposit",
  "gate.raiseInvoice",
  "gate.remind",
  "gate.recordPayment",
  "payout.approve",
]);

export async function POST(request: Request) {
  try {
    rateLimit(request, "act", 120, 60_000);
    const { ws, body } = await readEnvelope(request);
    const action = String(body.action ?? "");
    if (PAYPAL_WRITES.has(action)) {
      requireCode(request);
      rateLimit(request, "paypal-write", 30, 60_000);
    }
    const ctx: ops.Ctx = { appUrl: appUrl(request), actor: "human" };

    let message: string;
    switch (action) {
      case "sync":
        message = await ops.sync(ws);
        break;
      case "clock.advance":
        message = ops.advance(ws, body.days);
        break;
      case "plan.update":
        message = ops.updatePlan(ws, body.changes as PlanChange[]);
        break;
      case "note.add":
        message = ops.addNote(ws, body);
        break;
      case "gate.requestHold":
        message = await ops.requestHold(ws, body.gateId, ctx);
        break;
      case "gate.captureDeposit":
        message = await ops.captureDeposit(ws, body.gateId, ctx);
        break;
      case "gate.raiseInvoice":
        message = await ops.raiseInvoice(ws, body.gateId, ctx);
        break;
      case "gate.remind":
        message = await ops.remind(ws, body.gateId, body.note, ctx);
        break;
      case "gate.reschedule":
        message = ops.reschedule(ws, body.gateId, body.expected, body.reason, ctx);
        break;
      case "gate.recordPayment":
        message = await ops.recordPayment(ws, body.gateId);
        break;
      case "mandate.sign":
        message = ops.signMandate(ws, body);
        break;
      case "mandate.revoke":
        message = ops.revokeMandate(ws);
        break;
      case "payout.approve":
        message = await ops.approvePayout(ws, body.proposalId, body.hash, body.approver);
        break;
      case "payout.reject":
        message = ops.rejectPayout(ws, body.proposalId, body.approver);
        break;
      case "redteam.forge":
        message = ops.forge(ws, body.scenario as RedTeamScenario);
        break;
      case "redteam.injectNote":
        message = ops.injectNote(ws);
        break;
      default:
        throw new HttpFail(400, `Unknown action "${action.slice(0, 40)}".`);
    }

    const result: ActResult = { ...seal(ws), message };
    return json(result);
  } catch (err) {
    return errorResponse(err);
  }
}
