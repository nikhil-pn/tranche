"use client";

// The app shell: header, number strip, tabs on the left, agent rail on the right.

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import Link from "next/link";
import { TrancheProvider, useTranche } from "@/lib/client/store";
import { diffDays, fmtDay } from "@/lib/dates";
import { collected, contractTotal, heldAmount, outstanding, paidOut, projectEnd, slipDays } from "@/lib/schedule";
import type { Workspace } from "@/lib/types";
import { AgentRail, AgentStub } from "./AgentRail";
import { CodeField } from "./CodeField";
import { MoneyOutTab } from "./MoneyOutTab";
import { Do } from "./parts";
import { PlanTab } from "./PlanTab";
import { SafetyTab } from "./SafetyTab";
import { BooksSlot } from "./slots";
import { AMBER_TEXT, Button, cx, Label, Money, Pill, plural, Spinner } from "./ui";

// ---------- tabs (kept in the URL hash) ----------

const TABS = [
  { id: "plan", label: "Plan" },
  { id: "money", label: "Money out" },
  { id: "books", label: "Books" },
  { id: "safety", label: "Safety test" },
] as const;

type TabId = (typeof TABS)[number]["id"];

function readTab(): TabId {
  const h = window.location.hash.replace(/^#/, "");
  return TABS.some((t) => t.id === h) ? (h as TabId) : "plan";
}

function subscribeHash(onChange: () => void): () => void {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

function useTab(): [TabId, (t: TabId) => void] {
  const tab = useSyncExternalStore(subscribeHash, readTab, () => "plan" as TabId);
  const pick = useCallback((t: TabId) => {
    if (readTab() !== t) window.location.hash = t;
  }, []);
  return [tab, pick];
}

// ---------- header ----------

function Header({ ws }: { ws: Workspace }) {
  const { reset, busy, sample } = useTranche();
  const day = diffDays(ws.project.start, ws.today) + 1;
  const mode = sample ? "Sample data" : ws.mode === "sandbox" ? "PayPal sandbox" : "PayPal mock";

  return (
    <header className="flex h-[54px] items-center gap-4 border-b border-line bg-paper px-6">
      <span className="display text-[32px] leading-none text-ink">Tranche</span>
      <span className="h-6 w-px shrink-0 bg-line" />
      <div className="min-w-0">
        <p className="truncate text-[14px] leading-5 font-medium text-ink">{ws.project.name}</p>
        <p className="truncate text-[12px] leading-4 text-ink-2">
          Client: {ws.project.client.name} · Studio: {ws.project.studio}
        </p>
      </div>

      <div className="ml-auto flex shrink-0 items-center gap-2">
        <div
          className="flex h-8 items-center gap-2 rounded-md border border-line bg-card px-2.5"
          title="The demo clock. It only moves when you advance it."
        >
          <span className="num text-[13px] font-medium text-ink">Day {day}</span>
          <span className="h-3.5 w-px bg-line" />
          <span className="num text-[13px] text-ink-2">{fmtDay(ws.today)}</span>
        </div>
        <Do action={{ action: "clock.advance", days: 1 }} size="md">
          +1 day
        </Do>
        <Do action={{ action: "clock.advance", days: 3 }} size="md">
          +3 days
        </Do>
        <span className="mx-1 h-6 w-px bg-line" />
        <Link
          href="/"
          className="mr-1 text-[12.5px] whitespace-nowrap text-ink-2 underline decoration-line underline-offset-[3px] hover:text-ink hover:decoration-ink-3"
        >
          How it works
        </Link>
        <Pill tone={ws.mode === "sandbox" && !sample ? "blue" : "grey"}>{mode}</Pill>
        <Button
          size="md"
          loading={busy === "reset"}
          disabled={busy !== null && busy !== "agent"}
          onClick={() => {
            if (window.confirm("Start a new demo? The current project and its history will be cleared.")) void reset();
          }}
        >
          New demo
        </Button>
      </div>
    </header>
  );
}

// ---------- number strip ----------

function Cell({ label, sub, children }: { label: string; sub?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 border-l border-line px-6 py-2.5 first:border-l-0 max-[1360px]:px-4">
      <Label>{label}</Label>
      <div className="mt-0.5 flex items-baseline gap-2 whitespace-nowrap">
        <span className="text-[21px] leading-7 text-ink">{children}</span>
        {sub ? <span className="truncate text-[12px] text-ink-2">{sub}</span> : null}
      </div>
    </div>
  );
}

function NumberStrip({ ws }: { ws: Workspace }) {
  const slip = slipDays(ws);
  const paidGates = ws.gates.filter((g) => g.status === "paid").length;
  const openCount = ws.gates.filter((g) => g.status === "invoiced" || g.status === "overdue").length;
  const overdue = ws.gates.filter((g) => g.status === "overdue").length;
  const payouts = ws.receipts.filter((r) => !["DENIED", "CANCELED"].includes(r.status)).length;

  return (
    <div className="grid grid-cols-6 border-b border-line bg-card">
      <Cell label="Contract" sub={plural(ws.gates.length, "gate")}>
        <Money n={contractTotal(ws)} />
      </Cell>
      <Cell label="Collected" sub={`${paidGates} of ${ws.gates.length} paid`}>
        <Money n={collected(ws)} className="text-green" />
      </Cell>
      <Cell label="Held by PayPal" sub={heldAmount(ws) > 0 ? "deposit" : undefined}>
        <Money n={heldAmount(ws)} className={heldAmount(ws) > 0 ? "text-blue" : "text-ink-3"} />
      </Cell>
      <Cell label="Waiting on client" sub={overdue ? `${overdue} overdue` : openCount ? `${openCount} open` : undefined}>
        <Money n={outstanding(ws)} className={overdue ? "text-red" : openCount ? AMBER_TEXT : "text-ink-3"} />
      </Cell>
      <Cell label="Paid to crew" sub={payouts ? plural(payouts, "payout") : undefined}>
        <Money n={paidOut(ws)} className={payouts ? undefined : "text-ink-3"} />
      </Cell>
      <Cell label="Schedule slip" sub={`ends ${fmtDay(projectEnd(ws))}`}>
        {slip > 0 ? (
          <span className="num text-red">+{plural(slip, "day")}</span>
        ) : (
          <span className="text-[19px] font-medium text-green">On plan</span>
        )}
      </Cell>
    </div>
  );
}

// ---------- banner, toast, boot ----------

function ErrorBanner() {
  const { error, clearError } = useTranche();
  if (!error) return null;
  return (
    <div role="alert" className="flex items-center gap-3 border-b border-red/25 bg-red-soft px-6 py-1.5 text-[13px] text-red">
      <span className="min-w-0 flex-1">{error}</span>
      <button
        type="button"
        onClick={clearError}
        aria-label="Dismiss"
        className="flex size-6 shrink-0 items-center justify-center rounded hover:bg-red/10"
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="m2.5 2.5 7 7M9.5 2.5l-7 7" strokeLinecap="round" />
        </svg>
      </button>
    </div>
  );
}

function Toast() {
  const { toast, dismissToast } = useTranche();
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-6 z-50 flex justify-center px-6">
      <button
        type="button"
        role="status"
        onClick={dismissToast}
        className="pointer-events-auto max-w-xl rounded-lg bg-ink px-4 py-2.5 text-left text-[13px] leading-[1.4] text-paper shadow-[0_6px_24px_rgba(22,24,29,0.18)]"
      >
        {toast}
      </button>
    </div>
  );
}

function Boot() {
  const { error, reset, busy, codeNeeded } = useTranche();
  return (
    <div className="flex min-h-dvh flex-1 flex-col items-center justify-center gap-3 px-6 text-center">
      <p className="display text-[44px] leading-none text-ink">Tranche</p>
      {error ? (
        <div className="flex w-full max-w-sm flex-col items-center gap-3">
          <p className="text-[13px] text-red">{error}</p>
          {codeNeeded ? (
            <div className="w-full text-left">
              <CodeField onSaved={() => void reset()} />
            </div>
          ) : null}
          <Button variant="primary" loading={busy === "reset"} onClick={() => void reset()}>
            Try again
          </Button>
        </div>
      ) : (
        <p className="flex items-center gap-2 text-[13px] text-ink-2">
          <Spinner /> Opening the project
        </p>
      )}
    </div>
  );
}

// ---------- shell ----------

function Shell() {
  const { ws, ready } = useTranche();
  const [tab, pickTab] = useTab();
  const pane = useRef<HTMLElement>(null);
  // Books has its own assistant and needs the width, so the agent rail starts folded there.
  const [rail, setRail] = useState({ books: false, rest: true });
  const railKey = tab === "books" ? "books" : "rest";

  // A new tab starts at its top.
  useEffect(() => {
    pane.current?.scrollTo({ top: 0 });
  }, [tab]);

  if (!ready || !ws) return <Boot />;

  const pending = ws.proposals.filter((p) => p.status === "pending").length;

  return (
    <div className="flex h-dvh min-w-[1100px] flex-col overflow-hidden text-[13px] text-ink">
      <div className="shrink-0">
        <Header ws={ws} />
        <NumberStrip ws={ws} />
        <ErrorBanner />
      </div>

      <div className="flex min-h-0 flex-1">
        <main ref={pane} className="min-w-0 flex-1 overflow-y-auto">
          <nav className="sticky top-0 z-10 flex gap-6 border-b border-line bg-paper px-6" aria-label="Sections">
            {TABS.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => pickTab(t.id)}
                aria-current={tab === t.id ? "page" : undefined}
                className={cx(
                  "-mb-px flex h-10 items-center gap-2 border-b-2 text-[14px] transition-colors",
                  tab === t.id
                    ? "border-ink font-medium text-ink"
                    : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {t.label}
                {t.id === "money" && pending > 0 ? (
                  <span className="num rounded-full bg-ink px-1.5 py-px text-[11px] leading-4 font-medium text-paper">
                    {pending}
                  </span>
                ) : null}
              </button>
            ))}
          </nav>

          <div className="px-6 pt-4 pb-10">
            {tab === "plan" ? <PlanTab /> : null}
            {tab === "money" ? <MoneyOutTab /> : null}
            {tab === "books" ? (
              <div className="h-[calc(100dvh-230px)] min-h-[640px]">
                <BooksSlot ws={ws} />
              </div>
            ) : null}
            {tab === "safety" ? <SafetyTab /> : null}
          </div>
        </main>

        {rail[railKey] ? (
          <AgentRail onHide={() => setRail((r) => ({ ...r, [railKey]: false }))} />
        ) : (
          <AgentStub onShow={() => setRail((r) => ({ ...r, [railKey]: true }))} />
        )}
      </div>

      <Toast />
    </div>
  );
}

export default function TrancheApp() {
  return (
    <TrancheProvider>
      <Shell />
    </TrancheProvider>
  );
}
