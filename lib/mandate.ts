// The payout gate. Plain code, no model in the loop.
// Every payout, whoever proposed it, has to pass all of these checks before one PayPal call is made.

import { round2, usd } from "./dates";
import { collected, paidOut } from "./schedule";
import { proposalHash, verifyMandate } from "./sign";
import type { Check, PayoutProposal, Workspace } from "./types";

export interface Approval {
  /** The proposal hash the person saw on the approval screen. */
  hash: string;
  by: string;
}

export interface GateResult {
  ok: boolean;
  checks: Check[];
}

/**
 * @param approval  null while a proposal is only being assessed (the approval check then reports "waiting").
 * @param opts.requireApproval  false only for the first assessment of a new proposal.
 */
export function authorize(
  ws: Workspace,
  proposal: PayoutProposal,
  approval: Approval | null,
  opts: { requireApproval: boolean } = { requireApproval: true },
): GateResult {
  const m = ws.mandate;
  const checks: Check[] = [];
  const add = (id: Check["id"], label: string, ok: boolean, detail: string) => checks.push({ id, label, ok, detail });

  const total = round2(proposal.items.reduce((s, i) => s + i.amount, 0));
  const amountsValid =
    proposal.items.length > 0 && proposal.items.every((i) => Number.isFinite(i.amount) && i.amount > 0) && total === round2(proposal.total);

  // 1. A mandate exists and its signature is genuine.
  const mandateOk = !!m && verifyMandate(ws.id, m);
  add(
    "mandate",
    "Signed mandate",
    mandateOk,
    !m ? "No mandate has been signed." : mandateOk ? `Signed by ${m.signedBy}.` : "The mandate signature does not verify.",
  );

  // 2. Not expired (demo clock).
  const expiryOk = !!m && ws.today <= m.expiresAt;
  add("expiry", "Mandate in date", expiryOk, !m ? "No mandate." : expiryOk ? `Valid until ${m.expiresAt}.` : `Expired on ${m.expiresAt}.`);

  // 3. Every payee is on the allow-list.
  const allowed = new Set((m?.payees ?? []).map((e) => e.toLowerCase()));
  const strangers = proposal.items.filter((i) => !allowed.has(i.email.toLowerCase())).map((i) => i.email);
  add(
    "payees",
    "Payees on the allow-list",
    !!m && strangers.length === 0,
    !m ? "No mandate." : strangers.length ? `Not on the list: ${strangers.join(", ")}.` : `All ${proposal.items.length} payees are on the list.`,
  );

  // 4. No single payout above the cap.
  const over = proposal.items.filter((i) => !m || i.amount > m.perPayoutCap);
  add(
    "cap",
    "Each payout within the cap",
    !!m && amountsValid && over.length === 0,
    !m
      ? "No mandate."
      : !amountsValid
        ? "The amounts are not valid."
        : over.length
          ? `${over.map((i) => `${i.name} ${usd(i.amount)}`).join(", ")} is over the ${usd(m.perPayoutCap)} cap.`
          : `Largest payout is ${usd(Math.max(...proposal.items.map((i) => i.amount)))}, cap is ${usd(m.perPayoutCap)}.`,
  );

  // 5. Inside the total budget.
  const already = paidOut(ws);
  const budgetOk = !!m && round2(already + total) <= m.totalBudget;
  add(
    "budget",
    "Within the total budget",
    budgetOk,
    !m ? "No mandate." : `${usd(already)} paid so far plus ${usd(total)} is ${usd(round2(already + total))} of ${usd(m.totalBudget)}.`,
  );

  // 6. Collected first: never pay out money the client has not paid in.
  const got = collected(ws);
  const collectedOk = round2(already + total) <= got;
  add(
    "collected",
    "Client money collected first",
    collectedOk,
    collectedOk
      ? `${usd(got)} collected from the client covers ${usd(round2(already + total))} paid out.`
      : `Only ${usd(got)} has been collected. This would bring payouts to ${usd(round2(already + total))}.`,
  );

  // 7. A proposal can be paid once.
  const used = proposal.status !== "pending" || ws.receipts.some((r) => r.proposalId === proposal.id);
  add("single-use", "Not paid before", !used, used ? "This proposal was already decided." : "First use of this proposal.");

  // 8. A person approved exactly this proposal.
  const hashNow = proposalHash(proposal.items, total, m?.id ?? null);
  let approvalOk = false;
  let approvalDetail = "Waiting for a person to approve.";
  if (approval) {
    approvalOk = approval.hash === hashNow && approval.hash === proposal.hash && approval.by.trim().length > 0;
    approvalDetail = approvalOk
      ? `Approved by ${approval.by}. The approval matches this exact list of payouts.`
      : "The approval does not match this list of payouts.";
  } else if (opts.requireApproval) {
    approvalDetail = "No human approval was given.";
  }
  add("approval", "Human approval", approvalOk, approvalDetail);

  const ok = checks.every((c) => c.ok || (c.id === "approval" && !opts.requireApproval));
  return { ok, checks };
}

/** The failed checks as one sentence, for logs and for the agent. */
export function refusalReason(checks: Check[], ignoreApproval = false): string {
  return checks
    .filter((c) => !c.ok && !(ignoreApproval && c.id === "approval"))
    .map((c) => `${c.label}: ${c.detail}`)
    .join(" ");
}
