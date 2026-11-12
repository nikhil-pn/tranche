"use client";

import { useEffect, useRef, useState } from "react";
import { useTranche, type AgentItem } from "@/lib/client/store";
import { fmtDay } from "@/lib/dates";
import type { AgentEvent } from "@/lib/types";
import { CodeField } from "./CodeField";
import { Button, cx, Spinner } from "./ui";

const DAILY_CHECK = "Review the project as of today and do whatever is needed.";
const STARTERS = ["What is blocking the schedule?", "Who is owed money right now?"];

function ToolRow({ it }: { it: Extract<AgentItem, { kind: "tool" }> }) {
  return (
    <div className="flex items-start gap-2 rounded-md border border-line bg-paper px-2.5 py-1.5">
      <span className="flex h-[18px] w-3 shrink-0 items-center justify-center">
        {it.status === "running" ? (
          <Spinner className="size-2.5 text-ink-2" />
        ) : (
          <span className={cx("size-2 rounded-full", it.status === "ok" ? "bg-green" : "bg-red")} />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className={cx("text-[12.5px] leading-[18px]", it.status === "failed" ? "text-red" : "text-ink")}>{it.label}</p>
        {it.summary ? <p className="text-[12px] leading-[1.4] break-words text-ink-2">{it.summary}</p> : null}
      </div>
    </div>
  );
}

function Transcript({ items, running }: { items: AgentItem[]; running: boolean }) {
  const last = items[items.length - 1];
  const thinking = running && (!last || last.kind === "user" || (last.kind === "tool" && last.status !== "running"));
  return (
    <div className="flex flex-col gap-2">
      {items.map((it, i) => {
        if (it.kind === "user") {
          return (
            <div key={i} className="mt-1 max-w-[88%] self-end rounded-xl rounded-br-sm bg-ink px-3 py-1.5 text-[13px] leading-[1.45] whitespace-pre-wrap text-paper">
              {it.text}
            </div>
          );
        }
        if (it.kind === "assistant") {
          return it.text.trim() ? (
            <p key={i} className="text-[13.5px] leading-[1.5] break-words whitespace-pre-wrap text-ink">
              {it.text.trim()}
            </p>
          ) : null;
        }
        if (it.kind === "tool") return <ToolRow key={i} it={it} />;
        return (
          <p key={i} className="rounded-md bg-red-soft px-2.5 py-1.5 text-[12.5px] leading-[1.4] text-red">
            {it.text}
          </p>
        );
      })}
      {thinking ? (
        <p className="flex items-center gap-2 text-[12.5px] text-ink-2">
          <Spinner className="size-2.5" /> Working
        </p>
      ) : null}
    </div>
  );
}

const ACTOR: Record<AgentEvent["actor"], string> = {
  agent: "bg-ink text-paper",
  human: "bg-blue-soft text-blue",
  paypal: "border border-line bg-card text-ink",
  gate: "bg-red-soft text-red",
  system: "bg-paper-2 text-ink-2",
};

const LEVEL: Record<AgentEvent["level"], string> = {
  info: "border-l-line",
  good: "border-l-green bg-green-soft/40",
  warn: "border-l-amber bg-amber-soft/50",
  bad: "border-l-red bg-red-soft/50",
};

function Activity({ events }: { events: AgentEvent[] }) {
  if (!events.length) {
    return <p className="px-1 py-6 text-center text-[13px] text-ink-2">Nothing has happened yet.</p>;
  }
  return (
    <ol className="flex flex-col gap-1.5">
      {[...events].reverse().map((e) => (
        <li key={e.id} className={cx("rounded-md border border-l-2 border-line px-2.5 py-2", LEVEL[e.level])}>
          <div className="flex items-center gap-2">
            <span
              className={cx(
                "rounded px-1.5 py-px text-[10.5px] leading-4 font-medium tracking-[0.05em] uppercase",
                ACTOR[e.actor],
              )}
            >
              {e.actor}
            </span>
            <span className="num ml-auto text-[12px] text-ink-2">{fmtDay(e.day)}</span>
          </div>
          <p className="mt-1 text-[13px] leading-[1.45] break-words text-ink">{e.text}</p>
          {e.ref ? <p className="num mt-0.5 text-[12px] break-all text-ink-2">{e.ref}</p> : null}
        </li>
      ))}
    </ol>
  );
}

/** The folded rail: a thin strip that brings the agent back. */
export function AgentStub({ onShow }: { onShow: () => void }) {
  const { agent } = useTranche();
  return (
    <aside className="flex h-full w-11 shrink-0 flex-col items-center border-l border-line bg-card pt-2.5">
      <button
        type="button"
        onClick={onShow}
        aria-label="Show the agent"
        title="Show the agent"
        className="flex flex-col items-center gap-2.5 rounded-md px-1.5 py-2 text-ink-2 transition-colors hover:bg-paper hover:text-ink"
      >
        <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
          <path d="M7.5 2.5 4 6l3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="display text-[19px] leading-none [writing-mode:vertical-rl]">Agent</span>
        {agent.running ? <Spinner className="size-3" /> : null}
      </button>
    </aside>
  );
}

export function AgentRail({ onHide }: { onHide?: () => void }) {
  const { ws, agent, runAgent, busy, config, codeNeeded } = useTranche();
  const [view, setView] = useState<"chat" | "activity">("chat");
  const [draft, setDraft] = useState("");
  const scroller = useRef<HTMLDivElement>(null);

  const offline = config !== null && config.agent === false;
  const blocked = agent.running || busy !== null || codeNeeded || offline;
  const eventCount = ws?.events.length ?? 0;

  // Keep the newest line in view.
  useEffect(() => {
    const el = scroller.current;
    if (el && view === "chat") el.scrollTop = el.scrollHeight;
  }, [agent.items, agent.running, view]);

  const send = (text: string) => {
    if (blocked || !text.trim()) return;
    setView("chat");
    setDraft("");
    void runAgent(text);
  };

  return (
    <aside className="flex h-full w-[380px] shrink-0 flex-col border-l border-line bg-card">
      <div className="shrink-0 border-b border-line px-4 pt-3.5 pb-3">
        <div className="flex items-center gap-2">
          <h2 className="display mr-auto text-[24px] leading-7">Agent</h2>
          <div className="flex rounded-md border border-line bg-paper p-0.5" role="tablist" aria-label="Agent view">
            {(["chat", "activity"] as const).map((v) => (
              <button
                key={v}
                type="button"
                role="tab"
                aria-selected={view === v}
                onClick={() => setView(v)}
                className={cx(
                  "rounded-[5px] px-2.5 py-1 text-[12.5px] leading-4 font-medium transition-colors",
                  view === v ? "bg-card text-ink shadow-[0_0_0_1px_var(--line)]" : "text-ink-2 hover:text-ink",
                )}
              >
                {v === "chat" ? "Chat" : `Activity${eventCount ? ` ${eventCount}` : ""}`}
              </button>
            ))}
          </div>
          {onHide ? (
            <button
              type="button"
              onClick={onHide}
              aria-label="Hide the agent"
              title="Hide the agent"
              className="-mr-1 flex size-7 items-center justify-center rounded-md text-ink-2 transition-colors hover:bg-paper hover:text-ink"
            >
              <svg viewBox="0 0 12 12" className="size-3" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden>
                <path d="M4.5 2.5 8 6 4.5 9.5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : null}
        </div>
        <p className="mt-1.5 text-[12.5px] leading-[1.45] text-ink-2">
          Claude with PayPal tools. It can invoice, remind, replan and propose payouts. It cannot pay anyone.
        </p>

        <div className="mt-3 flex flex-col gap-2">
          {codeNeeded ? <CodeField /> : null}
          {offline ? (
            <p className="rounded-lg border border-line bg-paper px-3 py-2 text-[12.5px] leading-[1.45] text-ink-2">
              The agent is offline (no model key on the server). Every step also works by hand from the gate cards.
            </p>
          ) : (
            <Button
              variant="primary"
              size="lg"
              className="w-full"
              loading={agent.running}
              disabled={blocked}
              onClick={() => send(DAILY_CHECK)}
            >
              {agent.running ? "Agent is working" : "Run today's check"}
            </Button>
          )}
        </div>
      </div>

      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {view === "activity" ? (
          <Activity events={ws?.events ?? []} />
        ) : agent.items.length ? (
          <Transcript items={agent.items} running={agent.running} />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-3 px-4 text-center">
            <p className="text-[13px] leading-[1.5] text-ink-2">
              Nothing yet. Run today&apos;s check, or ask about the plan, the invoices or who is owed what.
            </p>
            {!offline ? (
              <div className="flex flex-col gap-1.5">
                {STARTERS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    disabled={blocked}
                    onClick={() => send(s)}
                    className="rounded-full border border-line px-3 py-1 text-[12.5px] text-ink-2 transition-colors hover:border-ink-3 hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        )}
      </div>

      <form
        className="flex shrink-0 gap-2 border-t border-line p-3"
        onSubmit={(e) => {
          e.preventDefault();
          send(draft);
        }}
      >
        <input
          className="h-9 min-w-0 flex-1 rounded-md border border-line bg-card px-3 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3 disabled:bg-paper"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={offline ? "The agent is offline" : "Ask the agent"}
          disabled={agent.running || offline}
          aria-label="Message to the agent"
        />
        <Button type="submit" variant="primary" className="h-9" disabled={blocked || !draft.trim()}>
          Send
        </Button>
      </form>
    </aside>
  );
}
