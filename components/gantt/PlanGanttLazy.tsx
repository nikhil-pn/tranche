"use client";

// Bryntum touches the DOM at import time, so the board is only ever loaded in the browser.
// Use this wrapper from pages: <PlanGanttLazy ws={ws} onPlanEdit={...} /> inside a parent with a height.

import dynamic from "next/dynamic";

const PlanGanttLazy = dynamic(() => import("./PlanGantt"), {
  ssr: false,
  loading: () => (
    <div
      style={{
        height: "100%",
        width: "100%",
        display: "grid",
        placeItems: "center",
        color: "var(--ink-3)",
        fontSize: 13,
      }}
    >
      Loading the plan board
    </div>
  ),
});

export default PlanGanttLazy;
export type { PlanEdit, EngineCheck } from "./PlanGantt";
