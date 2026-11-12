"use client";

// The one custom AG Studio widget in Books: the mandate a person signed, which is the only thing that
// lets the agent pay anyone. It reads the live workspace from Studio's `context` (a small store), so it
// follows the workspace without Studio being rebuilt.

import { useEffect, useSyncExternalStore } from "react";
import type { AgWidgetParams } from "ag-studio";
import { usd } from "@/lib/dates";
import { mandateView } from "./datasets";
import type { BooksContext, MandateWidgetDefinition, MandateWidgetState } from "./registry";

const dayFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
const day = (iso: string | null) => (iso ? dayFormat.format(new Date(`${iso}T00:00:00Z`)) : "");

function Fact({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="bk-mandate-fact">
      <div className="bk-mandate-label">{label}</div>
      <div className="bk-mandate-value">{value}</div>
      {note ? <div className="bk-mandate-note">{note}</div> : null}
    </div>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <div className="bk-mandate-rule">
      <span className="bk-mandate-rule-mark" aria-hidden="true" />
      <span>{text}</span>
    </div>
  );
}

export function MandateWidget(props: AgWidgetParams<MandateWidgetState>) {
  const { widgetApi } = props;
  const store = (props.context as BooksContext | undefined)?.books;

  const ws = useSyncExternalStore(
    store ? store.subscribe : noSubscribe,
    store ? store.get : noWorkspace,
    store ? store.get : noWorkspace,
  );

  useEffect(() => {
    widgetApi.setDisplayState("displayed");
  }, [widgetApi]);

  if (!ws) return <div className="bk-mandate bk-mandate-empty">The mandate is not available here.</div>;

  const m = mandateView(ws);

  if (!m.signed) {
    return (
      <div className="bk-mandate bk-mandate-unsigned">
        <span className="bk-pill bk-pill-grey">Not signed</span>
        <p className="bk-mandate-headline display">No mandate signed yet.</p>
        <p className="bk-mandate-sub">The agent cannot pay anyone.</p>
        <Rule text={m.rule} />
      </div>
    );
  }

  const used = Math.round(m.budgetUsed * 100);
  const expiryNote = m.expired
    ? "Expired"
    : m.daysLeft === 0
      ? "Last day"
      : m.daysLeft === 1
        ? "1 day left"
        : `${m.daysLeft} days left`;

  return (
    <div className="bk-mandate">
      <div className="bk-mandate-head">
        <span className={`bk-pill ${m.expired ? "bk-pill-red" : "bk-pill-green"}`}>{m.status}</span>
        <span className="bk-mandate-signer">
          by <strong>{m.signedBy}</strong>
          {m.signedOn ? ` on ${day(m.signedOn)}` : ""}
        </span>
      </div>

      <div className="bk-mandate-budget">
        <div className="bk-mandate-budget-row">
          <span className="bk-mandate-label">Budget left</span>
          <span className="bk-mandate-big num">{usd(m.remaining)}</span>
        </div>
        <div
          className="bk-mandate-bar"
          role="progressbar"
          aria-label="Mandate budget used"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={used}
        >
          <div className={`bk-mandate-bar-fill${used >= 100 ? " bk-mandate-bar-full" : ""}`} style={{ width: `${used}%` }} />
        </div>
        <div className="bk-mandate-budget-row bk-mandate-budget-foot">
          <span>
            <span className="num">{usd(m.paidOut)}</span> paid out
          </span>
          <span>
            of <span className="num">{usd(m.totalBudget)}</span>
          </span>
        </div>
      </div>

      <div className="bk-mandate-facts">
        <Fact label="Cap per payout" value={usd(m.perPayoutCap)} />
        <Fact label="Expires" value={day(m.expiresOn)} note={expiryNote} />
      </div>

      <div className="bk-mandate-payees">
        <div className="bk-mandate-label">Allowed payees</div>
        {m.payees.length === 0 ? (
          <div className="bk-mandate-note">Nobody is listed.</div>
        ) : (
          <ul>
            {m.payees.map((p) => (
              <li key={p.email}>
                <span className="bk-mandate-payee-name">{p.name || p.email}</span>
                {p.name ? <span className="bk-ref">{p.email}</span> : null}
              </li>
            ))}
          </ul>
        )}
      </div>

      <Rule text={m.rule} />
    </div>
  );
}

const noSubscribe = () => () => {};
const noWorkspace = () => null;

const MANDATE_ICON =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" stroke-linejoin="round"><path d="M8 1.5 13 3.5v4c0 3.2-2.1 5.8-5 7-2.9-1.2-5-3.8-5-7v-4L8 1.5Z"/><path d="m5.8 8 1.6 1.6 3-3.1"/></svg>';

export const mandateWidgetDefinition: MandateWidgetDefinition = {
  id: "mandate",
  label: "Mandate",
  icon: MANDATE_ICON,
  comp: MandateWidget,
  form: ({ createDefaults }) => createDefaults({}),
  defaultState: { format: { title: { enabled: true, text: "Mandate" } } },
  defaultSize: { width: 340, height: 340 },
  minSize: { width: 240, height: 200 },
  ai: {
    label: "Mandate",
    description:
      "A card showing the signed payout mandate: who signed it, when it expires, the cap per payout, a budget bar (paid out against the total budget) and the allowed payees.",
    usage:
      "Use it when someone asks to see the mandate or its limits on the dashboard. It maps no fields and has no settings: add it with an empty data mapping. For mandate numbers in an answer, query the mandate table instead.",
    configuration: "Nothing to configure. Give it at least 7 columns and 16 rows.",
  },
};
