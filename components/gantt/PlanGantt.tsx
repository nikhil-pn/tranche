"use client";

// The plan board: a Bryntum Gantt where payment gates are real milestones with real dependencies.
// Bryntum's scheduling engine computes every date that is not history. This component feeds it the
// workspace (see toBryntum.ts), keeps its stores in step with new workspaces in place so bars slide,
// and reports duration and progress edits back to the parent. Load it through PlanGanttLazy.
//
// Bryntum itself is loaded at runtime (see loadBryntum.ts), never through the bundler, so every
// import from "@bryntum/gantt" in this file must stay a type import.

import "./gantt.css";

import { useEffect, useRef, useState } from "react";
import type { DomConfig, Gantt, GanttConfig, Model, Row, Store, TaskModel } from "@bryntum/gantt";

import { addDays, diffDays, fmtDay, usd } from "@/lib/dates";
import { gateOf, slipDays, taskEnd } from "@/lib/schedule";
import type { GateStatus, ISODate, Workspace } from "@/lib/types";
import { loadBryntum, type BryntumGantt } from "./loadBryntum";
import {
  flattenRows,
  fromLocalDate,
  toBryntum,
  toLocalDate,
  type BryntumPlan,
  type BTask,
  type RowKind,
} from "./toBryntum";

export interface PlanEdit {
  taskId: string;
  durationDays?: number;
  percentDone?: number;
}

/** Result of comparing the dates Bryntum's engine computed with the dates in the workspace. */
export interface EngineCheck {
  rev: number;
  total: number;
  matched: number;
  rows: { taskId: string; name: string; ours: ISODate; bryntum: ISODate | null; match: boolean }[];
}

interface Props {
  ws: Workspace;
  onPlanEdit?: (edit: PlanEdit) => void;
  className?: string;
  /** Dev only: called after every sync with the comparison between Bryntum's dates and ours. */
  onEngineCheck?: (check: EngineCheck) => void;
}

// ---------- task model ----------

let planTaskClass: typeof TaskModel | undefined;

/** TaskModel with the few extra plain fields the board draws from. */
function planTask(B: BryntumGantt): typeof TaskModel {
  if (planTaskClass) return planTaskClass;
  class PlanTask extends B.TaskModel {
    // Getters, not static properties: Bryntum's Model defines these as accessors, and a compiled
    // `static fields = [...]` becomes an assignment that throws.
    static get $name() {
      return "PlanTask";
    }

    static get fields() {
      return [
        { name: "kind", type: "string", defaultValue: "work" },
        { name: "money", type: "number", defaultValue: 0 },
        { name: "label", type: "string", defaultValue: "" },
        { name: "gateStatus", type: "string" },
        { name: "waiting", type: "boolean", defaultValue: false },
        { name: "waitingOn", type: "string" },
        { name: "color", type: "string" },
        { name: "due", type: "string" },
        { name: "wsStart", type: "string" },
      ];
    }
  }
  planTaskClass = PlanTask;
  return PlanTask;
}

interface PlanRow {
  id: string;
  name: string;
  kind: RowKind;
  money: number;
  label: string;
  gateStatus?: GateStatus;
  waiting: boolean;
  waitingOn?: string;
  color?: string;
  due?: string;
  wsStart?: string;
  startDate: Date | null;
  endDate: Date | null;
  duration: number;
  percentDone: number;
  critical: boolean;
  isLeaf: boolean;
  assignments: { resource?: { name: string; role?: string; color?: string; initials?: string } }[];
  get(field: string): unknown;
  set(values: Record<string, unknown>): void;
  baselines?: Store;
}

