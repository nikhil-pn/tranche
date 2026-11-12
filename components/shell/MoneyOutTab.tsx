"use client";

import { useState, type ReactNode } from "react";
import { useTranche } from "@/lib/client/store";
import { diffDays, fmtDay } from "@/lib/dates";
import { collected, crewLedger, paidOut } from "@/lib/schedule";
import type { PayoutProposal, PayoutReceipt, Workspace } from "@/lib/types";
import { CheckList, Do, failedChecks, ItemsTable } from "./parts";
import { Button, Card, cx, Heading, Label, Money, Pill, payoutTone, plural, short, type Tone } from "./ui";

// ---------- mandate ----------

const FIELD =
  "h-8 w-full rounded-md border border-line bg-card px-2.5 text-[13px] text-ink outline-none placeholder:text-ink-3 focus:border-ink-3";

function MandateForm({ ws }: { ws: Workspace }) {
  const { act, busy } = useTranche();
  const [signedBy, setSignedBy] = useState("Sam Rivera");
  const [cap, setCap] = useState("2500");
  const [budget, setBudget] = useState("7000");
  const [days, setDays] = useState("45");
  const [purpose, setPurpose] = useState("Crew fees for the Northwind Coffee brand site");
  const [off, setOff] = useState<string[]>([]);

  const payees = ws.crew.map((c) => c.email).filter((e) => !off.includes(e));
  const capN = Number(cap);
  const budgetN = Number(budget);
  const daysN = Math.floor(Number(days));
  const valid =
    signedBy.trim().length > 0 && capN > 0 && budgetN > 0 && daysN >= 1 && payees.length > 0 && purpose.trim().length > 0;
  const signing = busy === "mandate.sign";

  const sign = () => {
    if (!valid) return;
    void act({
      action: "mandate.sign",
      signedBy: signedBy.trim(),
      perPayoutCap: capN,
      totalBudget: budgetN,
      payees,
      validDays: daysN,
      purpose: purpose.trim(),
    });
  };

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="display text-[22px] leading-7">Mandate</h2>
        <Pill tone="grey">Not signed</Pill>
      </div>
      <p className="mt-1 text-[13px] text-ink-2">
        The agent can propose payouts. Nothing is paid outside what you sign here.
      </p>

      <form
        className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2.5"
        onSubmit={(e) => {
          e.preventDefault();
          sign();
        }}
      >
        <label className="col-span-2 flex flex-col gap-1">
          <Label>Signed by</Label>
          <input className={FIELD} value={signedBy} onChange={(e) => setSignedBy(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Cap per payout (USD)</Label>
          <input className={cx(FIELD, "num")} inputMode="decimal" value={cap} onChange={(e) => setCap(e.target.value)} />
        </label>
        <label className="flex flex-col gap-1">
          <Label>Total budget (USD)</Label>
          <input className={cx(FIELD, "num")} inputMode="decimal" value={budget} onChange={(e) => setBudget(e.target.value)} />
        </label>

        <fieldset className="col-span-2 flex flex-col gap-1">
          <legend className="mb-1">
            <Label>People who may be paid</Label>
          </legend>
          <div className="overflow-hidden rounded-md border border-line">
            {ws.crew.map((c, i) => (
              <label
                key={c.id}
                className={cx("flex cursor-pointer items-center gap-2.5 px-2.5 py-1.5", i > 0 && "border-t border-line")}
              >
                <input
                  type="checkbox"
                  className="size-3.5 accent-[var(--ink)]"
                  checked={!off.includes(c.email)}
                  onChange={(e) =>
                    setOff((xs) => (e.target.checked ? xs.filter((x) => x !== c.email) : [...xs, c.email]))
                  }
                />
                <span className="text-[13px] font-medium text-ink">{c.name}</span>
                <span className="num ml-auto truncate text-[12px] text-ink-2">{c.email}</span>
              </label>
            ))}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1">
          <Label>Valid for (days)</Label>
          <input className={cx(FIELD, "num")} inputMode="numeric" value={days} onChange={(e) => setDays(e.target.value)} />
        </label>
        <div className="flex flex-col gap-1">
          <Label>Rule</Label>
          <p className="flex h-8 items-center text-[13px] text-ink">Only money already collected</p>
        </div>
        <label className="col-span-2 flex flex-col gap-1">
          <Label>Purpose</Label>
          <input className={FIELD} value={purpose} onChange={(e) => setPurpose(e.target.value)} />
        </label>

        <div className="col-span-2 mt-1 flex items-center gap-3">
          <Button type="submit" variant="primary" size="lg" loading={signing} disabled={!valid || busy !== null}>
            Sign mandate
          </Button>
          {!valid ? <span className="text-[12.5px] text-ink-2">Fill every field and pick at least one person.</span> : null}
        </div>
      </form>
    </Card>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[112px_1fr] items-baseline gap-3 border-t border-line py-2 first:border-t-0">
      <dt>
        <Label>{label}</Label>
      </dt>
      <dd className="min-w-0 text-[13px] text-ink">{children}</dd>
    </div>
  );
}

function MandateSummary({ ws }: { ws: Workspace }) {
  const m = ws.mandate;
  if (!m) return null;
  const used = paidOut(ws);
  const pct = m.totalBudget > 0 ? Math.min(100, Math.round((used / m.totalBudget) * 100)) : 0;
  const daysLeft = diffDays(ws.today, m.expiresAt);
  const expired = daysLeft < 0;

  return (
    <Card className="p-4">
      <div className="flex items-start justify-between gap-3">
        <h2 className="display text-[22px] leading-7">Mandate</h2>
        {expired ? <Pill tone="red">Expired</Pill> : <Pill tone="green">Signed by {m.signedBy}</Pill>}
      </div>
      <p className="mt-1 text-[13px] text-ink-2">{m.purpose}</p>

      <dl className="mt-2">
        <Row label="Cap per payout">
          <Money n={m.perPayoutCap} /> <span className="text-ink-2">to any one person, per payout</span>
        </Row>
        <Row label="Budget used">
          <div className="flex items-baseline gap-1.5">
            <Money n={used} />
            <span className="text-ink-2">of</span>
            <Money n={m.totalBudget} />
            <span className="num ml-auto text-[12px] text-ink-2">{pct}%</span>
          </div>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-paper-2">
            <div className="h-full rounded-full bg-ink" style={{ width: `${pct}%` }} />
          </div>
        </Row>
        <Row label="Payees">
          <ul className="flex flex-col gap-0.5">
            {m.payees.map((email) => {
              const person = ws.crew.find((c) => c.email.toLowerCase() === email.toLowerCase());
              return (
                <li key={email} className="flex min-w-0 items-baseline gap-2">
                  {person ? <span className="shrink-0">{person.name}</span> : null}
                  <span className="num truncate text-[12px] text-ink-2">{email}</span>
                </li>
              );
            })}
          </ul>
        </Row>
        <Row label="Expires">
          <span className={cx(expired && "font-medium text-red")}>{fmtDay(m.expiresAt)}</span>{" "}
          <span className="text-ink-2">
            {expired ? `(${plural(-daysLeft, "day")} ago)` : daysLeft === 0 ? "(today)" : `(in ${plural(daysLeft, "day")})`}
          </span>
        </Row>
        <Row label="Rule">Only money already collected from the client</Row>
        <Row label="Signature">
          <div className="flex items-baseline justify-between gap-3">
            <span className="num text-[12px] text-ink-2" title={m.sig}>
              {m.id} · {short(m.sig, 16)}
            </span>
            <Do
              action={{ action: "mandate.revoke" }}
              variant="danger"
              confirm="Revoke the mandate? No payout can be approved until a new one is signed."
            >
              Revoke
            </Do>
          </div>
        </Row>
      </dl>
    </Card>
  );
}

// ---------- crew ----------

function CrewTable({ ws }: { ws: Workspace }) {
  const lines = crewLedger(ws);
  const sum = (k: "earned" | "paid" | "owed" | "waitingOnClient") => lines.reduce((s, l) => s + l[k], 0);
  const thBase = "py-2 text-[11px] font-medium tracking-[0.06em] text-ink-2 uppercase";
  const th = cx(thBase, "px-3 text-right");
  const td = "px-3 py-2.5 text-right";
  return (
    <Card className="flex flex-col overflow-hidden">
      <div className="px-4 pt-4 pb-3">
        <h2 className="display text-[22px] leading-7">Crew</h2>
        <p className="mt-1 text-[13px] text-ink-2">
          A fee is earned when the task is delivered and the client has paid for that phase. Collected so far:{" "}
          <Money n={collected(ws)} className="text-ink" />.
        </p>
      </div>
      <table className="w-full border-collapse text-[13px]">
        <thead className="border-y border-line bg-paper">
          <tr>
            <th className={cx(thBase, "pr-3 pl-4 text-left")}>Name</th>
            <th className={th}>Earned</th>
            <th className={th}>Paid</th>
            <th className={th}>Owed</th>
            <th className={cx(th, "pr-4")}>Waiting on client</th>
          </tr>
        </thead>
        <tbody>
          {lines.map((l) => {
            const person = ws.crew.find((c) => c.id === l.personId);
            return (
              <tr key={l.personId} className="border-b border-line">
                <td className="py-2.5 pr-3 pl-4">
                  <div className="flex items-center gap-2">
                    <span className="size-2 shrink-0 rounded-full" style={{ background: person?.color ?? "var(--ink-3)" }} />
                    <span className="font-medium text-ink">{l.name}</span>
                  </div>
                  <div className="pl-4 text-[12px] text-ink-2">{person?.role}</div>
                </td>
                <td className={td}>
                  <Money n={l.earned} />
                </td>
                <td className={td}>
                  <Money n={l.paid} className="text-ink-2" />
                </td>
                <td className={td}>
                  <Money n={l.owed} className={cx("font-medium", l.owed > 0 ? "text-ink" : "text-ink-3")} />
                </td>
                <td className={cx(td, "pr-4")}>
                  <Money n={l.waitingOnClient} className={l.waitingOnClient > 0 ? "text-amber" : "text-ink-3"} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="bg-paper">
            <td className="py-2.5 pr-3 pl-4 font-medium text-ink">Total</td>
            <td className={td}>
              <Money n={sum("earned")} />
            </td>
            <td className={td}>
              <Money n={sum("paid")} />
            </td>
            <td className={td}>
              <Money n={sum("owed")} className="font-medium" />
            </td>
            <td className={cx(td, "pr-4")}>
              <Money n={sum("waitingOnClient")} />
            </td>
          </tr>
        </tfoot>
      </table>
    </Card>
  );
}

// ---------- proposals ----------

export function proposedBy(p: PayoutProposal): string {
  return p.createdBy === "red-team" ? "Forged in the safety test" : "Proposed by the agent";
}

const PROPOSAL_TONE: Record<PayoutProposal["status"], Tone> = {
  pending: "amber",
  paid: "green",
  rejected: "grey",
  refused: "red",
};

const PROPOSAL_LABEL: Record<PayoutProposal["status"], string> = {
  pending: "Waiting for approval",
  paid: "Paid",
  rejected: "Rejected by a person",
  refused: "Refused by the gate",
};

/** The approval screen. This is the only place money can leave from. */
function Approval({ ws, p }: { ws: Workspace; p: PayoutProposal }) {
  const approver = ws.mandate?.signedBy ?? "Owner";
  const failing = failedChecks(p);
  const forged = p.createdBy === "red-team";

  return (
    <section className="overflow-hidden rounded-xl border-2 border-ink bg-card">
      <header className="flex items-center justify-between gap-4 bg-ink px-5 py-2.5 text-paper">
        <span className="text-[12px] font-medium tracking-[0.08em] uppercase">Approval needed</span>
        <span className="num text-[12px] text-paper/75">
          {p.id} · hash {short(p.hash, 12)}
        </span>
      </header>

      <div className="px-5 pt-4 pb-5">
        <p className="display text-[30px] leading-9 text-ink">
          Pay <Money n={p.total} className="text-[26px] not-italic" /> to {plural(p.items.length, "person", "people")}
        </p>
        <p className="mt-1 text-[13px] text-ink-2">
          <span className={cx("font-medium", forged ? "text-red" : "text-ink")}>{proposedBy(p)}</span>
          {" · "}goes out through PayPal Payouts, approved as {approver}
        </p>

        <div className="mt-4 grid grid-cols-1 gap-5 min-[1500px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-3">
            <div>
              <Label>Reason</Label>
              <p className="mt-1 text-[14px] leading-[1.45] text-ink">{p.reason}</p>
            </div>
            <ItemsTable items={p.items} total={p.total} large />
          </div>

          <div className="min-w-0">
            <Label>Gate checks</Label>
            <div className="mt-2 rounded-lg border border-line bg-paper px-3 py-2.5">
              <CheckList checks={p.checks} pending />
            </div>
          </div>
        </div>

        {failing.length ? (
          <p className="mt-4 rounded-md bg-red-soft px-3 py-2 text-[13px] text-red">
            {plural(failing.length, "check")} would fail right now. The gate will refuse this payout unless that changes.
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-line pt-4">
          <Do
            action={{ action: "payout.approve", proposalId: p.id, hash: p.hash, approver }}
            variant="primary"
            size="lg"
            disabled={!ws.mandate}
          >
            Approve and pay with PayPal
          </Do>
          <Do action={{ action: "payout.reject", proposalId: p.id, approver }} size="lg">
            Reject
          </Do>
          <p className="min-w-0 flex-1 text-[12.5px] leading-[1.4] text-ink-2">
            {ws.mandate
              ? "Your approval is bound to the hash above. If one name or amount changes, the approval no longer counts."
              : "Sign a mandate first. Without one, nothing can be approved."}
          </p>
        </div>
      </div>
    </section>
  );
}

/** A decided proposal: one line that opens to show the people and the checks. */
export function ProposalRow({
  p,
  note,
  open: openProp,
  onToggle,
}: {
  p: PayoutProposal;
  /** A line shown above the failed checks of a refused proposal. */
  note?: string;
  /** Pass both to control the row from outside. */
  open?: boolean;
  onToggle?: () => void;
}) {
  const [own, setOwn] = useState(false);
  const open = openProp ?? own;
  const failing = failedChecks(p);
  const refused = p.status === "refused";

  return (
    <div className={cx("rounded-xl border bg-card", refused ? "border-red/35" : "border-line")}>
      <button
        type="button"
        onClick={() => (onToggle ? onToggle() : setOwn((o) => !o))}
        aria-expanded={open}
        className="flex w-full items-center gap-3 px-4 py-2.5 text-left"
      >
        <svg
          viewBox="0 0 12 12"
          className={cx("size-3 shrink-0 text-ink-2 transition-transform", open && "rotate-90")}
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          aria-hidden
        >
          <path d="m4.5 2.5 3.5 3.5-3.5 3.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        <span className="num w-10 shrink-0 text-[12px] text-ink-2">{p.id}</span>
        <span className="min-w-0 flex-1 truncate text-[13px] text-ink">
          <span className="font-medium">{proposedBy(p)}</span>
          <span className="text-ink-2">
            {" · "}
            {p.items.map((i) => i.name).join(", ")}
          </span>
        </span>
        <Money n={p.total} className={cx("shrink-0 text-[13px]", refused && "text-red line-through decoration-red/50")} />
        <Pill tone={PROPOSAL_TONE[p.status]}>{PROPOSAL_LABEL[p.status]}</Pill>
      </button>

      {refused ? (
        <div className="border-t border-red/20 bg-red-soft/60 px-4 py-2.5 text-[12.5px] leading-[1.45] text-red">
          {note ? <p className="font-medium">{note}</p> : null}
          {failing.length ? (
            <ul className={cx("flex flex-col gap-0.5", note && "mt-1")}>
              {failing.map((c) => (
                <li key={c.id}>
                  <span className="font-medium">{c.label}:</span> {c.detail}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}

      {open ? (
        <div className="grid grid-cols-1 gap-4 border-t border-line px-4 py-3.5 min-[1500px]:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-2.5">
            <p className="text-[13px] leading-[1.45] text-ink-2">{p.reason}</p>
            <ItemsTable items={p.items} total={p.total} />
            <p className="num text-[12px] text-ink-2">
              hash {short(p.hash, 16)}
              {p.receiptSeq ? ` · receipt #${p.receiptSeq}` : ""}
            </p>
          </div>
          <div className="min-w-0">
            <Label>Gate checks</Label>
            <div className="mt-2">
              <CheckList checks={p.checks} pending={p.status === "pending"} dense />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ---------- receipts ----------

function Receipt({ r }: { r: PayoutReceipt }) {
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
        <span className="num text-[12px] text-ink-2">#{r.seq}</span>
        <span className="text-[13px] text-ink-2">PayPal payout batch</span>
        <span className="num text-[13px] font-medium text-ink">{r.payoutBatchId}</span>
        <Pill tone={payoutTone(r.status)}>{r.status}</Pill>
        <Money n={r.total} className="ml-auto text-[15px] font-medium" />
      </div>
      <div className="px-4 pb-3">
        <ItemsTable items={r.items} total={r.total} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-1 border-t border-line bg-paper px-4 py-2 text-[12px] text-ink-2">
        <span>
          Approved by <span className="font-medium text-ink">{r.approvedBy}</span> · proposal{" "}
          <span className="num">{r.proposalId}</span> · mandate <span className="num">{r.mandateId}</span>
        </span>
        <span className="num" title={`prev ${r.prevHash}\nthis ${r.hash}`}>
          prev {short(r.prevHash)} <span className="px-1 text-ink-3">→</span> this {short(r.hash)}
        </span>
      </div>
    </Card>
  );
}

// ---------- tab ----------

export function MoneyOutTab() {
  const { ws } = useTranche();
  if (!ws) return null;

  const proposals = [...ws.proposals].reverse();
  const pending = proposals.filter((p) => p.status === "pending");
  const decided = proposals.filter((p) => p.status !== "pending");
  const receipts = [...ws.receipts].sort((a, b) => b.seq - a.seq);

  return (
    <div className="flex flex-col gap-6">
      {pending.length ? (
        <div className="flex flex-col gap-3">
          {pending.map((p) => (
            <Approval key={p.id} ws={ws} p={p} />
          ))}
        </div>
      ) : null}

      <div className="grid grid-cols-1 items-start gap-4 min-[1380px]:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        {ws.mandate ? <MandateSummary ws={ws} /> : <MandateForm ws={ws} />}
        <CrewTable ws={ws} />
      </div>

      <div>
        <Heading
          title="Payout proposals"
          hint="The agent proposes. The gate checks. A person approves. Only then does PayPal get a call."
        />
        {pending.length === 0 && decided.length === 0 ? (
          <Card className="px-4 py-6 text-center text-[13px] text-ink-2">
            No proposals yet. Run the agent once the client has paid a phase and it will propose the crew split.
          </Card>
        ) : null}
        {pending.length > 0 && decided.length === 0 ? (
          <p className="text-[13px] text-ink-2">
            {plural(pending.length, "proposal")} waiting for your decision at the top of this page.
          </p>
        ) : null}
        <div className="flex flex-col gap-2">
          {decided.map((p) => (
            <ProposalRow key={p.id} p={p} />
          ))}
        </div>
      </div>

      <div>
        <Heading
          title="PayPal payout receipts"
          hint="One receipt per approved payout. Each one commits to the hash of the receipt before it."
        />
        {receipts.length === 0 ? (
          <Card className="px-4 py-6 text-center text-[13px] text-ink-2">Nothing has been paid out yet.</Card>
        ) : (
          <div className="flex flex-col gap-3">
            {receipts.map((r) => (
              <Receipt key={r.seq} r={r} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
