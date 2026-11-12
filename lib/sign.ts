// Server only. Signatures and hashes that make the browser-carried workspace tamper-evident.
// HMAC-SHA256 with TRANCHE_STATE_SECRET. Nothing here is a blockchain: it is a keyed hash and a hash chain.

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { Mandate, PayoutItem, PayoutReceipt, Workspace } from "./types";

/** JSON with sorted keys, so the same data always gives the same bytes. */
export function canonical(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonical(o[k])}`)
    .join(",")}}`;
}

export function sha(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

function secret(): string {
  const s = process.env.TRANCHE_STATE_SECRET;
  if (!s || s.length < 16) throw new Error("TRANCHE_STATE_SECRET is not set on the server.");
  return s;
}

function hmac(domain: string, payload: string): string {
  return createHmac("sha256", secret()).update(`${domain}\n${payload}`).digest("hex");
}

function same(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function signWorkspace(ws: Workspace): string {
  return hmac("workspace", canonical(ws));
}

export function verifyWorkspace(ws: Workspace, sig: string): boolean {
  return typeof sig === "string" && same(signWorkspace(ws), sig);
}

type MandateFields = Omit<Mandate, "sig">;

function mandateFields(m: MandateFields): MandateFields {
  return {
    id: m.id,
    signedBy: m.signedBy,
    signedAt: m.signedAt,
    expiresAt: m.expiresAt,
    perPayoutCap: m.perPayoutCap,
    totalBudget: m.totalBudget,
    payees: [...m.payees].sort(),
    purpose: m.purpose,
    rule: m.rule,
  };
}

/** The mandate signature also commits to the workspace it was signed in. */
export function signMandate(wsId: string, m: MandateFields): string {
  return hmac("mandate", canonical({ wsId, ...mandateFields(m) }));
}

export function verifyMandate(wsId: string, m: Mandate): boolean {
  return typeof m.sig === "string" && same(signMandate(wsId, m), m.sig);
}

/** What the human approves: exactly these people, these amounts, under this mandate. */
export function proposalHash(items: PayoutItem[], total: number, mandateId: string | null): string {
  return sha(
    canonical({
      items: items.map((i) => ({ email: i.email.toLowerCase(), amount: i.amount, memo: i.memo })),
      total,
      mandateId,
    }),
  );
}

/** Receipts form a chain: each hash covers the receipt's fixed fields and the previous hash. */
export function receiptHash(r: Omit<PayoutReceipt, "hash">): string {
  return sha(
    canonical({
      seq: r.seq,
      at: r.at,
      proposalId: r.proposalId,
      mandateId: r.mandateId,
      approvedBy: r.approvedBy,
      batchId: r.batchId,
      payoutBatchId: r.payoutBatchId,
      items: r.items.map((i) => ({ email: i.email.toLowerCase(), amount: i.amount, memo: i.memo })),
      total: r.total,
      prevHash: r.prevHash,
    }),
  );
}

export function randomId(prefix: string, bytes = 5): string {
  const b = createHash("sha256")
    .update(`${Date.now()}-${Math.random()}-${process.hrtime.bigint()}`)
    .digest("hex");
  return `${prefix}_${b.slice(0, bytes * 2)}`;
}
