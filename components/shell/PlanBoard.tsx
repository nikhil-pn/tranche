"use client";

// The Bryntum plan board, fitted to the shell: one board edit becomes one plan.update change.

import { memo, useCallback } from "react";
import PlanGanttLazy, { type PlanEdit } from "@/components/gantt/PlanGanttLazy";
import type { PlanChange } from "@/lib/contract";
import type { Workspace } from "@/lib/types";

export interface PlanBoardProps {
  ws: Workspace;
  onPlanEdit: (changes: PlanChange[]) => void;
}

export const PlanBoard = memo(function PlanBoard({ ws, onPlanEdit }: PlanBoardProps) {
  const onEdit = useCallback(
    (edit: PlanEdit) => {
      const change: PlanChange = { id: edit.taskId };
      if (edit.durationDays !== undefined) change.durationDays = edit.durationDays;
      if (edit.percentDone !== undefined) change.percentDone = edit.percentDone;
      if (change.durationDays === undefined && change.percentDone === undefined) return;
      onPlanEdit([change]);
    },
    [onPlanEdit],
  );

  return (
    <div className="h-full w-full overflow-hidden rounded-xl border border-line bg-card">
      <PlanGanttLazy ws={ws} onPlanEdit={onEdit} />
    </div>
  );
});
