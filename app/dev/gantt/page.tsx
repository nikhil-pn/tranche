"use client";

// Dev harness for the plan board. Each button makes a new Workspace object and hands it down,
// which is exactly how the real app will drive the board.

import { useCallback, useState } from "react";

import PlanGanttLazy, { type EngineCheck, type PlanEdit } from "@/components/gantt/PlanGanttLazy";
import { addDays } from "@/lib/dates";
import { advanceClock, gateTask, reflow, refreshGates } from "@/lib/schedule";
import { makeSampleInProgress, makeSeed } from "@/lib/seed";
import type { Workspace } from "@/lib/types";

type Change = (ws: Workspace) => void;

export default function GanttDevPage() {
  const [ws, setWs] = useState<Workspace>(() => makeSampleInProgress());
  const [check, setCheck] = useState<EngineCheck | null>(null);

  /** Copy the workspace, change the copy, bump the revision. The board only ever sees new objects. */
  const change = useCallback((fn: Change) => {
    setWs((prev) => {
      const next = structuredClone(prev);
      fn(next);
      next.rev = prev.rev + 1;
      return next;
    });
  }, []);

  const payDesign = () =>
    change((next) => {
      const g = next.gates.find((x) => x.id === "g2");
      if (!g) return;
      g.status = "paid";
      g.paidAt = next.today;
      reflow(next);
      refreshGates(next);
    });

  const pushExpected = () =>
    change((next) => {
      const g = next.gates.find((x) => x.id === "g2");
      if (!g) return;
      g.expected = addDays(g.expected ?? gateTask(next, "g2")?.start ?? next.today, 4);
      reflow(next);
    });

  const advance = () => change((next) => void advanceClock(next, 2));

  const onPlanEdit = useCallback(
    (edit: PlanEdit) =>
      change((next) => {
        const t = next.tasks.find((x) => x.id === edit.taskId);
        if (!t || t.kind !== "work") return;
        if (edit.durationDays !== undefined) t.durationDays = edit.durationDays;
        if (edit.percentDone !== undefined) t.percentDone = edit.percentDone;
        reflow(next);
        refreshGates(next);
        reflow(next);
      }),
    [change],
  );

  const onEngineCheck = useCallback((c: EngineCheck) => {
    setCheck(c);
    const bad = c.rows.filter((r) => !r.match);
    if (bad.length) {
      console.warn(`[gantt check] rev ${c.rev}: ${bad.length} of ${c.total} start dates differ`);
      console.table(bad);
    } else {
      console.info(`[gantt check] rev ${c.rev}: Bryntum agrees with the plan engine on ${c.matched}/${c.total} start dates`);
    }
  }, []);

  const btn =
    "h-8 rounded-md border border-[var(--line)] bg-[var(--card)] px-3 text-[13px] font-medium text-[var(--ink-2)] hover:border-[var(--ink-3)] hover:text-[var(--ink)]";
  const allMatch = check ? check.matched === check.total : null;

  return (
    <main className="flex h-screen flex-col bg-[var(--paper)] text-[var(--ink)]">
      <header className="flex flex-wrap items-center gap-2 border-b border-[var(--line)] px-4 py-2">
        <span className="mr-2 text-[13px] font-semibold">Plan board harness</span>
        <button className={btn} onClick={payDesign} data-testid="pay">
          Client pays Design approval
        </button>
        <button className={btn} onClick={pushExpected} data-testid="push">
          Push expected payment +4 days
        </button>
        <button className={btn} onClick={advance} data-testid="advance">
          Advance clock 2 days
        </button>
        <button className={btn} onClick={() => setWs(makeSampleInProgress())} data-testid="reset">
          Reset
        </button>
        <button className={btn} onClick={() => setWs(makeSeed())} data-testid="fresh">
          Load fresh plan
        </button>
        <span className="num ml-auto text-[11px] text-[var(--ink-3)]" data-testid="check">
          today {ws.today} · rev {ws.rev} ·{" "}
          {check === null ? (
            "engine check pending"
          ) : (
            <span style={{ color: allMatch ? "var(--green)" : "var(--red)" }}>
              engine check {check.matched}/{check.total} start dates match
              {allMatch ? "" : ` (differs: ${check.rows.filter((r) => !r.match).map((r) => r.taskId).join(", ")})`}
            </span>
          )}
        </span>
      </header>
      <div className="min-h-0 flex-1">
        <PlanGanttLazy ws={ws} onPlanEdit={onPlanEdit} onEngineCheck={onEngineCheck} />
      </div>
    </main>
  );
}