const asRow = (record: unknown) => record as PlanRow;

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
const esc = (s: unknown) => String(s ?? "").replace(/[&<>"']/g, (c) => ESCAPES[c]);

// ---------- workspace -> Bryntum records ----------

const DATE_FIELDS = new Set(["startDate", "constraintDate"]);
/** Fields we own on a task record. `startDate` is only written for rows the workspace pins. */
const SYNC_FIELDS = [
  "name",
  "duration",
  "percentDone",
  "manuallyScheduled",
  "constraintType",
  "constraintDate",
  "startDate",
  "resizable",
  "eventColor",
  "taskIconCls",
  "money",
  "label",
  "gateStatus",
  "waiting",
  "waitingOn",
  "color",
  "due",
  "wsStart",
] as const;

function taskData(r: BTask): Record<string, unknown> {
  const { children, startDate, constraintDate, baselines, ...rest } = r;
  const out: Record<string, unknown> = {
    ...rest,
    constraintDate: constraintDate ? toLocalDate(constraintDate) : null,
    baselines: baselines.map((b) => ({ startDate: toLocalDate(b.startDate), endDate: toLocalDate(b.endDate) })),
  };
  if (startDate) out.startDate = toLocalDate(startDate);
  if (children) out.children = children.map(taskData);
  return out;
}

function rangeData(plan: BryntumPlan) {
  return plan.timeRanges.map((r) => ({
    id: r.id,
    name: r.name,
    cls: r.cls,
    startDate: toLocalDate(r.startDate),
    ...(r.endDate ? { endDate: toLocalDate(r.endDate) } : {}),
  }));
}

function inlineData(plan: BryntumPlan) {
  return {
    tasks: plan.tasks.map(taskData),
    dependencies: plan.dependencies.map((d) => ({ ...d })),
    resources: plan.resources.map((r) => ({ ...r })),
    assignments: plan.assignments.map((a) => ({ ...a })),
  };
}

const sameValue = (a: unknown, b: unknown) => {
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime();
  }
  return (a ?? null) === (b ?? null);
};

function storeIds(store: Store): string[] {
  return (store.allRecords as Model[]).map((r) => String(r.id)).sort();
}

/** True when the plan has the same rows, links and people as what is loaded, so it can be patched in place. */
function sameShape(gantt: Gantt, plan: BryntumPlan): boolean {
  const { taskStore, dependencyStore, resourceStore, assignmentStore } = gantt.project;
  const eq = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);
  return (
    eq(storeIds(taskStore), flattenRows(plan.tasks).map((r) => r.id).sort()) &&
    eq(storeIds(dependencyStore), plan.dependencies.map((d) => d.id).sort()) &&
    eq(storeIds(resourceStore), plan.resources.map((r) => r.id).sort()) &&
    eq(storeIds(assignmentStore), plan.assignments.map((a) => a.id).sort())
  );
}

/** Write only what changed into the existing records. Bryntum then reschedules and animates the bars. */
function patchInPlace(gantt: Gantt, plan: BryntumPlan) {
  const { taskStore, dependencyStore, resourceStore } = gantt.project;

  for (const r of flattenRows(plan.tasks)) {
    const rec = asRow(taskStore.getById(r.id));
    const want = taskData(r);
    const patch: Record<string, unknown> = {};
    for (const f of SYNC_FIELDS) {
      if (r.kind === "phase" && f !== "name" && f !== "money" && f !== "eventColor") continue;
      if (f === "startDate" && !want.startDate) continue; // the engine owns this date
      const next = DATE_FIELDS.has(f) ? (want[f] ?? null) : want[f];
      if (!sameValue(rec.get(f), next)) patch[f] = next ?? null;
    }
    if (Object.keys(patch).length) rec.set(patch);

    const base = rec.baselines?.first as Model | undefined;
    const b = r.baselines[0];
    if (base && b) {
      const s = toLocalDate(b.startDate);
      const e = toLocalDate(b.endDate);
      if (!sameValue(base.get("startDate"), s) || !sameValue(base.get("endDate"), e)) base.set({ startDate: s, endDate: e });
    }
  }

  for (const d of plan.dependencies) {
    const rec = dependencyStore.getById(d.id) as Model | null;
    if (rec && rec.get("lag") !== d.lag) rec.set({ lag: d.lag });
  }

  for (const p of plan.resources) {
    const rec = resourceStore.getById(p.id) as Model | null;
    if (rec && (rec.get("name") !== p.name || rec.get("color") !== p.color)) rec.set({ ...p });
  }

}

