"use client";

// Small shared pieces for the shell: buttons, pills, cards, marks.

import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from "react";
import { usd } from "@/lib/dates";
import type { GateStatus } from "@/lib/types";

export function cx(...xs: (string | false | null | undefined)[]): string {
  return xs.filter(Boolean).join(" ");
}

export function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cx(
        "inline-block size-3 shrink-0 animate-spin rounded-full border-[1.5px] border-current border-t-transparent",
        className,
      )}
    />
  );
}

type Variant = "primary" | "secondary" | "quiet" | "danger";
type Size = "sm" | "md" | "lg";

const BTN_BASE =
  "inline-flex items-center justify-center gap-1.5 rounded-md font-medium transition-colors select-none " +
  "disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ink";

const BTN_VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-paper hover:bg-ink/85 disabled:hover:bg-ink",
  secondary: "border border-line bg-card text-ink hover:border-ink-3 disabled:hover:border-line",
  quiet: "text-ink-2 underline decoration-line underline-offset-[3px] hover:text-ink hover:decoration-ink-3",
  danger: "text-red underline decoration-red/30 underline-offset-[3px] hover:decoration-red",
};

const BTN_SIZE: Record<Size, string> = {
  sm: "h-7 px-2.5 text-[12.5px]",
  md: "h-8 px-3 text-[13px]",
  lg: "h-10 px-4 text-[14px]",
};

function btnClass(variant: Variant, size: Size, className?: string): string {
  const text = variant === "quiet" || variant === "danger";
  return cx(
    BTN_BASE,
    BTN_VARIANT[variant],
    text ? "px-0 text-left text-[12.5px] leading-[18px] font-normal" : `whitespace-nowrap ${BTN_SIZE[size]}`,
    className,
  );
}

export function Button({
  variant = "secondary",
  size = "md",
  loading = false,
  className,
  children,
  disabled,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button
      type="button"
      {...rest}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      className={btnClass(variant, size, className)}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

/** A link that looks like a button and opens in a new tab. */
export function LinkButton({
  variant = "secondary",
  size = "md",
  className,
  children,
  ...rest
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return (
    <a target="_blank" rel="noopener noreferrer" {...rest} className={btnClass(variant, size, className)}>
      {children}
      <svg viewBox="0 0 12 12" className="size-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden>
        <path d="M4.5 2.5h5v5M9.5 2.5 3 9" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </a>
  );
}

export type Tone = "grey" | "blue" | "amber" | "green" | "red";

// Amber text on the soft amber fill is too faint at small sizes, so the text is mixed darker.
export const AMBER_TEXT = "text-[color-mix(in_srgb,var(--amber)_68%,black)]";

const TONE_FILL: Record<Tone, string> = {
  grey: "bg-paper-2 text-ink-2",
  blue: "bg-blue-soft text-blue",
  amber: `bg-amber-soft ${AMBER_TEXT}`,
  green: "bg-green-soft text-green",
  red: "bg-red-soft text-red",
};

const TONE_DOT: Record<Tone, string> = {
  grey: "bg-ink-3",
  blue: "bg-blue",
  amber: "bg-amber",
  green: "bg-green",
  red: "bg-red",
};

export const TONE_TEXT: Record<Tone, string> = {
  grey: "text-ink-2",
  blue: "text-blue",
  amber: AMBER_TEXT,
  green: "text-green",
  red: "text-red",
};

export function Pill({ tone, children, dot = true }: { tone: Tone; children: ReactNode; dot?: boolean }) {
  return (
    <span
      className={cx(
        "inline-flex shrink-0 items-center gap-1.5 rounded-full px-2 py-[3px] text-[11px] font-medium leading-none whitespace-nowrap",
        TONE_FILL[tone],
      )}
    >
      {dot ? <span className={cx("size-1.5 rounded-full", TONE_DOT[tone])} /> : null}
      {children}
    </span>
  );
}

export const GATE_TONE: Record<GateStatus, Tone> = {
  locked: "grey",
  ready: "blue",
  invoiced: "amber",
  held: "blue",
  paid: "green",
  overdue: "red",
};

export function payoutTone(status: string): Tone {
  if (status === "SUCCESS") return "green";
  if (status === "PENDING" || status === "PROCESSING") return "amber";
  if (status === "DENIED" || status === "CANCELED" || status === "FAILED" || status === "RETURNED" || status === "BLOCKED") {
    return "red";
  }
  return "grey";
}

export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cx("rounded-xl border border-line bg-card", className)}>{children}</section>;
}

/** Section heading in the display face, with an optional line of help and something on the right. */
export function Heading({ title, hint, right }: { title: string; hint?: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-2.5 flex items-end justify-between gap-4">
      <div className="min-w-0">
        <h2 className="display text-[22px] leading-7 text-ink">{title}</h2>
        {hint ? <p className="mt-0.5 text-[13px] text-ink-2">{hint}</p> : null}
      </div>
      {right ? <div className="shrink-0">{right}</div> : null}
    </div>
  );
}

export function Money({ n, className }: { n: number; className?: string }) {
  return <span className={cx("num", className)}>{usd(n)}</span>;
}

/** Small caps style label used above numbers and fields. */
export function Label({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cx("text-[11px] font-medium tracking-[0.06em] text-ink-2 uppercase", className)}>{children}</span>
  );
}

export function short(hash: string | undefined, n = 8): string {
  if (!hash) return "none";
  return hash.length > n ? `${hash.slice(0, n)}…` : hash;
}

/** Pass, fail or waiting mark for one gate check. */
export function Mark({ state }: { state: "pass" | "fail" | "wait" }) {
  if (state === "pass") {
    return (
      <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-green-soft text-green" aria-label="Passed">
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="m2.5 6.2 2.3 2.3 4.7-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </span>
    );
  }
  if (state === "fail") {
    return (
      <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-red text-card" aria-label="Failed">
        <svg viewBox="0 0 12 12" className="size-2.5" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
          <path d="m3.2 3.2 5.6 5.6M8.8 3.2 3.2 8.8" strokeLinecap="round" />
        </svg>
      </span>
    );
  }
  return (
    <span className="mt-px inline-flex size-4 shrink-0 items-center justify-center rounded-full bg-amber-soft" aria-label="Waiting">
      <span className="size-1.5 rounded-full bg-amber" />
    </span>
  );
}

/** "2026-11-12T10:55:00Z" as "Nov 12, 10:55". */
export function fmtStamp(at: string | undefined): string {
  if (!at) return "";
  const d = new Date(at);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "UTC",
  });
}

export function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}
