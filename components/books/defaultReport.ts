// The default Books dashboard, as AG Studio report state. Field ids ("receivables.amount") refer to the
// data sources in ./studioData.ts. The canvas is 24 columns wide with rows of 18px (see ./theme.ts).

import type { AgPageState, AgReportState, AgWidgetLayoutState } from "ag-studio";
import type { BooksRegistry } from "./registry";

const SANS = "var(--font-geist-sans), ui-sans-serif, system-ui, sans-serif";
const MONO = "var(--font-geist-mono), ui-monospace, SFMono-Regular, Menlo, monospace";

const at = (xTrack: number, yTrack: number, xSpan: number, ySpan: number): AgWidgetLayoutState => ({ xTrack, yTrack, xSpan, ySpan });
const sum = (id: string) => ({ id, aggregation: "sum" as const });
const field = (id: string) => ({ id });
const title = (text: string) => ({ title: { enabled: true, text } });
const subtitle = (text: string) => ({ subtitle: { enabled: true, text } });

const type = (fontFamily: string, fontSize: number, fontWeight: "normal" | "bold" = "normal") => ({
  fontFamily,
  fontSize,
  fontWeight,
  fontStyle: "normal" as const,
});

/** A headline number: quiet label on top, large mono figure under it. */
const kpi = (label: string, fieldId: string, color = "#16181d") => ({
  type: "value" as const,
  dataMapping: { value: [sum(fieldId)] },
  format: {
    title: { enabled: true, text: label, typography: type(SANS, 12), color: "#8a8f99" },
    style: {
      typography: type(MONO, 20),
      color,
      textAlign: "left" as const,
      verticalAlign: "center" as const,
    },
  },
});

const legendBelow = { theme: { common: { legend: { enabled: true, position: "bottom" as const } } } };

const overview: AgPageState<BooksRegistry> = {
  id: "books",
  widgets: {
    "kpi-contract": kpi("Contract value", "summary.contractValue"),
    "kpi-collected": kpi("Collected", "summary.collected", "#0b6e4f"),
    "kpi-outstanding": kpi("Outstanding", "summary.outstanding", "#b7791f"),
    "kpi-paid-crew": kpi("Paid to crew", "summary.paidToCrew"),
    "kpi-owed-crew": kpi("Owed to crew", "summary.owedToCrew"),
    "kpi-kept": kpi("Kept by the studio", "summary.keptByStudio", "#0b6e4f"),

    // Series order is fixed so the palette lines up with status: paid green, invoiced or ready amber,
    // overdue red, held blue, locked grey.
    "gates-by-status": {
      type: "bar-chart-stacked",
      dataMapping: {
        categoryKey: [field("receivables.gate")],
        valueKey: [field("gatesPaid"), field("gatesWaiting"), field("gatesOverdue"), field("gatesHeld"), field("gatesLocked")],
      },
      format: {
        ...title("Payment gates by status"),
        ...subtitle("What the client has paid, owes, and has not been asked for yet"),
        style: legendBelow,
      },
    },

    "crew-pay": {
      type: "column-chart-stacked",
      dataMapping: {
        categoryKey: [field("crew.name")],
        valueKey: [field("crewPaid"), field("crewOwed"), field("crewWaiting")],
      },
      format: {
        ...title("Crew pay"),
        ...subtitle("Paid out plus owed now is what each person has earned"),
        style: legendBelow,
      },
    },

    mandate: {
      type: "mandate",
      dataMapping: {},
      format: { ...title("Mandate") },
    },

    receivables: {
      type: "grid",
      dataMapping: {
        cols: [
          field("receivables.gate"),
          field("receivables.phase"),
          field("receivables.kind"),
          field("receivables.amount"),
          field("receivables.status"),
          field("receivables.invoicedOn"),
          field("receivables.due"),
          field("receivables.paidOn"),
          field("receivables.daysLate"),
          field("receivables.reminders"),
          field("receivables.paypalRef"),
        ],
      },
      format: {
        ...title("Receivables"),
        ...subtitle("One row per payment gate"),
      },
    },

    payouts: {
      type: "grid",
      dataMapping: {
        cols: [
          field("payouts.receipt"),
          field("payouts.date"),
          field("payouts.payee"),
          field("payouts.amount"),
          field("payouts.memo"),
          field("payouts.batchId"),
          field("payouts.status"),
          field("payouts.approvedBy"),
        ],
      },
      format: {
        ...title("Payouts"),
        ...subtitle("Every payout passed the mandate checks and a human approval"),
      },
    },
  },
  widgetLayout: {
    "kpi-contract": at(0, 0, 4, 5),
    "kpi-collected": at(4, 0, 4, 5),
    "kpi-outstanding": at(8, 0, 4, 5),
    "kpi-paid-crew": at(12, 0, 4, 5),
    "kpi-owed-crew": at(16, 0, 4, 5),
    "kpi-kept": at(20, 0, 4, 5),
    "gates-by-status": at(0, 5, 9, 21),
    "crew-pay": at(9, 5, 8, 21),
    mandate: at(17, 5, 7, 21),
    receivables: at(0, 26, 24, 13),
    payouts: at(0, 39, 24, 12),
  },
};

export const BOOKS_PAGE_ID = overview.id;

export function buildDefaultReport(): AgReportState<BooksRegistry> {
  return {
    pages: [overview],
    selectedPageId: overview.id,
    // Open on the dashboard and the assistant; the building panels stay one click away.
    panels: {
      edit: { collapsed: true },
      data: { collapsed: true },
      filters: { collapsed: true },
      ai: { collapsed: false, width: 380 },
    },
  };
}
