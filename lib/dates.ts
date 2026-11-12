import type { ISODate } from "./types";

const DAY = 86_400_000;

export function toDate(d: ISODate): Date {
  return new Date(`${d}T00:00:00Z`);
}

export function iso(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDays(d: ISODate, n: number): ISODate {
  return iso(new Date(toDate(d).getTime() + n * DAY));
}

/** Whole days from a to b (positive when b is later). */
export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((toDate(b).getTime() - toDate(a).getTime()) / DAY);
}

export function maxDate(...ds: (ISODate | undefined)[]): ISODate {
  const xs = ds.filter(Boolean) as ISODate[];
  return xs.reduce((m, d) => (d > m ? d : m), xs[0]);
}

export function fmtDay(d?: ISODate): string {
  if (!d) return "";
  return toDate(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function usd(n: number): string {
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: Number.isInteger(n) ? 0 : 2,
    maximumFractionDigits: 2,
  });
}

/** PayPal wants money as a string with two decimals. */
export function amountString(n: number): string {
  return round2(n).toFixed(2);
}
