"use client";

// Where the Gantt board and the Books studio plug into the shell.
// Both are memoised: they only re-render when the workspace itself changes.
// Each sits behind its own boundary, so a failure in one view never takes the rest of the app down.

import { Component, memo, type ReactNode } from "react";
import BooksStudioLazy from "@/components/books/BooksStudioLazy";
import type { PlanChange } from "@/lib/contract";
import type { Workspace } from "@/lib/types";
import { PlanBoard } from "./PlanBoard";

function Placeholder({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-40 w-full flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-line bg-card px-6 text-center">
      <p className="display text-[20px] text-ink-2">{title}</p>
      <div className="max-w-md text-[13px] text-ink-2">{children}</div>
    </div>
  );
}

interface BoundaryProps {
  title: string;
  children: ReactNode;
}

class SlotBoundary extends Component<BoundaryProps, { failed: string | null }> {
  state: { failed: string | null } = { failed: null };

  static getDerivedStateFromError(err: unknown) {
    return { failed: err instanceof Error ? err.message : String(err) };
  }

  render() {
    if (this.state.failed === null) return this.props.children;
    return (
      <Placeholder title={this.props.title}>
        <p>This view could not load. The rest of the app still works.</p>
        <p className="num mt-1 text-[12px] break-words text-ink-3">{this.state.failed}</p>
        <button
          type="button"
          onClick={() => this.setState({ failed: null })}
          className="mt-2 rounded-md border border-line bg-card px-2.5 py-1 text-[12.5px] font-medium text-ink hover:border-ink-3"
        >
          Try again
        </button>
      </Placeholder>
    );
  }
}

export interface PlanSlotProps {
  ws: Workspace;
  onPlanEdit: (changes: PlanChange[]) => void;
}

export const PlanSlot = memo(function PlanSlot({ ws, onPlanEdit }: PlanSlotProps) {
  return (
    <SlotBoundary title="Plan board">
      <PlanBoard ws={ws} onPlanEdit={onPlanEdit} />
    </SlotBoundary>
  );
});

export interface BooksSlotProps {
  ws: Workspace;
}

export const BooksSlot = memo(function BooksSlot({ ws }: BooksSlotProps) {
  return (
    <SlotBoundary title="Books">
      <div className="h-full w-full overflow-hidden rounded-xl border border-line bg-card">
        <BooksStudioLazy ws={ws} className="h-full" />
      </div>
    </SlotBoundary>
  );
});