/** The today line and the late-payment bands. Kept apart from the task data: they are not scheduled. */
function syncRanges(gantt: Gantt, plan: BryntumPlan) {
  const { timeRangeStore } = gantt.project;
  const ranges = rangeData(plan);
  const keep = new Set(ranges.map((r) => r.id));
  for (const rec of [...(timeRangeStore.allRecords as Model[])]) {
    if (!keep.has(String(rec.id))) timeRangeStore.remove(rec);
  }
  for (const r of ranges) {
    const rec = timeRangeStore.getById(r.id) as Model | null;
    if (!rec) {
      timeRangeStore.add(r);
      continue;
    }
    const end = "endDate" in r ? r.endDate : null;
    const patch: Record<string, unknown> = {};
    if (!sameValue(rec.get("startDate"), r.startDate)) patch.startDate = r.startDate;
    if (end && !sameValue(rec.get("endDate"), end)) patch.endDate = end;
    if (rec.get("name") !== r.name) patch.name = r.name;
    if (Object.keys(patch).length) rec.set(patch);
  }
}

const MIN_TICK = 20;
const MAX_TICK = 30;

/** First view: show the whole plan if the day columns stay readable, otherwise start a little before today. */
function frame(gantt: Gantt, plan: BryntumPlan, today: ISODate) {
  const width = gantt.timeAxisSubGridElement?.offsetWidth ?? 0;
  const days = Math.abs(diffDays(plan.viewStart, plan.viewEnd));
  if (!width || !days) return;
  const tick = Math.max(MIN_TICK, Math.min(MAX_TICK, Math.floor(width / days)));
  if (gantt.tickSize !== tick) gantt.tickSize = tick;
  if (tick * days > width) {
    const lead = Math.max(3, Math.round((width / tick) * 0.3));
    const from = addDays(today, -lead);
    void gantt.scrollToDate(toLocalDate(from < plan.viewStart ? plan.viewStart : from), { block: "start", animate: false });
  }
}

function engineCheck(gantt: Gantt, ws: Workspace): EngineCheck {
  const rows = ws.tasks.map((t) => {
    const rec = gantt.project.taskStore.getById(t.id) as unknown as PlanRow | null;
    const bryntum = rec?.startDate ? fromLocalDate(rec.startDate) : null;
    return { taskId: t.id, name: t.name, ours: t.start, bryntum, match: bryntum === t.start };
  });
  return { rev: ws.rev, total: rows.length, matched: rows.filter((r) => r.match).length, rows };
}

// ---------- drawing ----------

const GATE_STATUSES: GateStatus[] = ["locked", "ready", "invoiced", "held", "paid", "overdue"];

const STATUS_TEXT: Record<GateStatus, string> = {
  locked: "Not due yet",
  ready: "Ready to send",
  invoiced: "Invoiced, waiting for the client",
  held: "Held by PayPal",
  paid: "Paid",
  overdue: "Overdue",
};

const line = (k: string, v: string) => `<div class="tr-tip-row"><span>${esc(k)}</span><b>${v}</b></div>`;

