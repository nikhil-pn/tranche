// Shared data contract for Tranche.
// The whole workspace travels with the browser (signed by the server), so keep it small and plain JSON.

export type ISODate = string; // "YYYY-MM-DD"
export type ISODateTime = string;

export interface Person {
  id: string;
  name: string;
  role: string;
  /** PayPal email the crew member is paid at. */
  email: string;
  color: string;
}

export interface Phase {
  id: string;
  name: string;
  order: number;
}

export interface Task {
  id: string;
  phaseId: string;
  name: string;
  kind: "work" | "gate";
  /** Current scheduled start. For a gate this is the day the money is expected (or arrived). */
  start: ISODate;
  /** Calendar days. Gates are milestones (0). */
  durationDays: number;
  percentDone: number;
  /** Finish-to-start predecessors (task ids). */
  deps: string[];
  /** Original plan, kept so the board can show how far a late payment pushed things. */
  baselineStart: ISODate;
  assigneeId?: string;
  /** What the crew member earns for this task (USD). Work tasks only. */
  fee?: number;
  /** Gate tasks only. */
  gateId?: string;
}

export type GateStatus =
  | "locked" // work before it is not delivered yet
  | "ready" // delivered, nothing sent to the client yet
  | "invoiced" // PayPal invoice (or hold request) sent, waiting for the client
  | "held" // deposit only: client approved, PayPal is holding the funds
  | "paid" // money collected
  | "overdue"; // sent, past its due date, still unpaid

export interface Gate {
  id: string;
  phaseId: string;
  name: string;
  /** deposit = PayPal Orders v2 authorise and capture. milestone = PayPal invoice. */
  kind: "deposit" | "milestone";
  amount: number;
  /** Payment terms in days, counted from the day the invoice is sent. */
  netDays: number;
  status: GateStatus;
  due?: ISODate;
  /** Set when the agent replans around a late payment. */
  expected?: ISODate;
  invoiceId?: string;
  invoiceNumber?: string;
  payUrl?: string;
  invoicedAt?: ISODate;
  paidAt?: ISODate;
  remindersSent: number;
  lastReminderAt?: ISODate;
  /** Deposit only. */
  orderId?: string;
  authorizationId?: string;
  captureId?: string;
}

/** Free text written by people. Always treated as data, never as instructions. */
export interface Note {
  id: string;
  at: ISODateTime;
  author: string;
  authorRole: "crew" | "client" | "outside";
  taskId?: string;
  text: string;
  /** Set by the agent when the text tries to give it orders. */
  flagged?: string;
}

export interface Mandate {
  id: string;
  signedBy: string;
  signedAt: ISODateTime;
  /** Last day the mandate is valid (demo clock). */
  expiresAt: ISODate;
  perPayoutCap: number;
  totalBudget: number;
  /** Lower-case PayPal emails that may be paid. */
  payees: string[];
  purpose: string;
  /** Money must be collected from the client before it is paid out. */
  rule: "collected-first";
  /** Server signature over the fields above. */
  sig: string;
}

export interface PayoutItem {
  email: string;
  name: string;
  amount: number;
  memo: string;
}

export interface Check {
  id:
    | "mandate"
    | "expiry"
    | "payees"
    | "cap"
    | "budget"
    | "collected"
    | "single-use"
    | "approval";
  label: string;
  ok: boolean;
  detail: string;
}

export interface PayoutProposal {
  id: string;
  createdAt: ISODateTime;
  /** "agent" = proposed by the model. "red-team" = forged on purpose to test the gate. */
  createdBy: "agent" | "red-team";
  reason: string;
  items: PayoutItem[];
  total: number;
  /** Hash of the items, total and mandate id. The human approval is bound to this. */
  hash: string;
  status: "pending" | "paid" | "rejected" | "refused";
  /** Result of the last run of the authorisation gate. */
  checks: Check[];
  decidedAt?: ISODateTime;
  receiptSeq?: number;
}

export interface PayoutReceipt {
  seq: number;
  at: ISODateTime;
  proposalId: string;
  mandateId: string;
  approvedBy: string;
  /** Our idempotency key (PayPal sender_batch_id). */
  batchId: string;
  /** PayPal's payout_batch_id. */
  payoutBatchId: string;
  status: string;
  items: (PayoutItem & { itemId?: string; status?: string })[];
  total: number;
  /** Hash chain: each receipt commits to the one before it. */
  prevHash: string;
  hash: string;
}

export interface AgentEvent {
  id: string;
  at: ISODateTime;
  /** Demo-clock day the event happened on. */
  day: ISODate;
  actor: "agent" | "human" | "paypal" | "gate" | "system";
  level: "info" | "good" | "warn" | "bad";
  text: string;
  /** A PayPal id or link worth showing next to the line. */
  ref?: string;
}

export interface Workspace {
  v: 1;
  id: string;
  rev: number;
  createdAt: ISODateTime;
  /** Demo clock. Moves only when the user advances it. */
  today: ISODate;
  /** sandbox = real PayPal sandbox calls. mock = no PayPal credentials on the server (development only). */
  mode: "sandbox" | "mock";
  project: {
    name: string;
    client: { name: string; email: string };
    studio: string;
    currency: "USD";
    start: ISODate;
  };
  crew: Person[];
  phases: Phase[];
  tasks: Task[];
  gates: Gate[];
  notes: Note[];
  mandate: Mandate | null;
  proposals: PayoutProposal[];
  receipts: PayoutReceipt[];
  events: AgentEvent[];
  /** Simple counters so ids are stable and readable. */
  seq: { proposal: number; event: number; note: number; invoice: number };
}

/** Every API call carries the signed workspace and gets the next signed workspace back. */
export interface Envelope {
  ws: Workspace;
  sig: string;
}
