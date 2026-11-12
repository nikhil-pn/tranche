// Pure mapping from a Tranche Workspace to Bryntum Gantt project data.
// No Bryntum import here on purpose: this file is plain data in, plain data out, so it is easy to test.
//
// How the plan is handed to Bryntum's scheduling engine (the engine computes the dates, not us):
// - Work that has not started gets a duration and finish-to-start dependencies only. No start date.
// - Work that has started or finished carries its actual start and is marked `manuallyScheduled`,
//   so Bryntum keeps it where it really began and only computes its end from the duration.
// - A payment gate is a zero-duration milestone. While the money is outstanding it carries a
//   "start no earlier than" constraint on the first day the money can clear: the invoice due date,
//   the date the agent replanned to, or today, whichever is latest. Moving that one date is what
//   makes everything behind the gate slide.
// - Payment terms on a gate that has not been invoiced yet are dependency lag ("Net 3" = 3 days of lag).
// - Money that arrived is history: the milestone is pinned on the day it was paid.

import { addDays, fmtDay, maxDate, usd } from "@/lib/dates";
import { gateOf, gateOpen, isUnlocked } from "@/lib/schedule";
import type { Gate, GateStatus, ISODate, Person, Task, Workspace } from "@/lib/types";

export type RowKind = "phase" | "work" | "gate";

export interface BBaseline {
  startDate: ISODate;
  endDate: ISODate;
}

/** One row of the task tree. Dates are "YYYY-MM-DD" strings; the component turns them into local Dates. */
export interface BTask {
  id: string;
  name: string;
  kind: RowKind;
  expanded?: boolean;
  children?: BTask[];
  /** Only set for rows whose date is a fact (started work, money that arrived). */
  startDate?: ISODate;
  duration?: number;
  durationUnit?: "day";
  percentDone?: number;
  manuallyScheduled?: boolean;
  constraintType?: "startnoearlierthan" | null;
  constraintDate?: ISODate | null;
  baselines: BBaseline[];
  /** Per-task switches read by Bryntum's drag and resize features. */
  draggable: boolean;
  resizable: boolean;
  rollup?: boolean;
  /** Fee for work, amount for gates, billed total for a phase. */
  money: number;
  /** Text drawn next to the bar ("$3,600 · overdue"). Empty for work. */
  label: string;
  /** Gate rows only. */
  gateStatus?: GateStatus;
  /** Work rows only: a payment gate directly in front of this task is still closed. */
  waiting?: boolean;
  /** Work rows only: name of the closed payment gate this task waits for. */
  waitingOn?: string;
  /** Work rows only: the assignee's colour. */
  color?: string;
  /** Bar colour handed to Bryntum (`eventColor`). */
  eventColor?: string;
  /** Icon drawn inside the bar (`taskIconCls`). A lock while the task waits for money. */
  taskIconCls?: string;
  /** Gate rows only: the invoice due date, drawn as a small marker on the row. */
  due?: ISODate;
  /** The date our own engine computed, kept for the dev cross-check. */
  wsStart?: ISODate;
}

export interface BDependency {
  id: string;
  fromTask: string;
  toTask: string;
  /** 2 = finish-to-start */
  type: 2;
  lag: number;
  lagUnit: "day";
  cls: string;
}

export interface BResource {
  id: string;
  name: string;
  role: string;
  color: string;
  initials: string;
}

export interface BAssignment {
  id: string;
  event: string;
  resource: string;
  units: 100;
}

export interface BTimeRange {
  id: string;
  name: string;
  startDate: ISODate;
  endDate?: ISODate;
  cls: string;
}

export interface BryntumPlan {
  projectStart: ISODate;
  /** Where the time axis should start and end so the whole plan (and its baseline) fits with some air. */
  viewStart: ISODate;
  viewEnd: ISODate;
  tasks: BTask[];
  dependencies: BDependency[];
  resources: BResource[];
  assignments: BAssignment[];
  timeRanges: BTimeRange[];
}

export const phaseRowId = (phaseId: string) => `phase_${phaseId}`;

export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase() ?? "")
    .join("");
}