function tooltipHtml(ws: Workspace, record: PlanRow): string {
  const start = record.startDate ? fromLocalDate(record.startDate) : undefined;
  const end = record.endDate ? fromLocalDate(record.endDate) : undefined;

  if (record.kind === "phase") {
    return [
      `<div class="tr-tip"><div class="tr-tip-title">${esc(record.name)}</div>`,
      `<div class="tr-tip-sub">Phase</div>`,
      line("Runs", `${esc(fmtDay(start))} to ${esc(fmtDay(end))}`),
      record.money ? line("Billed in this phase", `<span class="num">${esc(usd(record.money))}</span>`) : "",
      `</div>`,
    ].join("");
  }

  const t = ws.tasks.find((x) => x.id === record.id);
  if (record.kind === "gate") {
    const g = t ? gateOf(ws, t) : undefined;
    if (!g) return `<div class="tr-tip"><div class="tr-tip-title">${esc(record.name)}</div></div>`;
    const invoice = g.invoiceNumber ?? g.invoiceId ?? g.orderId;
    return [
      `<div class="tr-tip"><div class="tr-tip-title">${esc(g.name)}</div>`,
      `<div class="tr-tip-sub">Payment gate</div>`,
      line("Amount", `<span class="num">${esc(usd(g.amount))}</span>`),
      line("Status", `<span class="tr-pill tr-pill-${esc(g.status)}">${esc(STATUS_TEXT[g.status])}</span>`),
      invoice ? line(g.kind === "deposit" ? "PayPal order" : "Invoice", `<span class="num">${esc(invoice)}</span>`) : "",
      g.invoicedAt ? line("Sent", esc(fmtDay(g.invoicedAt))) : "",
      g.due ? line("Due", esc(fmtDay(g.due))) : line("Terms", g.kind === "deposit" ? "Due at kickoff" : `Net ${g.netDays} days`),
      g.paidAt ? line(g.status === "held" ? "Held since" : "Paid", esc(fmtDay(g.paidAt))) : line("Expected", esc(fmtDay(start))),
      line("Reminders sent", `<span class="num">${g.remindersSent}</span>`),
      `</div>`,
    ].join("");
  }

  const person = record.assignments[0]?.resource;
  const state =
    record.percentDone >= 100
      ? "Done"
      : record.waiting
        ? `Waiting for payment${record.waitingOn ? `: ${esc(record.waitingOn)}` : ""}`
        : record.percentDone > 0
          ? "In progress"
          : "Not started";
  return [
    `<div class="tr-tip"><div class="tr-tip-title">${esc(record.name)}</div>`,
    person ? `<div class="tr-tip-sub">${esc(person.name)}${person.role ? `, ${esc(person.role)}` : ""}</div>` : "",
    line("When", `${esc(fmtDay(start))} to ${esc(fmtDay(end))} (${Math.round(record.duration)} days)`),
    line("Done", `<span class="num">${Math.round(record.percentDone)}%</span>`),
    record.money ? line("Fee", `<span class="num">${esc(usd(record.money))}</span>`) : "",
    line("Status", state),
    record.critical ? line("Critical path", "Yes, a delay here delays the finish") : "",
    `</div>`,
  ].join("");
}

function slipText(days: number): string {
  // Same rule as the rest of the app: only a positive slip is news.
  if (days > 0) return `${days} ${days === 1 ? "day" : "days"} behind the original plan`;
  return "On the original plan";
}

// ---------- Gantt configuration ----------

interface Handlers {
  ws: () => Workspace;
  duration: (gantt: Gantt, record: PlanRow) => void;
  percent: (record: PlanRow) => void;
}

/** Below this board width the grid drops the Start and Days columns (both are readable on the chart). */
const COMPACT_BELOW = 1200;

/** Fixed grid column widths. The Plan column gets the rest of the grid region. */
const COL = { who: 46, start: 64, days: 50, done: 54, money: 76 } as const;
const PLAN_WIDE = 212;
const PLAN_MIN = 176;
/** On a compact board the chart keeps at least this much room before the Plan column grows. */
const CHART_MIN = 600;

interface GridLayout {
  compact: boolean;
  plan: number;
  /** Width of the grid region. It is exactly the sum of the visible columns, so none of them is clipped. */
  width: number;
}

function gridLayout(boardWidth: number): GridLayout {
  const compact = boardWidth < COMPACT_BELOW;
  const fixed = COL.who + COL.done + COL.money + (compact ? 0 : COL.start + COL.days);
  const plan = compact ? Math.max(PLAN_MIN, Math.min(PLAN_WIDE, boardWidth - CHART_MIN - fixed)) : PLAN_WIDE;
  return { compact, plan, width: plan + fixed };
}

/** Rows that hang a label after their bar or diamond (see `labels` below). */
const hasAfterLabel = (r: PlanRow) => r.kind === "gate" || (r.kind === "work" && r.waiting);

