"use client";

// Pieces shared by the tabs: the action button wired to the store, the gate check list, the payout item table.

import type { ReactNode } from "react";
import { actionKey, useTranche } from "@/lib/client/store";
import type { Action } from "@/lib/contract";
import type { Check, PayoutItem, PayoutProposal } from "@/lib/types";
import { Button, cx, Mark, Money, Pill, payoutTone } from "./ui";

/** A button that runs one action. It spins while its own action runs and is disabled while anything runs. */
export function Do({
  action,
  variant = "secondary",
  size = "sm",
  confirm,
  disabled,
  className,
  title,
  children,
}: {
  action: Action;
  variant?: "primary" | "secondary" | "quiet" | "danger";
  size?: "sm" | "md" | "lg";
  /** Ask first. */
  confirm?: string;
  disabled?: boolean;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const { act, busy, busyKey } = useTranche();
  return (
    <Button
      variant={variant}
      size={size}
      title={title}
      className={className}
      loading={busyKey === actionKey(action)}
      disabled={disabled || busy !== null}
      onClick={() => {
        if (confirm && !window.confirm(confirm)) return;
        void act(action);
      }}
    >
      {children}
    </Button>
  );
}

/**
 * The eight checks of the authorisation gate.
 * While a proposal is still pending, a missing human approval is shown as "waiting", not as a failure.
 */
export function CheckList({ checks, pending = false, dense = false }: { checks: Check[]; pending?: boolean; dense?: boolean }) {
  if (!checks.length) {
    return <p className="text-[12.5px] text-ink-2">No gate checks were recorded for this one.</p>;
  }
  return (
    <ul className={cx("flex flex-col", dense ? "gap-1.5" : "gap-2")}>
      {checks.map((c) => {
        const state = c.ok ? "pass" : pending && c.id === "approval" ? "wait" : "fail";
        return (
          <li key={c.id} className="flex items-start gap-2">
            <Mark state={state} />
            <div className="min-w-0 text-[12.5px] leading-[1.35]">
              <span className={cx("font-medium", state === "fail" ? "text-red" : "text-ink")}>{c.label}</span>
              {c.detail ? <span className="text-ink-2"> {c.detail}</span> : null}
            </div>
          </li>
        );
      })}
    </ul>
  );
}

export function failedChecks(p: PayoutProposal): Check[] {
  return p.checks.filter((c) => !c.ok && !(p.status === "pending" && c.id === "approval"));
}

/** Name, PayPal email, memo, amount. One row per person, total underneath. */
export function ItemsTable({
  items,
  total,
  large = false,
}: {
  items: (PayoutItem & { status?: string })[];
  total: number;
  large?: boolean;
}) {
  const showStatus = items.some((i) => i.status);
  const th = "px-3 py-1.5 text-left text-[11px] font-medium tracking-[0.06em] text-ink-2 uppercase";
  const td = cx("px-3 align-top", large ? "py-2.5" : "py-2");
  return (
    <div className="overflow-hidden rounded-lg border border-line">
      <table className="w-full border-collapse text-[13px]">
        <thead className="bg-paper">
          <tr>
            <th className={th}>Name</th>
            <th className={th}>PayPal email</th>
            <th className={th}>Memo</th>
            {showStatus ? <th className={th}>Status</th> : null}
            <th className={cx(th, "text-right")}>Amount</th>
          </tr>
        </thead>
        <tbody>
          {items.map((it, i) => (
            <tr key={`${it.email}-${i}`} className="border-t border-line">
              <td className={cx(td, "font-medium whitespace-nowrap text-ink")}>{it.name}</td>
              <td className={cx(td, "num text-[12px] break-all text-ink-2")}>{it.email}</td>
              <td className={cx(td, "text-ink-2")}>{it.memo}</td>
              {showStatus ? (
                <td className={td}>{it.status ? <Pill tone={payoutTone(it.status)}>{it.status}</Pill> : null}</td>
              ) : null}
              <td className={cx(td, "text-right whitespace-nowrap")}>
                <Money n={it.amount} className={large ? "text-[14px]" : undefined} />
              </td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-line bg-paper">
            <td className={cx(td, "font-medium text-ink")} colSpan={showStatus ? 4 : 3}>
              Total
            </td>
            <td className={cx(td, "text-right whitespace-nowrap")}>
              <Money n={total} className={cx("font-medium", large ? "text-[16px]" : "text-[13px]")} />
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