/** Short plain-English status shown next to a gate diamond. */
export function gateLabel(g: Gate, t: Task): string {
  const amount = usd(g.amount);
  switch (g.status) {
    case "paid":
      return `${amount} · paid ${fmtDay(g.paidAt ?? t.start)}`;
    case "held":
      return `${amount} · held by PayPal`;
    case "overdue":
      return `${amount} · overdue`;
    case "invoiced":
      return g.due ? `${amount} · invoiced, due ${fmtDay(g.due)}` : `${amount} · invoiced`;
    case "ready":
      return `${amount} · ready to ${g.kind === "deposit" ? "request" : "invoice"}`;
    case "locked":
    default:
      return `${amount} · not due yet`;
  }
}

/** The money has arrived (or is held) on a known day, so the gate is history. */
export function gateArrived(g: Gate | undefined): boolean {
  return !!g && gateOpen(g) && !!g.paidAt;
}

/** Days of dependency lag in front of a gate: its payment terms, until an invoice fixes a real due date. */
export function gateLag(g: Gate | undefined): number {
  if (!g || gateArrived(g) || g.due || g.kind === "deposit") return 0;
  return Math.max(0, g.netDays);
}

/** The first day an outstanding payment can clear. Undefined when nothing holds the gate but its predecessors. */
export function gateFloor(ws: Workspace, g: Gate | undefined): ISODate | undefined {
  if (!g || gateArrived(g)) return undefined;
  const floors = [g.due, g.expected, g.status === "locked" ? undefined : ws.today].filter(Boolean) as ISODate[];
  return floors.length ? maxDate(...floors) : undefined;
}

/** Colours shared with the stylesheet (same values as the tokens in app/globals.css). */
export const GATE_COLOR: Record<GateStatus, string> = {
  locked: "#8a8f99",
  ready: "#b7791f",
  invoiced: "#b7791f",
  held: "#3b5bdb",
  paid: "#0b6e4f",
  overdue: "#b42318",
};
export const WAITING_COLOR = "#a9adb5";
export const PHASE_COLOR = "#16181d";

function workRow(ws: Workspace, t: Task, crew: Map<string, Person>, byId: Map<string, Task>): BTask {
  const started = t.percentDone > 0;
  const person = t.assigneeId ? crew.get(t.assigneeId) : undefined;
  const waiting = t.percentDone < 100 && !isUnlocked(ws, t);
  const closed = waiting
    ? t.deps
        .map((d) => byId.get(d))
        .filter((d): d is Task => !!d && d.kind === "gate")
        .map((d) => gateOf(ws, d))
        .find((g) => g && !gateOpen(g))
    : undefined;
  const color = person?.color ?? "#8a8f99";
  return {
    id: t.id,
    name: t.name,
    kind: "work",
    // Started work keeps the day it really began. Everything else is left to the engine.
    startDate: started ? t.start : undefined,
    duration: t.durationDays,
    durationUnit: "day",
    percentDone: t.percentDone,
    manuallyScheduled: started,
    constraintType: null,
    constraintDate: null,
    baselines: [{ startDate: t.baselineStart, endDate: addDays(t.baselineStart, t.durationDays) }],
    draggable: false,
    resizable: t.percentDone < 100,
    money: t.fee ?? 0,
    label: "",
    waiting,
    waitingOn: closed?.name,
    color,
    eventColor: waiting ? WAITING_COLOR : color,
    taskIconCls: waiting ? "fa fa-lock" : "",
    wsStart: t.start,
  };
}

function gateRow(ws: Workspace, t: Task): BTask {
  const g = gateOf(ws, t);
  // A gate task without a gate record is left exactly where the workspace has it.
  const pinned = !g || gateArrived(g);
  const floor = gateFloor(ws, g);
  return {
    id: t.id,
    name: t.name,
    kind: "gate",
    startDate: pinned ? t.start : undefined,
    duration: 0,
    durationUnit: "day",
    percentDone: t.percentDone,
    manuallyScheduled: pinned,
    constraintType: floor ? "startnoearlierthan" : null,
    constraintDate: floor ?? null,
    baselines: [{ startDate: t.baselineStart, endDate: t.baselineStart }],
    draggable: false,
    resizable: false,
    rollup: true,
    money: g?.amount ?? 0,
    label: g ? gateLabel(g, t) : "",
    gateStatus: g?.status ?? "locked",
    eventColor: GATE_COLOR[g?.status ?? "locked"],
    taskIconCls: "",
    due: g && !gateArrived(g) ? g.due : undefined,
    wsStart: t.start,
  };
}