function ganttConfig(B: BryntumGantt, plan: BryntumPlan, on: Handlers, grid: GridLayout): Partial<GanttConfig> {
  const { compact } = grid;

  // Left edge of the visible chart. A label whose bar or diamond ends before it would only show as a
  // cut fragment pressed against the grid ("ov 22"), so it is not drawn until its anchor is back in view.
  const edge = { from: -Infinity, queued: false, rows: new Set<Model>() };
  const anchorOff = (r: PlanRow) => !!r.endDate && r.endDate.getTime() < edge.from;

  return {
    project: {
      taskModelClass: planTask(B),
      startDate: toLocalDate(plan.projectStart),
      // Tranche plans in calendar days: every day counts, a day is 24 hours.
      calendar: "everyday",
      calendars: [{ id: "everyday", name: "Every day", unspecifiedTimeIsWorking: true }],
      hoursPerDay: 24,
      daysPerWeek: 7,
      daysPerMonth: 30,
      adjustDurationToDST: true,
      // Dates we write are facts, not wishes: never turn them into constraints behind our back.
      addConstraintOnDateSet: false,
      autoSetConstraints: false,
    },
    startDate: toLocalDate(plan.viewStart),
    endDate: toLocalDate(plan.viewEnd),
    viewPreset: {
      base: "weekAndDayLetter",
      tickWidth: 30,
      timeResolution: { unit: "day", increment: 1 },
      headers: [
        { unit: "month", dateFormat: "MMMM YYYY" },
        { unit: "day", dateFormat: "D" },
      ],
    },
    // Keep exactly the span we ask for instead of snapping out to whole months.
    autoAdjustTimeAxis: false,
    rowHeight: 40,
    barMargin: 8,
    transitionDuration: 550,
    transition: { changeEvent: true },
    displaySchedulingIssueResolutionPopup: false,
    showTaskColorPickers: false,
    enableDeleteKey: false,
    emptyText: "No plan yet",
    subGridConfigs: { locked: { width: grid.width } },

    columns: [
      {
        type: "name",
        field: "name",
        text: "Plan",
        width: grid.plan,
        minWidth: 140,
        editor: false,
        renderer: ({ record, row, value }: { record: Model; row: Row; value: string }) => {
          const r = asRow(record);
          const status = r.kind === "gate" ? (r.gateStatus ?? "locked") : null;
          row.assignCls({
            "tr-row-phase": r.kind === "phase",
            "tr-row-gate": r.kind === "gate",
            "tr-row-work": r.kind === "work",
            "tr-row-waiting": r.kind === "work" && r.waiting,
            ...Object.fromEntries(GATE_STATUSES.map((s) => [`tr-row-gate-${s}`, status === s])),
          });
          return esc(value);
        },
      },
      {
        text: "Who",
        field: "color",
        width: COL.who,
        minWidth: COL.who,
        align: "center",
        editor: false,
        htmlEncode: false,
        cellCls: "tr-cell-who",
        renderer: ({ record }: { record: Model }): DomConfig | string => {
          const person = asRow(record).assignments?.[0]?.resource;
          if (!person) return "";
          return {
            className: "tr-chip",
            style: { backgroundColor: person.color ?? "#8a8f99" },
            dataset: { btip: `${person.name}${person.role ? `, ${person.role}` : ""}` },
            text: person.initials ?? "",
          } as DomConfig;
        },
      },
      { type: "startdate", text: "Start", width: COL.start, minWidth: COL.start, format: "MMM D", editor: false, cellCls: "num tr-cell-date", hidden: compact },
      {
        type: "duration",
        text: "Days",
        hidden: compact,
        width: COL.days,
        minWidth: COL.days,
        align: "right",
        cellCls: "num tr-cell-days",
        decimalPrecision: 0,
        instantUpdate: false,
        // Just the number: the header already says days.
        renderer: ({ record }: { record: Model }) => {
          const r = asRow(record);
          return r.kind === "gate" ? "" : String(Math.round(r.duration ?? 0));
        },
      },
      { type: "percentdone", text: "Done", width: COL.done, minWidth: COL.done, align: "right", cellCls: "num tr-cell-done", mode: "number" },
      {
        text: "Money",
        field: "money",
        width: COL.money,
        minWidth: COL.money,
        align: "right",
        editor: false,
        htmlEncode: false,
        cellCls: "num tr-cell-money",
        renderer: ({ record }: { record: Model }) => {
          const r = asRow(record);
          if (!r.money) return "";
          const tone = r.kind === "gate" ? `tr-money-gate tr-money-${r.gateStatus ?? "locked"}` : `tr-money-${r.kind}`;
          return `<span class="${tone}">${esc(usd(r.money))}</span>`;
        },
      },
    ],

    taskRenderer: ({ taskRecord, renderData }) => {
      const r = asRow(taskRecord);
      const w = renderData.wrapperCls as unknown as Record<string, boolean>;
      w[`tr-${r.kind}`] = true;
      if (r.kind === "gate") w[`tr-gate-${r.gateStatus ?? "locked"}`] = true;
      if (r.kind === "work") {
        w["tr-waiting"] = r.waiting;
        w["tr-done"] = r.percentDone >= 100;
      }
      return "";
    },

    features: {
      // --- features that carry the story ---
      baselines: { disabled: false },
      criticalPaths: { disabled: true },
      dependencies: { allowCreate: false, enableDelete: false, radius: 5, clickWidth: 6 },
      rollups: true,
      percentBar: { allowResize: true, showPercentage: false },
      labels: {
        after: {
          renderer: (({ taskRecord }: { taskRecord: TaskModel }) => {
            const r = asRow(taskRecord);
            if (anchorOff(r)) return "";
            if (r.kind === "gate") return esc(r.label);
            if (r.kind === "work" && r.waiting) return esc(r.waitingOn ? `waits for ${r.waitingOn}` : "waiting for payment");
            return "";
          }) as unknown as () => void,
        },
      },
      indicators: {
        items: {
          earlyDates: false,
          lateDates: false,
          deadlineDate: false,
          constraintDate: false,
          // The invoice due date stays on the row while the diamond moves to the day the money is expected.
          invoiceDue: (taskRecord: TaskModel) => {
            const r = asRow(taskRecord);
            return r.kind === "gate" && r.due
              ? { startDate: toLocalDate(r.due), cls: "tr-due", iconCls: "fa fa-flag", name: `Invoice due ${fmtDay(r.due)}` }
              : null;
          },
        },
      },
      taskTooltip: {
        cls: "tr-tooltip",
        template: ({ taskRecord }) => tooltipHtml(on.ws(), asRow(taskRecord)),
      },
      timeRanges: { showCurrentTimeLine: false, showHeaderElements: true, enableResizing: false },
      taskResize: { showTooltip: true },
      cellEdit: { addNewAtEnd: false, autoSelect: true },

      // --- everything that could change the shape of the plan is off ---
      taskDrag: false,
      taskDragCreate: false,
      taskEdit: false,
      taskMenu: false,
      taskCopyPaste: false,
      dependencyEdit: false,
      cellMenu: false,
      headerMenu: false,
      scheduleMenu: false,
      timeAxisHeaderMenu: false,
      rowReorder: false,
      rowCopyPaste: false,
      cellCopyPaste: false,
      fillHandle: false,
      sort: false,
      filter: false,
      group: false,
      columnReorder: false,
      columnPicker: false,
      projectLines: false,
      nonWorkingTime: false,
    },

    listeners: {
      // Redraw only the rows whose label anchor crossed the left edge, at most once a frame.
      visibleDateRangeChange: ({ source, new: range }) => {
        const prev = edge.from;
        const next = range.startDate.getTime();
        if (next === prev) return;
        edge.from = next;
        const lo = Math.min(prev, next);
        const hi = Math.max(prev, next);
        const g = source as unknown as Gantt;
        for (const rec of g.project.taskStore.allRecords as Model[]) {
          const r = asRow(rec);
          const end = r.endDate?.getTime();
          if (end !== undefined && end >= lo && end < hi && hasAfterLabel(r)) edge.rows.add(rec);
        }
        if (!edge.rows.size || edge.queued) return;
        edge.queued = true;
        requestAnimationFrame(() => {
          edge.queued = false;
          const rows = [...edge.rows];
          edge.rows.clear();
          if (!g.isDestroyed && rows.length) g.refreshRows(rows);
        });
      },
      beforeCellEditStart: ({ editorContext }) => {
        const r = asRow(editorContext.record);
        const field = (editorContext.column as { field?: string }).field;
        if (r.kind !== "work") return false;
        // Work that waits for money cannot make progress, and finished work is history.
        if (field === "percentDone" && r.waiting) return false;
        if (field !== "percentDone" && r.percentDone >= 100) return false;
        return true;
      },
      finishCellEdit: ({ grid, editorContext }) => {
        const r = asRow(editorContext.record);
        if ((editorContext.column as { field?: string }).field === "percentDone") on.percent(r);
        else on.duration(grid as unknown as Gantt, r);
      },
      beforeTaskResize: ({ taskRecord }) => {
        const r = asRow(taskRecord);
        return r.kind === "work" && r.percentDone < 100;
      },
      taskResizeEnd: ({ source, changed, taskRecord }) => {
        if (changed) on.duration(source, asRow(taskRecord));
      },
      percentBarDrop: ({ taskRecord }) => on.percent(asRow(taskRecord)),
    },
  };
}

