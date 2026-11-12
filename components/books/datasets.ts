// Books datasets: pure functions that turn a Workspace into flat row sets.
// Nothing here stores money twice: every number is derived from the workspace with the same helpers the
// rest of the app uses (lib/schedule.ts), so Books can never disagree with the board.

import { diffDays, round2 } from "@/lib/dates";
import { collected, contractTotal, crewLedger, heldAmount, isUnlocked, outstanding, paidOut, taskEnd } from "@/lib/schedule";
import type { AgentEvent, Gate, GateStatus, Workspace } from "@/lib/types";

// ---------- labels ----------

export const GATE_STATUS_LABEL: Record<GateStatus, string> = {
  locked: "Locked",
  ready: "Ready to invoice",
  invoiced: "Invoiced",
  held: "Held by PayPal",
  paid: "Paid",
  overdue: "Overdue",
};

/** The five colour groups used everywhere in Books. */
export type Tone = "green" | "amber" | "red" | "blue" | "grey";

export const GATE_STATUS_TONE: Record<GateStatus, Tone> = {
  paid: "green",
  invoiced: "amber",
  ready: "amber",
  overdue: "red",
  held: "blue",
  locked: "grey",
};

const ACTOR_LABEL: Record<AgentEvent["actor"], string> = {
  agent: "Agent",
  human: "Person",
  paypal: "PayPal",
  gate: "Payout gate",
  system: "System",
};

const LEVEL_LABEL: Record<AgentEvent["level"], string> = {
  info: "Info",
  good: "Good",
  warn: "Warning",
  bad: "Problem",
};

const PAYOUT_NOT_COUNTED = ["DENIED", "CANCELED"];

