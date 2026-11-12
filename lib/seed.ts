// The demo project every new workspace starts from. Pure: safe to import in the browser.

import { addDays, iso } from "./dates";
import { reflow, refreshGates } from "./schedule";
import type { Gate, ISODate, Person, Task, Workspace } from "./types";

export interface SeedOptions {
  id?: string;
  today?: ISODate;
  mode?: Workspace["mode"];
  clientEmail?: string;
  /** PayPal emails for the three crew members, in order. */
  crewEmails?: string[];
}

export const DEFAULT_CLIENT_EMAIL = "client@northwind-coffee.example";
export const DEFAULT_CREW_EMAILS = [
  "maya@tranche-crew.example",
  "dev@tranche-crew.example",
  "lena@tranche-crew.example",
];

export function makeSeed(opts: SeedOptions = {}): Workspace {
  const today = opts.today ?? iso(new Date());
  const emails = opts.crewEmails && opts.crewEmails.length >= 3 ? opts.crewEmails : DEFAULT_CREW_EMAILS;

  const crew: Person[] = [
    { id: "maya", name: "Maya Okafor", role: "Brand strategist", email: emails[0], color: "#B7791F" },
    { id: "dev", name: "Dev Raman", role: "Designer", email: emails[1], color: "#3B5BDB" },
    { id: "lena", name: "Lena Fischer", role: "Developer", email: emails[2], color: "#0B6E4F" },
  ];

  const gates: Gate[] = [
    { id: "g0", phaseId: "p1", name: "Kickoff deposit", kind: "deposit", amount: 1000, netDays: 0, status: "ready", remindersSent: 0 },
    { id: "g1", phaseId: "p1", name: "Discovery sign-off", kind: "milestone", amount: 2400, netDays: 3, status: "locked", remindersSent: 0 },
    { id: "g2", phaseId: "p2", name: "Design approval", kind: "milestone", amount: 3600, netDays: 3, status: "locked", remindersSent: 0 },
    { id: "g3", phaseId: "p3", name: "Launch payment", kind: "milestone", amount: 5000, netDays: 3, status: "locked", remindersSent: 0 },
  ];

  const w = (
    id: string,
    phaseId: string,
    name: string,
    durationDays: number,
    assigneeId: string,
    fee: number,
    deps: string[],
  ): Task => ({ id, phaseId, name, kind: "work", start: today, durationDays, percentDone: 0, deps, baselineStart: today, assigneeId, fee });

  const g = (id: string, gate: Gate, deps: string[]): Task => ({
    id,
    phaseId: gate.phaseId,
    name: gate.name,
    kind: "gate",
    start: today,
    durationDays: 0,
    percentDone: 0,
    deps,
    baselineStart: today,
    gateId: gate.id,
  });

  const tasks: Task[] = [
    g("t_g0", gates[0], []),
    w("t1", "p1", "Kickoff workshop", 2, "maya", 300, ["t_g0"]),
    w("t2", "p1", "Brand direction", 4, "maya", 700, ["t1"]),
    w("t3", "p1", "Sitemap and wireframes", 3, "dev", 600, ["t1"]),
    g("t_g1", gates[1], ["t2", "t3"]),
    w("t4", "p2", "Visual design", 6, "dev", 1400, ["t_g1"]),
    w("t5", "p2", "Clickable prototype", 3, "lena", 500, ["t4"]),
    w("t6", "p2", "Design review round", 2, "maya", 300, ["t4"]),
    g("t_g2", gates[2], ["t5", "t6"]),
    w("t7", "p3", "Build", 8, "lena", 1800, ["t_g2"]),
    w("t8", "p3", "Content and SEO", 4, "maya", 500, ["t_g2"]),
    w("t9", "p3", "QA and launch", 3, "lena", 600, ["t7", "t8"]),
    g("t_g3", gates[3], ["t9"]),
  ];

  const ws: Workspace = {
    v: 1,
    id: opts.id ?? "ws_demo",
    rev: 0,
    createdAt: new Date(`${today}T09:00:00Z`).toISOString(),
    today,
    mode: opts.mode ?? "mock",
    project: {
      name: "Brand site for Northwind Coffee",
      client: { name: "Northwind Coffee Co.", email: opts.clientEmail ?? DEFAULT_CLIENT_EMAIL },
      studio: "Paper Lantern Studio",
      currency: "USD",
      start: today,
    },
    crew,
    phases: [
      { id: "p1", name: "Discovery", order: 1 },
      { id: "p2", name: "Design", order: 2 },
      { id: "p3", name: "Build and launch", order: 3 },
    ],
    tasks,
    gates,
    notes: [],
    mandate: null,
    proposals: [],
    receipts: [],
    events: [],
    seq: { proposal: 0, event: 0, note: 0, invoice: 0 },
  };

  // First pass gives the original plan; freeze it as the baseline.
  planBaseline(ws);
  refreshGates(ws);
  reflow(ws);
  return ws;
}

