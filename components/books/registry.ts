// Registry type for Books: AG Studio's default widgets plus the one custom "Mandate" widget.
// Passing it to <AgStudio>, createWidgets and the report state keeps `type: "mandate"` type-checked.

import type { AgDefaultWidgetDefinition, AgWidgetData, AgWidgetDataFormat } from "ag-studio";
import type { AgRegistry, AgWidgetDefinition } from "ag-studio-react";
import type { Workspace } from "@/lib/types";

/** The Mandate widget reads the live workspace, so it maps no fields. */
export type MandateDataMapping = Record<string, never>;

export interface MandateWidgetState extends AgWidgetData<MandateDataMapping, AgWidgetDataFormat<unknown>> {
  type: "mandate";
}

export type MandateWidgetDefinition = AgWidgetDefinition<"mandate", MandateWidgetState>;

export interface BooksRegistry extends AgRegistry {
  widgets: readonly (AgDefaultWidgetDefinition | MandateWidgetDefinition)[];
}

/**
 * A tiny external store holding the current workspace. Studio's `context` is read once, so Books passes
 * this stable object as context and updates what it holds; custom widgets subscribe to it.
 */
export interface WorkspaceStore {
  get: () => Workspace;
  subscribe: (listener: () => void) => () => void;
}

export interface BooksContext {
  books: WorkspaceStore;
}
