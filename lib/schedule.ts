// The plan engine: a small forward pass where payment gates are real dependencies.
// Deterministic, no AI. The agent can only move a gate's expected date; everything else follows from here.

import { addDays, diffDays, maxDate, round2 } from "./dates";
import type { Gate, ISODate, Task, Workspace } from "./types";

export function taskEnd(t: Task): ISODate {
  return addDays(t.start, t.durationDays);
}

export function gateOf(ws: Workspace, t: Task): Gate | undefined {
  return t.gateId ? ws.gates.find((g) => g.id === t.gateId) : undefined;
}

export function gateTask(ws: Workspace, gateId: string): Task | undefined {
  return ws.tasks.find((t) => t.gateId === gateId);
}

/** Money has arrived (or is held by PayPal for a deposit), so work behind this gate may start. */
export function gateOpen(g: Gate): boolean {
  return g.status === "paid" || g.status === "held";
}

/** A task is unlocked when every gate directly in front of it is open. */
export function isUnlocked(ws: Workspace, t: Task): boolean {
  return t.deps.every((id) => {
    const dep = ws.tasks.find((x) => x.id === id);
    if (!dep || dep.kind !== "gate") return true;
    const g = gateOf(ws, dep);
    return !g || gateOpen(g);
  });
}

function topo(tasks: Task[]): Task[] {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const seen = new Set<string>();
  const out: Task[] = [];
  const visit = (t: Task) => {
    if (seen.has(t.id)) return;
    seen.add(t.id);
    for (const d of t.deps) {
      const dep = byId.get(d);
      if (dep) visit(dep);
    }
    out.push(t);
  };
  tasks.forEach(visit);
  return out;
}

/**
 * Recompute every date that is not history yet.
 * - Work that has started keeps its start.
 * - An unpaid gate cannot clear before today, before its due date, or before the date the agent replanned to.
 * - Work behind a gate starts when the gate clears.
 */
export function reflow(ws: Workspace): Workspace {
  const byId = new Map(ws.tasks.map((t) => [t.id, t]));
  for (const t of topo(ws.tasks)) {
    const depEnds = t.deps.map((d) => byId.get(d)).filter(Boolean).map((d) => taskEnd(d as Task));
    const afterDeps = depEnds.length ? maxDate(...depEnds) : ws.project.start;

    if (t.kind === "gate") {
      const g = gateOf(ws, t);
      if (!g) continue;
      if (gateOpen(g) && g.paidAt) {
        t.start = g.paidAt;
        t.percentDone = 100;
      } else {
        const planned = g.due ?? addDays(afterDeps, g.kind === "deposit" ? 0 : g.netDays);
        t.start = maxDate(afterDeps, planned, g.expected, g.status === "locked" ? undefined : ws.today);
        t.percentDone = 0;
      }
      t.durationDays = 0;
    } else if (t.percentDone === 0) {
      t.start = afterDeps;
    }
  }
  return ws;
}

/** Refresh gate statuses from the plan (ready when delivered, overdue when past due). */
export function refreshGates(ws: Workspace): Workspace {
  for (const g of ws.gates) {
    const t = gateTask(ws, g.id);
    if (!t) continue;
    const delivered = t.deps.every((d) => {
      const dep = ws.tasks.find((x) => x.id === d);
      return !dep || dep.kind === "gate" || dep.percentDone >= 100;
    });
    if (g.status === "locked" && delivered) g.status = "ready";
    if (g.status === "invoiced" && g.due && ws.today > g.due) g.status = "overdue";
  }
  return ws;
}

/** Move the demo clock. Unlocked work progresses; locked work waits for its money. */
export function advanceClock(ws: Workspace, days: number): Workspace {
  ws.today = addDays(ws.today, days);
  // Several passes so that work finishing today can open the next task chain inside one jump
  // (a gate never opens by itself, so this cannot run past an unpaid gate).
  for (let pass = 0; pass < 4; pass++) {
    reflow(ws);
    for (const t of ws.tasks) {
      if (t.kind !== "work" || t.percentDone >= 100) continue;
      if (!isUnlocked(ws, t)) continue;
      const depsDone = t.deps.every((d) => (ws.tasks.find((x) => x.id === d)?.percentDone ?? 100) >= 100);
      if (!depsDone || t.start > ws.today) continue;
      const elapsed = diffDays(t.start, ws.today);
      t.percentDone = Math.max(1, Math.min(100, Math.round((elapsed / Math.max(1, t.durationDays)) * 100)));
    }
  }
  refreshGates(ws);
  reflow(ws);
  return ws;
}

// ---------- money views (all derived, nothing stored twice) ----------

export function collected(ws: Workspace): number {
  return round2(ws.gates.filter((g) => g.status === "paid").reduce((s, g) => s + g.amount, 0));
}

export function heldAmount(ws: Workspace): number {
  return round2(ws.gates.filter((g) => g.status === "held").reduce((s, g) => s + g.amount, 0));
}

export function outstanding(ws: Workspace): number {
  return round2(
    ws.gates.filter((g) => g.status === "invoiced" || g.status === "overdue").reduce((s, g) => s + g.amount, 0),
  );
}

export function contractTotal(ws: Workspace): number {
  return round2(ws.gates.reduce((s, g) => s + g.amount, 0));
}

export function paidOut(ws: Workspace): number {
  return round2(
    ws.receipts.filter((r) => !["DENIED", "CANCELED"].includes(r.status)).reduce((s, r) => s + r.total, 0),
  );
}

/** The milestone gate that pays for a phase. */
export function phaseGate(ws: Workspace, phaseId: string): Gate | undefined {
  return ws.gates.find((g) => g.phaseId === phaseId && g.kind === "milestone");
}

export interface CrewLine {
  personId: string;
  name: string;
  email: string;
  /** Delivered work in phases the client has paid for. */
  earned: number;
  paid: number;
  owed: number;
  /** Delivered, but the client has not paid that phase yet. */
  waitingOnClient: number;
}

export function crewLedger(ws: Workspace): CrewLine[] {
  return ws.crew.map((p) => {
    let earned = 0;
    let waiting = 0;
    for (const t of ws.tasks) {
      if (t.kind !== "work" || t.assigneeId !== p.id || !t.fee || t.percentDone < 100) continue;
      const g = phaseGate(ws, t.phaseId);
      if (g && g.status === "paid") earned += t.fee;
      else waiting += t.fee;
    }
    const paid = ws.receipts
      .filter((r) => !["DENIED", "CANCELED"].includes(r.status))
      .flatMap((r) => r.items)
      .filter((i) => i.email.toLowerCase() === p.email.toLowerCase())
      .reduce((s, i) => s + i.amount, 0);
    return {
      personId: p.id,
      name: p.name,
      email: p.email,
      earned: round2(earned),
      paid: round2(paid),
      owed: round2(Math.max(0, earned - paid)),
      waitingOnClient: round2(waiting),
    };
  });
}

/** How many days the last task now finishes after the original plan. */
export function slipDays(ws: Workspace): number {
  let now = ws.project.start;
  let base = ws.project.start;
  for (const t of ws.tasks) {
    now = maxDate(now, taskEnd(t));
    base = maxDate(base, addDays(t.baselineStart, t.durationDays));
  }
  return diffDays(base, now);
}

export function projectEnd(ws: Workspace): ISODate {
  return ws.tasks.reduce((m, t) => maxDate(m, taskEnd(t)), ws.project.start);
}