/** Schedule as if every client paid on the due date, and keep that as the baseline. */
function planBaseline(ws: Workspace) {
  reflow(ws);
  for (const t of ws.tasks) t.baselineStart = t.start;
}

/**
 * A workspace part-way through the project, for building and testing the board and the books
 * without calling PayPal. Not used by the live app: ids here are made up and labelled SAMPLE.
 */
export function makeSampleInProgress(today?: ISODate): Workspace {
  const start = addDays(today ?? iso(new Date()), -16);
  const ws = makeSeed({ id: "ws_sample", today: start, mode: "mock" });
  const set = (id: string, patch: Partial<Gate>) => Object.assign(ws.gates.find((x) => x.id === id) as Gate, patch);
  const done = (ids: string[]) => ws.tasks.filter((t) => ids.includes(t.id)).forEach((t) => (t.percentDone = 100));

  set("g0", { status: "paid", paidAt: start, orderId: "SAMPLE-ORDER-0", authorizationId: "SAMPLE-AUTH-0", captureId: "SAMPLE-CAP-0" });
  done(["t1", "t2", "t3"]);
  set("g1", {
    status: "paid",
    invoiceId: "INV2-SAMPLE-0001",
    invoiceNumber: "TR-0001",
    invoicedAt: addDays(start, 6),
    due: addDays(start, 9),
    paidAt: addDays(start, 7),
  });
  ws.today = addDays(start, 16);
  reflow(ws);
  const t4 = ws.tasks.find((t) => t.id === "t4") as Task;
  t4.percentDone = 100;
  reflow(ws);
  done(["t5", "t6"]);
  set("g2", {
    status: "overdue",
    invoiceId: "INV2-SAMPLE-0002",
    invoiceNumber: "TR-0002",
    invoicedAt: addDays(start, 12),
    due: addDays(start, 15),
    remindersSent: 1,
    lastReminderAt: addDays(start, 16),
    expected: addDays(start, 19),
  });
  ws.mandate = {
    id: "m_sample",
    signedBy: "Sam Rivera",
    signedAt: new Date(`${start}T09:30:00Z`).toISOString(),
    expiresAt: addDays(start, 45),
    perPayoutCap: 2500,
    totalBudget: 7000,
    payees: ws.crew.map((c) => c.email.toLowerCase()),
    purpose: "Crew fees for the Northwind Coffee brand site",
    rule: "collected-first",
    sig: "SAMPLE",
  };
  ws.receipts = [
    {
      seq: 1,
      at: new Date(`${addDays(start, 7)}T11:00:00Z`).toISOString(),
      proposalId: "p1",
      mandateId: "m_sample",
      approvedBy: "Sam Rivera",
      batchId: "ws_sample-p1",
      payoutBatchId: "SAMPLE-BATCH-1",
      status: "SUCCESS",
      items: [
        { email: ws.crew[0].email, name: ws.crew[0].name, amount: 1000, memo: "Discovery: workshop and brand direction", status: "SUCCESS" },
        { email: ws.crew[1].email, name: ws.crew[1].name, amount: 600, memo: "Discovery: sitemap and wireframes", status: "SUCCESS" },
      ],
      total: 1600,
      prevHash: "0",
      hash: "SAMPLE",
    },
  ];
  ws.proposals = [
    {
      id: "p1",
      createdAt: new Date(`${addDays(start, 7)}T10:55:00Z`).toISOString(),
      createdBy: "agent",
      reason: "Discovery is paid. Splitting the crew fees for the delivered Discovery tasks.",
      items: ws.receipts[0].items.map(({ email, name, amount, memo }) => ({ email, name, amount, memo })),
      total: 1600,
      hash: "SAMPLE",
      status: "paid",
      checks: [],
      receiptSeq: 1,
    },
  ];
  ws.notes = [
    {
      id: "n1",
      at: new Date(`${addDays(start, 13)}T08:00:00Z`).toISOString(),
      author: "Dev Raman",
      authorRole: "crew",
      taskId: "t4",
      text: "Visual design is done. Two homepage directions are in the shared folder.",
    },
  ];
  ws.events = [
    { id: "e1", at: ws.receipts[0].at, day: addDays(start, 7), actor: "paypal", level: "good", text: "Discovery sign-off paid ($2,400).", ref: "INV2-SAMPLE-0001" },
    { id: "e2", at: ws.receipts[0].at, day: addDays(start, 7), actor: "human", level: "good", text: "Sam approved a $1,600 crew payout.", ref: "SAMPLE-BATCH-1" },
    { id: "e3", at: new Date().toISOString(), day: ws.today, actor: "agent", level: "warn", text: "Design approval invoice is 1 day late. Reminder sent, Build moved to start after the expected payment date." },
  ];
  ws.seq = { proposal: 1, event: 3, note: 1, invoice: 2 };
  refreshGates(ws);
  reflow(ws);
  return ws;
}