/** "SUCCESS" -> "Success", "UNCLAIMED" -> "Unclaimed". */
function sentence(s: string | undefined): string {
  if (!s) return "";
  const t = s.replace(/_/g, " ").toLowerCase();
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/** Tone for any status text shown in a grid (gate statuses, PayPal payout statuses, event levels). */
export function toneForStatus(label: string | null | undefined): Tone {
  const s = (label ?? "").toLowerCase();
  if (!s) return "grey";
  if (["paid", "success", "completed", "good", "signed", "yes"].includes(s)) return "green";
  if (["overdue", "problem", "failed", "denied", "canceled", "cancelled", "returned", "blocked", "refunded", "reversed", "expired"].includes(s)) return "red";
  if (["held by paypal", "held", "onhold", "on hold"].includes(s)) return "blue";
  if (["invoiced", "ready to invoice", "ready", "pending", "processing", "unclaimed", "warning", "new"].includes(s)) return "amber";
  return "grey";
}

// ---------- receivables: one row per payment gate ----------

export interface ReceivableRow {
  id: string;
  gate: string;
  phase: string;
  kind: "Deposit" | "Invoice";
  amount: number;
  status: string;
  /** Amount split by colour group, so a stacked chart can colour each gate by its status. */
  paidAmount: number;
  waitingAmount: number;
  overdueAmount: number;
  heldAmount: number;
  lockedAmount: number;
  /** Invoiced or overdue: sent to the client and still unpaid. */
  outstandingAmount: number;
  invoicedOn: string | null;
  due: string | null;
  paidOn: string | null;
  daysLate: number | null;
  reminders: number;
  paypalRef: string;
}

function daysLate(g: Gate, today: string): number | null {
  if (!g.due) return null;
  if (g.status === "paid") return g.paidAt ? Math.max(0, diffDays(g.due, g.paidAt)) : 0;
  if (g.status === "invoiced" || g.status === "overdue" || g.status === "held") return Math.max(0, diffDays(g.due, today));
  return null;
}

export function receivableRows(ws: Workspace): ReceivableRow[] {
  const phaseName = new Map(ws.phases.map((p) => [p.id, p.name]));
  return ws.gates.map((g) => {
    const tone = GATE_STATUS_TONE[g.status];
    const only = (t: Tone) => (tone === t ? g.amount : 0);
    return {
      id: g.id,
      gate: g.name,
      phase: phaseName.get(g.phaseId) ?? g.phaseId,
      kind: g.kind === "deposit" ? "Deposit" : "Invoice",
      amount: g.amount,
      status: GATE_STATUS_LABEL[g.status],
      paidAmount: only("green"),
      waitingAmount: only("amber"),
      overdueAmount: only("red"),
      heldAmount: only("blue"),
      lockedAmount: only("grey"),
      outstandingAmount: g.status === "invoiced" || g.status === "overdue" ? g.amount : 0,
      invoicedOn: g.invoicedAt ?? null,
      due: g.due ?? null,
      paidOn: g.paidAt ?? null,
      daysLate: daysLate(g, ws.today),
      reminders: g.remindersSent,
      paypalRef: g.kind === "deposit" ? (g.orderId ?? "") : (g.invoiceNumber ?? g.invoiceId ?? ""),
    };
  });
}

// ---------- crew ledger: one row per crew member ----------

export interface CrewRow {
  id: string;
  name: string;
  role: string;
  email: string;
  earned: number;
  paid: number;
  owed: number;
  waitingOnClient: number;
}

export function crewRows(ws: Workspace): CrewRow[] {
  const role = new Map(ws.crew.map((p) => [p.id, p.role]));
  return crewLedger(ws).map((l) => ({
    id: l.personId,
    name: l.name,
    role: role.get(l.personId) ?? "",
    email: l.email,
    earned: l.earned,
    paid: l.paid,
    owed: l.owed,
    waitingOnClient: l.waitingOnClient,
  }));
}

// ---------- payouts: one row per receipt item ----------

export interface PayoutRow {
  id: string;
  receipt: string;
  date: string;
  payee: string;
  email: string;
  amount: number;
  memo: string;
  batchId: string;
  status: string;
  approvedBy: string;
}

export function payoutRows(ws: Workspace): PayoutRow[] {
  return ws.receipts.flatMap((r) =>
    r.items.map((item, i) => ({
      id: `${r.seq}-${i}`,
      receipt: `No. ${r.seq}`,
      date: r.at.slice(0, 10),
      payee: item.name,
      email: item.email,
      amount: item.amount,
      memo: item.memo,
      batchId: r.payoutBatchId,
      status: sentence(item.status ?? r.status),
      approvedBy: r.approvedBy,
    })),
  );
}

// ---------- tasks: one row per piece of work ----------

export interface TaskRow {
  id: string;
  phase: string;
  task: string;
  assignee: string;
  fee: number;
  /** 0 to 1. */
  percentDone: number;
  start: string;
  end: string;
  baselineStart: string;
  slipDays: number;
  waitingOnPayment: boolean;
}

export function taskRows(ws: Workspace): TaskRow[] {
  const phaseName = new Map(ws.phases.map((p) => [p.id, p.name]));
  const personName = new Map(ws.crew.map((p) => [p.id, p.name]));
  return ws.tasks
    .filter((t) => t.kind === "work")
    .map((t) => ({
      id: t.id,
      phase: phaseName.get(t.phaseId) ?? t.phaseId,
      task: t.name,
      assignee: (t.assigneeId && personName.get(t.assigneeId)) || "",
      fee: t.fee ?? 0,
      percentDone: Math.max(0, Math.min(100, t.percentDone)) / 100,
      start: t.start,
      end: taskEnd(t),
      baselineStart: t.baselineStart,
      slipDays: diffDays(t.baselineStart, t.start),
      waitingOnPayment: t.percentDone < 100 && !isUnlocked(ws, t),
    }));
}

// ---------- activity: one row per event ----------

export interface ActivityRow {
  id: string;
  day: string;
  actor: string;
  level: string;
  text: string;
  reference: string;
}

export function activityRows(ws: Workspace): ActivityRow[] {
  return ws.events.map((e) => ({
    id: e.id,
    day: e.day,
    actor: ACTOR_LABEL[e.actor] ?? e.actor,
    level: LEVEL_LABEL[e.level] ?? e.level,
    text: e.text,
    reference: e.ref ?? "",
  }));
}

// ---------- mandate: always exactly one row, signed or not ----------

export const MANDATE_RULE = "Money is collected from the client before it is paid out.";

export interface MandateView {
  signed: boolean;
  expired: boolean;
  status: "Signed" | "Expired" | "Not signed";
  signedBy: string;
  signedOn: string | null;
  expiresOn: string | null;
  daysLeft: number | null;
  perPayoutCap: number;
  totalBudget: number;
  paidOut: number;
  remaining: number;
  /** 0 to 1. */
  budgetUsed: number;
  payees: { email: string; name: string }[];
  purpose: string;
  rule: string;
}

export function mandateView(ws: Workspace): MandateView {
  const m = ws.mandate;
  const out = paidOut(ws);
  if (!m) {
    return {
      signed: false,
      expired: false,
      status: "Not signed",
      signedBy: "",
      signedOn: null,
      expiresOn: null,
      daysLeft: null,
      perPayoutCap: 0,
      totalBudget: 0,
      paidOut: out,
      remaining: 0,
      budgetUsed: 0,
      payees: [],
      purpose: "",
      rule: MANDATE_RULE,
    };
  }
  const expired = ws.today > m.expiresAt;
  const byEmail = new Map(ws.crew.map((p) => [p.email.toLowerCase(), p.name]));
  return {
    signed: true,
    expired,
    status: expired ? "Expired" : "Signed",
    signedBy: m.signedBy,
    signedOn: m.signedAt.slice(0, 10),
    expiresOn: m.expiresAt,
    daysLeft: diffDays(ws.today, m.expiresAt),
    perPayoutCap: m.perPayoutCap,
    totalBudget: m.totalBudget,
    paidOut: out,
    remaining: round2(Math.max(0, m.totalBudget - out)),
    budgetUsed: m.totalBudget > 0 ? Math.min(1, out / m.totalBudget) : 0,
    payees: m.payees.map((email) => ({ email, name: byEmail.get(email.toLowerCase()) ?? "" })),
    purpose: m.purpose,
    rule: MANDATE_RULE,
  };
}

export interface MandateRow {
  id: string;
  status: string;
  signedBy: string;
  signedOn: string | null;
  expiresOn: string | null;
  perPayoutCap: number;
  totalBudget: number;
  paidOut: number;
  remaining: number;
  allowedPayees: string;
  payeeCount: number;
  rule: string;
  purpose: string;
}

export function mandateRows(ws: Workspace): MandateRow[] {
  const v = mandateView(ws);
  return [
    {
      id: "mandate",
      status: v.status,
      signedBy: v.signedBy,
      signedOn: v.signedOn,
      expiresOn: v.expiresOn,
      perPayoutCap: v.perPayoutCap,
      totalBudget: v.totalBudget,
      paidOut: v.paidOut,
      remaining: v.remaining,
      allowedPayees: v.payees.map((p) => (p.name ? `${p.name} (${p.email})` : p.email)).join(", "),
      payeeCount: v.payees.length,
      rule: v.rule,
      purpose: v.purpose,
    },
  ];
}

// ---------- summary: the headline numbers, always exactly one row ----------

export interface SummaryRow {
  id: string;
  project: string;
  client: string;
  today: string;
  contractValue: number;
  collected: number;
  outstanding: number;
  heldByPayPal: number;
  notYetInvoiced: number;
  paidToCrew: number;
  /** Collected minus paid out. */
  keptByStudio: number;
  owedToCrew: number;
  crewWaitingOnClient: number;
}

export function summaryRow(ws: Workspace): SummaryRow {
  const total = contractTotal(ws);
  const got = collected(ws);
  const open = outstanding(ws);
  const held = heldAmount(ws);
  const out = paidOut(ws);
  const ledger = crewLedger(ws);
  return {
    id: "summary",
    project: ws.project.name,
    client: ws.project.client.name,
    today: ws.today,
    contractValue: total,
    collected: got,
    outstanding: open,
    heldByPayPal: held,
    notYetInvoiced: round2(Math.max(0, total - got - open - held)),
    paidToCrew: out,
    keptByStudio: round2(got - out),
    owedToCrew: round2(ledger.reduce((s, l) => s + l.owed, 0)),
    crewWaitingOnClient: round2(ledger.reduce((s, l) => s + l.waitingOnClient, 0)),
  };
}

// ---------- everything at once ----------

export interface BooksDatasets {
  summary: SummaryRow[];
  receivables: ReceivableRow[];
  crew: CrewRow[];
  payouts: PayoutRow[];
  tasks: TaskRow[];
  activity: ActivityRow[];
  mandate: MandateRow[];
}

export function buildDatasets(ws: Workspace): BooksDatasets {
  return {
    summary: [summaryRow(ws)],
    receivables: receivableRows(ws),
    crew: crewRows(ws),
    payouts: payoutRows(ws),
    tasks: taskRows(ws),
    activity: activityRows(ws),
    mandate: mandateRows(ws),
  };
}

/** PayPal statuses that mean a payout did not happen (kept in sync with lib/schedule.ts paidOut). */
export function payoutCounted(status: string): boolean {
  return !PAYOUT_NOT_COUNTED.includes(status.toUpperCase());
}
