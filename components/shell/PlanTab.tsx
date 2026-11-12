"use client";

import { useCallback } from "react";
import { useTranche } from "@/lib/client/store";
import type { PlanChange } from "@/lib/contract";
import { diffDays, fmtDay } from "@/lib/dates";
import { gateTask } from "@/lib/schedule";
import type { Gate, GateStatus, Workspace } from "@/lib/types";
import { Do } from "./parts";
import { PlanSlot } from "./slots";
import { AMBER_TEXT, Card, cx, GATE_TONE, Heading, Label, LinkButton, Money, Pill, plural } from "./ui";

function statusLabel(g: Gate): string {
  const deposit = g.kind === "deposit";
  const labels: Record<GateStatus, string> = {
    locked: "Locked",
    ready: deposit ? "Ready to request" : "Ready to invoice",
    invoiced: deposit ? "Waiting for approval" : "Invoice sent",
    held: "Held by PayPal",
    paid: "Paid",
    overdue: "Overdue",
  };
  return labels[g.status];
}

function reference(g: Gate): { label: string; value: string } | null {
  if (g.kind === "deposit") return g.orderId ? { label: "Order", value: g.orderId } : null;
  const value = g.invoiceNumber ?? g.invoiceId;
  return value ? { label: "Invoice", value } : null;
}

function GateCard({ ws, gate }: { ws: Workspace; gate: Gate }) {
  const g = gate;
  const deposit = g.kind === "deposit";
  const waiting = g.status === "invoiced" || g.status === "overdue";
  const ref = reference(g);
  const phase = ws.phases.find((p) => p.id === g.phaseId);
  const planned = gateTask(ws, g.id)?.start;
  const lateBy = g.status === "overdue" && g.due ? diffDays(g.due, ws.today) : 0;
  const replanned = g.expected && g.status !== "paid" && g.expected !== g.due ? g.expected : undefined;

  return (
    <Card className="flex min-w-0 flex-col p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <Label className="whitespace-nowrap">{deposit ? "Deposit" : "Invoice"}</Label>
        <Pill tone={GATE_TONE[g.status]}>{statusLabel(g)}</Pill>
      </div>
      <h3 className="mt-2 text-[14px] leading-5 font-medium text-ink">{g.name}</h3>
      <Money n={g.amount} className="mt-0.5 text-[24px] leading-8 text-ink" />

      <dl className="mt-1.5 flex flex-col gap-0.5 text-[12.5px] leading-[18px] text-ink-2">
        {g.status === "paid" ? (
          <div className="font-medium text-green">Paid {fmtDay(g.paidAt)}</div>
        ) : g.due ? (
          <div className={cx(g.status === "overdue" && "font-medium text-red")}>
            Due {fmtDay(g.due)}
            {lateBy > 0 ? `, ${plural(lateBy, "day")} late` : ""}
          </div>
        ) : planned ? (
          <div>
            Planned for {fmtDay(planned)}
            {!deposit ? `, net ${plural(g.netDays, "day")}` : ""}
          </div>
        ) : null}
        {replanned ? <div className={cx("font-medium", AMBER_TEXT)}>Replanned to {fmtDay(replanned)}</div> : null}
        {ref ? (
          <div className="flex min-w-0 gap-1.5">
            <span className="shrink-0">{ref.label}</span>
            <span className="num truncate text-ink" title={ref.value}>
              {ref.value}
            </span>
          </div>
        ) : null}
        {g.remindersSent > 0 ? (
          <div>
            {plural(g.remindersSent, "reminder")} sent
            {g.lastReminderAt ? `, last on ${fmtDay(g.lastReminderAt)}` : ""}
          </div>
        ) : null}
      </dl>

      <div className="mt-auto pt-3">
        {g.status === "locked" ? (
          <p className="text-[12.5px] text-ink-2">
            {deposit || !phase ? "Not open yet." : `Opens when ${phase.name} is delivered.`}
          </p>
        ) : null}

        {g.status === "ready" && deposit ? (
          <Do action={{ action: "gate.requestHold", gateId: g.id }} variant="primary" size="md" className="w-full">
            Request hold
          </Do>
        ) : null}
        {g.status === "ready" && !deposit ? (
          <Do action={{ action: "gate.raiseInvoice", gateId: g.id }} variant="primary" size="md" className="w-full">
            Send invoice
          </Do>
        ) : null}

        {waiting ? (
          <div className="flex flex-col gap-2">
            <div className="flex flex-wrap gap-1.5">
              {g.payUrl ? (
                <LinkButton href={g.payUrl} size="sm">
                  {deposit ? "Open PayPal approval" : "Open invoice"}
                </LinkButton>
              ) : null}
              <Do action={{ action: "sync" }}>Check PayPal</Do>
              {!deposit && g.status === "overdue" ? (
                <Do action={{ action: "gate.remind", gateId: g.id }}>Send reminder</Do>
              ) : null}
            </div>
            {!deposit ? (
              <Do action={{ action: "gate.recordPayment", gateId: g.id }} variant="quiet" className="self-start">
                Record off-PayPal payment (demo shortcut)
              </Do>
            ) : null}
          </div>
        ) : null}

        {g.status === "held" ? (
          <div className="flex flex-col gap-2">
            <p className="text-[12.5px] font-medium text-blue">Funds held by PayPal</p>
            <Do action={{ action: "gate.captureDeposit", gateId: g.id }} variant="primary" size="md" className="w-full">
              Capture deposit
            </Do>
          </div>
        ) : null}

        {g.status === "paid" ? (
          <p className="text-[12.5px] text-ink-2">{deposit ? "Deposit captured." : "Collected from the client."}</p>
        ) : null}
      </div>
    </Card>
  );
}

export function PlanTab() {
  const { ws, act, config } = useTranche();

  const onPlanEdit = useCallback(
    (changes: PlanChange[]) => {
      if (changes.length) void act({ action: "plan.update", changes });
    },
    [act],
  );

  if (!ws) return null;
  const waitingOnClient = ws.gates.some((g) => g.status === "invoiced" || g.status === "overdue");
  const buyer = config?.sandboxBuyerEmail;
  const buyerPassword = config?.sandboxBuyerPassword;

  return (
    <div className="flex flex-col gap-5">
      <div className="h-[clamp(400px,calc(100dvh-420px),640px)] min-w-0">
        <PlanSlot ws={ws} onPlanEdit={onPlanEdit} />
      </div>

      <div>
        <Heading
          title="Payment gates"
          hint="Work behind a gate starts when its money arrives. A late payment moves everything after it."
        />
        <div className="grid grid-cols-2 gap-3 min-[1180px]:grid-cols-4">
          {ws.gates.map((g) => (
            <GateCard key={g.id} ws={ws} gate={g} />
          ))}
        </div>
        {waitingOnClient ? (
          <p className="mt-3 text-[12.5px] leading-[1.6] text-ink-2">
            To pay as the client, open the link and log in to the PayPal sandbox
            {buyer ? (
              <>
                {" "}
                as <span className="num whitespace-nowrap text-ink select-all">{buyer}</span>
              </>
            ) : null}
            {buyer && buyerPassword ? (
              <>
                {" "}
                with the password <span className="num whitespace-nowrap text-ink select-all">{buyerPassword}</span>
              </>
            ) : null}
            .{buyer && buyerPassword ? " It is a test account with test money." : " The password is in the README."}
          </p>
        ) : null}
      </div>
    </div>
  );
}
