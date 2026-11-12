"use client";

// Books: the project's money as an AG Studio workspace. One dashboard to start from, every dataset
// available to build more, a custom Mandate widget, and an assistant backed by Claude.
//
// Import through ./BooksStudioLazy (Studio needs the browser).

import { useEffect, useMemo, useRef, useState } from "react";
import { AgStudioAiModule, enableStudioDevValidations } from "ag-studio";
import type { AgPanelConfig, AgWidgetsConfig } from "ag-studio";
import { AgStudio, AgStudioProvider, createWidgets } from "ag-studio-react";
import type { Workspace } from "@/lib/types";
import { fmtDay } from "@/lib/dates";
import { createBooksAi } from "./ai";
import { createBooksCellRenderer } from "./cells";
import { buildDefaultReport } from "./defaultReport";
import { mandateWidgetDefinition } from "./MandateWidget";
import type { BooksContext, BooksRegistry, WorkspaceStore } from "./registry";
import { buildStudioData } from "./studioData";
import { booksTheme } from "./theme";
import "./books.css";

if (process.env.NODE_ENV !== "production") enableStudioDevValidations();

export interface BooksStudioProps {
  ws: Workspace;
  className?: string;
}

type Mode = "view" | "edit";

const MODULES = [AgStudioAiModule];
const STUDIO_STYLE = { width: "100%", height: "100%" } as const;
const LAYOUT = { widgetBorderEnabled: true } as const;

// The assistant sits on the right while customising; the building tools stay folded on the left.
const PANELS: AgPanelConfig = {
  edit: { left: ["edit", "data", "filters"], right: ["ai"] },
  view: { right: ["filters"] },
};

const widgets = (config: AgWidgetsConfig) =>
  createWidgets<BooksRegistry>({
    additionalTypes: [mandateWidgetDefinition],
    overrides: [{ id: "grid", options: { createCellRenderer: createBooksCellRenderer } }],
    menu: [{ label: "Tranche", widgetIds: ["mandate"] }, ...config.menu],
  });

export default function BooksStudio({ ws, className }: BooksStudioProps) {
  const [mode, setMode] = useState<Mode>("edit");

  // Everything Studio reads once is created once, so a new workspace never rebuilds Studio.
  const wsRef = useRef(ws);
  const listenersRef = useRef(new Set<() => void>());
  const [store] = useState<WorkspaceStore>(() => ({
    get: () => wsRef.current,
    subscribe: (listener) => {
      listenersRef.current.add(listener);
      return () => {
        listenersRef.current.delete(listener);
      };
    },
  }));
  const [context] = useState<BooksContext>(() => ({ books: store }));
  const [initialState] = useState(buildDefaultReport);
  const [ai] = useState(createBooksAi);

  useEffect(() => {
    wsRef.current = ws;
    listenersRef.current.forEach((listener) => listener());
  }, [ws]);

  // Same sources and fields every time, new rows: Studio applies this in place.
  const data = useMemo(() => buildStudioData(ws), [ws]);

  return (
    <section className={className ? `bk-root ${className}` : "bk-root"} aria-label="Books">
      <header className="bk-bar">
        <div className="bk-bar-title">
          <h2>Books</h2>
          <span className="bk-bar-sub">
            {ws.project.name} · as of {fmtDay(ws.today)}
          </span>
        </div>
        <div className="bk-seg" role="group" aria-label="Books mode">
          <button type="button" aria-pressed={mode === "view"} onClick={() => setMode("view")}>
            Read
          </button>
          <button type="button" aria-pressed={mode === "edit"} onClick={() => setMode("edit")}>
            Ask and build
          </button>
        </div>
      </header>
      <div className="bk-stage">
        <div className="bk-studio">
          <AgStudioProvider modules={MODULES}>
            <AgStudio<BooksRegistry>
              style={STUDIO_STYLE}
              theme={booksTheme}
              layout={LAYOUT}
              data={data}
              mode={mode}
              initialState={initialState}
              widgets={widgets}
              context={context}
              panels={PANELS}
              ai={ai}
            />
          </AgStudioProvider>
        </div>
      </div>
    </section>
  );
}
