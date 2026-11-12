"use client";

// Grid cell renderers for Books. Fields carry a `context.kind` (see ./studioData.ts); the grid widget's
// `createCellRenderer` option hands the field back here, so every grid a person or the assistant adds
// gets the same status pills, mono money and mono PayPal references.

import type { ComponentType } from "react";
import type { AgWidgetField } from "ag-studio";
import type { AgWidgetCustomCellRendererProps } from "ag-studio-react";
import { toneForStatus } from "./datasets";
import type { BooksFieldContext } from "./studioData";

type Cell = ComponentType<AgWidgetCustomCellRendererProps>;

function label(props: AgWidgetCustomCellRendererProps): string {
  if (props.valueFormatted != null && props.valueFormatted !== "") return String(props.valueFormatted);
  return props.value == null ? "" : String(props.value);
}

const StatusCell: Cell = (props) => {
  const text = label(props);
  if (!text) return null;
  return <span className={`bk-pill bk-pill-${toneForStatus(text)}`}>{text}</span>;
};

const MoneyCell: Cell = (props) => {
  const zero = props.value === 0;
  return <span className={zero ? "bk-num bk-num-zero" : "bk-num"}>{label(props)}</span>;
};

const NumberCell: Cell = (props) => <span className="bk-num">{label(props)}</span>;

/** Days late, slip days: anything above zero is a problem worth seeing. */
const LateCell: Cell = (props) => {
  const n = typeof props.value === "number" ? props.value : null;
  if (n == null) return <span className="bk-num bk-num-zero">-</span>;
  return <span className={n > 0 ? "bk-num bk-num-late" : "bk-num bk-num-zero"}>{n}</span>;
};

const RefCell: Cell = (props) => {
  const text = label(props);
  return text ? <span className="bk-ref">{text}</span> : <span className="bk-num-zero">-</span>;
};

const YesNoCell: Cell = (props) => {
  if (props.value == null) return null;
  return props.value ? <span className="bk-pill bk-pill-amber">Yes</span> : <span className="bk-num-zero">No</span>;
};

const LATE_FIELDS = new Set(["receivables.daysLate", "tasks.slipDays"]);

export function createBooksCellRenderer(field: AgWidgetField): Cell | undefined {
  // Aggregated values (a sum of days late, a count of statuses) are plain numbers.
  const kind = (field.context as BooksFieldContext | undefined)?.kind;
  if (!kind) return undefined;
  if (kind === "money") return MoneyCell;
  if (field.aggregation) return kind === "number" ? NumberCell : undefined;
  if (kind === "status") return StatusCell;
  if (kind === "ref") return RefCell;
  if (kind === "yesno") return YesNoCell;
  if (kind === "number") return LATE_FIELDS.has(String(field.fieldId)) ? LateCell : NumberCell;
  return undefined;
}