export function toBryntum(ws: Workspace): BryntumPlan {
  const crew = new Map(ws.crew.map((p) => [p.id, p]));
  const byId = new Map(ws.tasks.map((t) => [t.id, t]));

  const rows = new Map<string, BTask>();
  for (const t of ws.tasks) rows.set(t.id, t.kind === "gate" ? gateRow(ws, t) : workRow(ws, t, crew, byId));

  const tasks: BTask[] = [...ws.phases]
    .sort((a, b) => a.order - b.order)
    .map((p) => {
      const children = ws.tasks.filter((t) => t.phaseId === p.id).map((t) => rows.get(t.id) as BTask);
      const starts = children.flatMap((c) => c.baselines.map((b) => b.startDate));
      const ends = children.flatMap((c) => c.baselines.map((b) => b.endDate));
      const billed = ws.gates.filter((g) => g.phaseId === p.id).reduce((s, g) => s + g.amount, 0);
      return {
        id: phaseRowId(p.id),
        name: p.name,
        kind: "phase" as const,
        expanded: true,
        children,
        baselines: starts.length
          ? [{ startDate: starts.reduce((m, d) => (d < m ? d : m)), endDate: maxDate(...ends) }]
          : [],
        draggable: false,
        resizable: false,
        money: billed,
        label: "",
        eventColor: PHASE_COLOR,
      };
    });

  const dependencies: BDependency[] = [];
  for (const t of ws.tasks) {
    const lag = t.kind === "gate" ? gateLag(gateOf(ws, t)) : 0;
    for (const from of t.deps) {
      const pred = byId.get(from);
      if (!pred) continue;
      dependencies.push({
        id: `${from}->${t.id}`,
        fromTask: from,
        toTask: t.id,
        type: 2,
        lag,
        lagUnit: "day",
        cls: pred.kind === "gate" ? "tr-dep-money" : "tr-dep-work",
      });
    }
  }

  const resources: BResource[] = ws.crew.map((p) => ({
    id: p.id,
    name: p.name,
    role: p.role,
    color: p.color,
    initials: initials(p.name),
  }));

  const assignments: BAssignment[] = ws.tasks
    .filter((t) => t.kind === "work" && t.assigneeId && crew.has(t.assigneeId))
    .map((t) => ({ id: `a_${t.id}`, event: t.id, resource: t.assigneeId as string, units: 100 }));

  const timeRanges: BTimeRange[] = [{ id: "today", name: "Today", startDate: ws.today, cls: "tr-today" }];
  for (const g of ws.gates) {
    if (gateOpen(g) || !g.due) continue;
    const t = ws.tasks.find((x) => x.gateId === g.id);
    if (!t || t.start <= g.due) continue;
    // The days between the due date and the day the money is now expected.
    timeRanges.push({ id: `late_${g.id}`, name: "Late payment", startDate: g.due, endDate: t.start, cls: "tr-late" });
  }

  let last = ws.project.start;
  for (const t of ws.tasks) {
    last = maxDate(last, addDays(t.start, t.durationDays), addDays(t.baselineStart, t.durationDays));
  }

  return {
    projectStart: ws.project.start,
    viewStart: addDays(ws.project.start, -3),
    viewEnd: addDays(last, 9),
    tasks,
    dependencies,
    resources,
    assignments,
    timeRanges,
  };
}

/** Flat list of every row in the tree (phases first, then their children). */
export function flattenRows(tasks: BTask[]): BTask[] {
  const out: BTask[] = [];
  const walk = (rows: BTask[]) => {
    for (const r of rows) {
      out.push(r);
      if (r.children) walk(r.children);
    }
  };
  walk(tasks);
  return out;
}

/** "YYYY-MM-DD" to a Date at local midnight, which is what Bryntum works in. */
export function toLocalDate(d: ISODate): Date {
  const [y, m, day] = d.split("-").map(Number);
  return new Date(y, m - 1, day);
}

/** Local Date back to "YYYY-MM-DD". Rounds to the nearest day so a daylight-saving hour cannot shift it. */
export function fromLocalDate(d: Date): ISODate {
  const r = new Date(d.getTime() + 12 * 3_600_000);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${r.getFullYear()}-${p(r.getMonth() + 1)}-${p(r.getDate())}`;
}
