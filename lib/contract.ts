// The wire contract between the browser and the server. Pure types: safe to import anywhere.
//
// Every call carries the signed workspace and gets the next signed workspace back:
//   POST /api/workspace/new   {}                          -> Envelope
//   POST /api/act             Envelope & Action           -> ActResult   (or { error } with a 4xx/5xx status)
//   POST /api/agent           Envelope & AgentRequest     -> text/event-stream of AgentStreamEvent
//
// The model never calls /api/act. Money leaves only through "payout.approve", which a person triggers.

import type { Envelope, Workspace } from "./types";

export interface PlanChange {
  /** Work task id. Gate tasks cannot be edited by hand: their date follows the money. */
  id: string;
  start?: string;
  durationDays?: number;
  percentDone?: number;
}

export type RedTeamScenario =
  /** Pay an address that is not on the mandate's allow-list. */
  | "outsider"
  /** Pay one person more than the per-payout cap. */
  | "over-cap"
  /** Pay out more than the client has paid in. */
  | "uncollected"
  /** A payout that fits the mandate, sent without the human approval. */
  | "skip-approval";

export type Action =
  /** Ask PayPal about every open invoice, hold and payout, and update the plan. */
  | { action: "sync" }
  | { action: "clock.advance"; days: number }
  | { action: "plan.update"; changes: PlanChange[] }
  | { action: "note.add"; author: string; authorRole: "crew" | "client" | "outside"; text: string; taskId?: string }
  /** Deposit gate: create the PayPal order the client approves (funds are held, not taken). */
  | { action: "gate.requestHold"; gateId: string }
  /** Deposit gate: capture the held funds. */
  | { action: "gate.captureDeposit"; gateId: string }
  /** Milestone gate: create and send the PayPal invoice. */
  | { action: "gate.raiseInvoice"; gateId: string }
  | { action: "gate.remind"; gateId: string; note?: string }
  /** Move the date the money is expected, and let the plan follow. */
  | { action: "gate.reschedule"; gateId: string; expected: string; reason?: string }
  /** Demo shortcut: record an off-PayPal payment on the PayPal invoice, so nobody has to log in as the client. */
  | { action: "gate.recordPayment"; gateId: string }
  | {
      action: "mandate.sign";
      signedBy: string;
      perPayoutCap: number;
      totalBudget: number;
      /** PayPal emails that may be paid. */
      payees: string[];
      /** Valid for this many days of the demo clock. */
      validDays: number;
      purpose: string;
    }
  | { action: "mandate.revoke" }
  /** The human "yes". `hash` is the proposal hash the person saw on screen. */
  | { action: "payout.approve"; proposalId: string; hash: string; approver: string }
  | { action: "payout.reject"; proposalId: string; approver: string }
  /** Safety test: forge a payout as if the agent were compromised. It goes through the same gate. */
  | { action: "redteam.forge"; scenario: RedTeamScenario }
  /** Safety test: drop a note into the project that tries to give the agent orders. */
  | { action: "redteam.injectNote" };

export type ActionName = Action["action"];

export interface ActResult extends Envelope {
  /** One plain sentence about what happened, for a toast. */
  message?: string;
}

export interface ApiError {
  error: string;
  /** PayPal's issue code when the error came from PayPal, e.g. INSUFFICIENT_FUNDS. */
  issue?: string;
}

export interface AgentTurn {
  role: "user" | "assistant";
  text: string;
}

export interface AgentRequest {
  message: string;
  /** Earlier turns of this chat, oldest first (text only). */
  history?: AgentTurn[];
}

export type AgentStreamEvent =
  | { type: "text"; delta: string }
  /** The agent started a tool. `label` is a short human sentence ("Raising the invoice for Design approval"). */
  | { type: "tool"; id: string; name: string; label: string; input: unknown }
  | { type: "tool_result"; id: string; ok: boolean; summary: string }
  /** The workspace changed. Replace the local copy (it is already signed). */
  | { type: "state"; ws: Workspace; sig: string }
  | { type: "done"; stop: string }
  | { type: "error"; message: string };

/** Sent as the `x-tranche-code` header when the server has an access code set. */
export const ACCESS_HEADER = "x-tranche-code";

export interface PublicConfig {
  /** True when the server wants an access code for the agent and for PayPal writes. */
  needsCode: boolean;
  /** True when PayPal sandbox credentials are present on the server. */
  paypal: boolean;
  /** True when the Claude API key is present on the server. */
  agent: boolean;
  /** PayPal sandbox buyer login shown on the "pay as the client" hint. Sandbox only, safe to show. */
  sandboxBuyerEmail?: string;
  /** Password of that sandbox test buyer. It holds play money only and is printed in the README too. */
  sandboxBuyerPassword?: string;
}
