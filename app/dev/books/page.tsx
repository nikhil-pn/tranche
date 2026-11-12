"use client";

// Dev harness for Books: http://127.0.0.1:3400/dev/books
// Shows the sample workspace, a fresh one, and a button that changes the workspace so you can see the
// datasets update in place (the layout and the chat stay as they are).

import { useState } from "react";
import BooksStudio from "@/components/books/BooksStudioLazy";
import { makeSampleInProgress, makeSeed } from "@/lib/seed";
import { reflow, refreshGates } from "@/lib/schedule";
import type { Workspace } from "@/lib/types";

type Which = "sample" | "fresh";

function payGate(ws: Workspace, gateId: string): Workspace {
  const next = structuredClone(ws);
  const gate = next.gates.find((g) => g.id === gateId);
  if (!gate || gate.status === "paid") return ws;
  gate.status = "paid";
  gate.paidAt = next.today;
  reflow(next);
  refreshGates(next);
  next.rev += 1;
  return next;
}

export default function BooksDevPage() {
  const [which, setWhich] = useState<Which>("sample");
  const [ws, setWs] = useState<Workspace>(() => makeSampleInProgress());

  const load = (next: Which) => {
    setWhich(next);
    setWs(next === "sample" ? makeSampleInProgress() : makeSeed());
  };

  const g2 = ws.gates.find((g) => g.id === "g2");
  const firstUnpaid = ws.gates.find((g) => g.status !== "paid");

  return (
    <main className="flex h-dvh min-h-0 flex-col" style={{ background: "var(--paper)" }}>
      <div
        className="flex flex-none flex-wrap items-center gap-2 px-3 py-2 text-xs"
        style={{ borderBottom: "1px solid var(--line)", color: "var(--ink-2)", background: "var(--paper-2)" }}
      >
        <strong style={{ color: "var(--ink)" }}>Dev: Books</strong>
        <button type="button" data-testid="load-sample" onClick={() => load("sample")} style={btn(which === "sample")}>
          Sample in progress
        </button>
        <button type="button" data-testid="load-fresh" onClick={() => load("fresh")} style={btn(which === "fresh")}>
          Fresh project
        </button>
        <span aria-hidden="true">|</span>
        <button
          type="button"
          data-testid="pay-g2"
          disabled={!g2 || g2.status === "paid"}
          onClick={() => setWs((w) => payGate(w, "g2"))}
          style={btn(false, !g2 || g2.status === "paid")}
        >
          Mark gate g2 paid
        </button>
        <button
          type="button"
          data-testid="pay-next"
          disabled={!firstUnpaid}
          onClick={() => firstUnpaid && setWs((w) => payGate(w, firstUnpaid.id))}
          style={btn(false, !firstUnpaid)}
        >
          Mark next unpaid gate paid
        </button>
        <span className="num" data-testid="rev">
          rev {ws.rev} · today {ws.today} · g2 {g2?.status ?? "none"}
        </span>
      </div>
      <div className="min-h-0 flex-1">
        <BooksStudio ws={ws} className="h-full" />
      </div>
    </main>
  );
}

function btn(active: boolean, disabled = false): React.CSSProperties {
  return {
    padding: "4px 10px",
    borderRadius: 6,
    border: "1px solid var(--line)",
    background: active ? "var(--green-soft)" : "var(--card)",
    color: active ? "var(--green)" : "var(--ink)",
    opacity: disabled ? 0.45 : 1,
    cursor: disabled ? "default" : "pointer",
  };
}