// ---------- component ----------

export default function PlanGantt({ ws, onPlanEdit, className, onEngineCheck }: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const wsRef = useRef(ws);
  const editRef = useRef(onPlanEdit);
  const checkRef = useRef(onEngineCheck);
  const loadedRef = useRef(new WeakSet<object>());
  const queueRef = useRef<Promise<void>>(Promise.resolve());
  const appliedRef = useRef<Workspace | null>(null);

  const [gantt, setGantt] = useState<Gantt | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [showCritical, setShowCritical] = useState(false);
  const [showBaselines, setShowBaselines] = useState(true);

  useEffect(() => {
    wsRef.current = ws;
    editRef.current = onPlanEdit;
    checkRef.current = onEngineCheck;
  });

  // The Gantt is created once. Data never travels through its config; it is written to the stores below.
  useEffect(() => {
    let gone = false;
    let instance: Gantt | undefined;

    loadBryntum()
      .then((B) => {
        if (gone || !hostRef.current) return;
        const handlers: Handlers = {
          ws: () => wsRef.current,
          duration: (g, record) => {
            if (record.kind !== "work") return;
            void g.project.commitAsync().then(() => {
              editRef.current?.({ taskId: record.id, durationDays: Math.max(1, Math.round(record.duration)) });
            });
          },
          percent: (record) => {
            if (record.kind !== "work") return;
            editRef.current?.({ taskId: record.id, percentDone: Math.max(0, Math.min(100, Math.round(record.percentDone))) });
          },
        };
        instance = new B.Gantt({
          ...ganttConfig(B, toBryntum(wsRef.current), handlers, gridLayout(hostRef.current.offsetWidth)),
          appendTo: hostRef.current,
          readOnly: !editRef.current,
        });
        setGantt(instance);
      })
      .catch((err: unknown) => {
        console.error("[PlanGantt] Bryntum Gantt did not load", err);
        if (!gone) setFailed(err instanceof Error ? err.message : String(err));
      });

    return () => {
      gone = true;
      instance?.destroy();
    };
  }, []);

  // Keep Bryntum's stores in step with the workspace. First time: load. After that: patch in place.
  useEffect(() => {
    if (!gantt || gantt.isDestroyed) return;
    let cancelled = false;

    queueRef.current = queueRef.current
      .catch(() => undefined)
      .then(async () => {
        if (cancelled || gantt.isDestroyed) return;
        const fresh = !loadedRef.current.has(gantt);
        if (!fresh && appliedRef.current === ws) return;
        const plan = toBryntum(ws);

        // Make room on the time axis before bars move past its end (never shrinks, so scroll stays put).
        const viewStart = toLocalDate(plan.viewStart);
        const viewEnd = toLocalDate(plan.viewEnd);
        if (!fresh && (viewStart < gantt.startDate || viewEnd > gantt.endDate)) {
          gantt.setTimeSpan(
            viewStart < gantt.startDate ? viewStart : gantt.startDate,
            viewEnd > gantt.endDate ? viewEnd : gantt.endDate,
          );
        }

        if (fresh || !sameShape(gantt, plan)) {
          const scroll = fresh ? null : gantt.storeScroll();
          gantt.project.startDate = toLocalDate(plan.projectStart);
          await gantt.project.loadInlineData(inlineData(plan));
          if (gantt.isDestroyed) return;
          if (fresh) {
            gantt.setTimeSpan(viewStart, viewEnd);
            frame(gantt, plan, ws.today);
          } else if (scroll) gantt.restoreScroll(scroll);
          loadedRef.current.add(gantt);
        } else {
          if (fromLocalDate(gantt.project.startDate as Date) !== plan.projectStart) {
            gantt.project.startDate = toLocalDate(plan.projectStart);
          }
          patchInPlace(gantt, plan);
        }
        syncRanges(gantt, plan);
        await gantt.project.commitAsync();
        if (gantt.isDestroyed) return;
        appliedRef.current = ws;
        checkRef.current?.(engineCheck(gantt, ws));
      })
      .catch((err) => {
        console.error("[PlanGantt] could not apply the workspace", err);
      });

    return () => {
      cancelled = true;
    };
  }, [ws, gantt]);

  const canEdit = !!onPlanEdit;
  useEffect(() => {
    if (!gantt || gantt.isDestroyed) return;
    gantt.readOnly = !canEdit;
    gantt.features.criticalPaths.disabled = !showCritical;
    gantt.features.baselines.disabled = !showBaselines;
  }, [gantt, canEdit, showCritical, showBaselines]);

  const zoomToFit = () => {
    if (gantt && !gantt.isDestroyed) gantt.zoomToFit({ leftMargin: 24, rightMargin: 190 });
  };

  const slip = slipDays(ws);
  const finish = ws.tasks.reduce((m, t) => (taskEnd(t) > m ? taskEnd(t) : m), ws.project.start);
  const baseFinish = addDays(finish, -slip);

  return (
    <div className={`tranche-gantt${className ? ` ${className}` : ""}`}>
      <div className="tg-bar">
        <div className="tg-group">
          <button type="button" className="tg-btn" aria-pressed={showCritical} onClick={() => setShowCritical((on) => !on)}>
            <span className="tg-swatch tg-swatch-critical" />
            Critical path
          </button>
          <button type="button" className="tg-btn" aria-pressed={showBaselines} onClick={() => setShowBaselines((on) => !on)}>
            <span className="tg-swatch tg-swatch-baseline" />
            Original plan
          </button>
          <button type="button" className="tg-btn" onClick={zoomToFit}>
            Zoom to fit
          </button>
        </div>
        <div className="tg-legend" aria-hidden="true">
          <span><i className="tg-dia tg-dia-paid" />Paid</span>
          <span><i className="tg-dia tg-dia-invoiced" />Invoiced</span>
          <span><i className="tg-dia tg-dia-overdue" />Overdue</span>
          <span><i className="tg-dia tg-dia-locked" />Not due yet</span>
          <span><i className="tg-hatch" />Waiting for payment</span>
        </div>
        <div
          className={`tg-slip ${slip > 0 ? "tg-slip-late" : "tg-slip-ok"}`}
          title={`Original finish ${fmtDay(baseFinish)}, current finish ${fmtDay(finish)}`}
        >
          {slipText(slip)}
          <span className="tg-slip-date num">finish {fmtDay(finish)}</span>
        </div>
      </div>
      <div className="tg-body">
        <div ref={hostRef} className="tg-host" />
        {!gantt && (
          <div className="tg-wait" role="status">
            {failed ? `The plan board could not load (${failed})` : "Loading the plan board"}
          </div>
        )}
      </div>
    </div>
  );
}
