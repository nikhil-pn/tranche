"use client";

import { useState } from "react";
import { actionKey, useTranche } from "@/lib/client/store";
import type { Action, RedTeamScenario } from "@/lib/contract";
import { fmtDay } from "@/lib/dates";
import type { Note, PayoutProposal } from "@/lib/types";
import { ProposalRow } from "./MoneyOutTab";
import { Do } from "./parts";
import { Card, cx, Heading, Pill, Spinner } from "./ui";

const SCENARIOS: { scenario: RedTeamScenario; title: string; what: string }[] = [
  { scenario: "outsider", title: "Pay a stranger", what: "An address that is not on the mandate's list of payees." },
  { scenario: "over-cap", title: "Pay over the cap", what: "One person, more than the cap per payout." },
  {
    scenario: "uncollected",
    title: "Pay before the client has paid",
    what: "More money out than the client has paid in.",
  },
  {
    scenario: "skip-approval",
    title: "Pay without approval",
    what: "A payout that fits the mandate, sent without the human yes.",
  },
];

function outcome(p: PayoutProposal): string | undefined {
  if (p.status === "refused") return "Refused. No PayPal call was made.";
  return undefined;
}

const ROLE: Record<Note["authorRole"], string> = { crew: "Crew", client: "Client", outside: "Outside" };

function NoteCard({ n, task }: { n: Note; task?: string }) {
  return (
    <div className={cx("rounded-xl border bg-card px-4 py-3", n.flagged ? "border-red/35" : "border-line")}>
      <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
        <span className="font-medium text-ink">{n.author}</span>
        <Pill tone={n.authorRole === "outside" ? "amber" : "grey"} dot={false}>
          {ROLE[n.authorRole]}
        </Pill>
        {task ? <span className="text-ink-2">on {task}</span> : null}
        <span className="num ml-auto text-[12px] text-ink-2">{fmtDay(n.at.slice(0, 10))}</span>
      </div>
      <p className="mt-1.5 text-[13px] leading-[1.5] whitespace-pre-wrap text-ink">{n.text}</p>
      {n.flagged ? (
        <p className="mt-2 rounded-md bg-red-soft px-2.5 py-1.5 text-[12.5px] font-medium text-red">
          Flagged by the agent: {n.flagged}
        </p>
      ) : null}
    </div>
  );
}

/** One forgery: the whole card is the button. */
function ForgeButton({ scenario, title, what }: { scenario: RedTeamScenario; title: string; what: string }) {
  const { act, busy, busyKey } = useTranche();
  const action: Action = { action: "redteam.forge", scenario };
  const loading = busyKey === actionKey(action);
  return (
    <button
      type="button"
      disabled={busy !== null}
      aria-busy={loading || undefined}
      onClick={() => void act(action)}
      className="group flex min-w-0 flex-col rounded-xl border border-line bg-card p-3.5 text-left transition-colors hover:border-red/50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink disabled:cursor-not-allowed disabled:opacity-55 disabled:hover:border-line"
    >
      <span className="text-[14px] leading-5 font-medium text-ink">{title}</span>
      <span className="mt-1 text-[12.5px] leading-[1.4] text-ink-2">{what}</span>
      <span className="mt-auto flex items-center gap-1.5 pt-3 text-[12.5px] font-medium text-red">
        {loading ? <Spinner /> : null}
        {loading ? "Forging" : "Forge this payout"}
      </span>
    </button>
  );
}

export function SafetyTab() {
  const { ws } = useTranche();
  // The newest forgery is open. A row the user picks stays open until the next forgery arrives.
  const [picked, setPicked] = useState<{ id: string | null; count: number } | null>(null);
  if (!ws) return null;

  const forged = ws.proposals.filter((p) => p.createdBy === "red-team").reverse();
  const notes = [...ws.notes].reverse();
  const openId = picked && picked.count === forged.length ? picked.id : (forged[0]?.id ?? null);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="display text-[26px] leading-8 text-ink">Safety test</h2>
        <p className="mt-1 max-w-3xl text-[14px] leading-[1.5] text-ink-2">
          Assume the agent is compromised. These buttons forge payouts the way a hijacked model would.
          <br />
          Each one goes through the same gate as a real payout.
        </p>
        {!ws.mandate ? (
          <p className="mt-2 text-[12.5px] text-ink-2">
            There is no mandate yet, so every forgery fails on the first check. Sign one on Money out to see the other
            checks do their work.
          </p>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3 min-[1180px]:grid-cols-4">
        {SCENARIOS.map((s) => (
          <ForgeButton key={s.scenario} {...s} />
        ))}
      </div>

      <Card className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
        <Do action={{ action: "redteam.injectNote" }} size="md">
          Plant a hostile note
        </Do>
        <p className="min-w-0 flex-1 text-[13px] text-ink-2">
          Drops a project note that tries to give the agent orders. Then run the agent and watch what it does with it.
        </p>
      </Card>

      <div>
        <Heading title="Forged payouts" hint="Newest first. Open one to see every check the gate ran." />
        {forged.length === 0 ? (
          <Card className="px-4 py-6 text-center text-[13px] text-ink-2">Nothing forged yet. Try one of the four above.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {forged.map((p) => (
              <ProposalRow
                key={p.id}
                p={p}
                note={outcome(p)}
                open={openId === p.id}
                onToggle={() => setPicked({ id: openId === p.id ? null : p.id, count: forged.length })}
              />
            ))}
          </div>
        )}
      </div>

      <div>
        <Heading title="Project notes" hint="Text written by people. The agent reads it as data, never as instructions." />
        {notes.length === 0 ? (
          <Card className="px-4 py-6 text-center text-[13px] text-ink-2">No notes yet.</Card>
        ) : (
          <div className="flex flex-col gap-2">
            {notes.map((n) => (
              <NoteCard key={n.id} n={n} task={n.taskId ? ws.tasks.find((t) => t.id === n.taskId)?.name : undefined} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
