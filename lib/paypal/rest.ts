// Server only. Raw PayPal REST for the parts that have no SDK or toolkit tool:
// Payouts, reading an invoice's status, and recording an external payment on an invoice.
// Always the sandbox host unless PAYPAL_BASE says otherwise.

import { amountString } from "../dates";

export const PAYPAL_BASE = process.env.PAYPAL_BASE ?? "https://api-m.sandbox.paypal.com";

export function paypalConfigured(): boolean {
  return !!process.env.PAYPAL_CLIENT_ID && !!process.env.PAYPAL_CLIENT_SECRET;
}

let tokenCache: { token: string; exp: number } | null = null;

async function getAccessToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.exp) return tokenCache.token;
  if (!paypalConfigured()) throw new PayPalError(500, { name: "NOT_CONFIGURED", message: "PayPal sandbox credentials are not set on the server." });
  const basic = Buffer.from(`${process.env.PAYPAL_CLIENT_ID}:${process.env.PAYPAL_CLIENT_SECRET}`).toString("base64");
  const res = await fetch(`${PAYPAL_BASE}/v1/oauth2/token`, {
    method: "POST",
    headers: { Authorization: `Basic ${basic}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: "grant_type=client_credentials",
  });
  const data = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
  if (!res.ok || !data.access_token) throw new PayPalError(res.status, { name: "TOKEN_ERROR", message: "PayPal did not issue an access token." });
  tokenCache = { token: data.access_token, exp: Date.now() + ((data.expires_in ?? 600) - 60) * 1000 };
  return tokenCache.token;
}

interface PayPalErrorBody {
  name?: string;
  message?: string;
  debug_id?: string;
  details?: { issue?: string; description?: string; field?: string }[];
}

export class PayPalError extends Error {
  status: number;
  body: PayPalErrorBody;
  constructor(status: number, body: PayPalErrorBody | null) {
    const b = body ?? {};
    const issue = b.details?.[0]?.issue ?? b.name ?? "ERROR";
    const text = b.details?.[0]?.description ?? b.message ?? "";
    super(`PayPal ${status} ${issue}${text ? `: ${text}` : ""}`);
    this.status = status;
    this.body = b;
  }
  get issue(): string {
    return this.body.details?.[0]?.issue ?? this.body.name ?? "ERROR";
  }
}

export async function pp<T = unknown>(
  method: string,
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<{ status: number; data: T }> {
  const res = await fetch(`${PAYPAL_BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${await getAccessToken()}`, "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { message: text.slice(0, 300) };
  }
  if (!res.ok) throw new PayPalError(res.status, data as PayPalErrorBody);
  return { status: res.status, data: data as T };
}

// ---------- invoices ----------

export interface InvoiceView {
  id: string;
  status: string;
  number?: string;
  payUrl?: string;
  total?: string;
  due?: string;
}

interface RawInvoice {
  id: string;
  status: string;
  detail?: { invoice_number?: string; metadata?: { recipient_view_url?: string } };
  amount?: { value?: string };
  due_amount?: { value?: string };
}

export const INVOICE_PAID = ["PAID", "MARKED_AS_PAID", "PAID_EXTERNAL"];

export async function getInvoice(id: string): Promise<InvoiceView> {
  const { data } = await pp<RawInvoice>("GET", `/v2/invoicing/invoices/${encodeURIComponent(id)}`);
  return {
    id: data.id,
    status: data.status,
    number: data.detail?.invoice_number,
    payUrl: data.detail?.metadata?.recipient_view_url,
    total: data.amount?.value,
    due: data.due_amount?.value,
  };
}

/**
 * Record a payment the client made outside PayPal (bank transfer) on the PayPal invoice.
 * In the demo this is the shortcut for people who do not want to log in as the sandbox client.
 */
export async function recordInvoicePayment(id: string, amount: number, note: string): Promise<void> {
  await pp("POST", `/v2/invoicing/invoices/${encodeURIComponent(id)}/payments`, {
    method: "BANK_TRANSFER",
    payment_date: new Date().toISOString().slice(0, 10),
    amount: { currency_code: "USD", value: amountString(amount) },
    note,
  });
}

// ---------- payouts ----------

export interface PayoutLine {
  email: string;
  amount: number;
  note: string;
}

export interface PayoutBatchView {
  payoutBatchId: string;
  status: string;
  items: { itemId?: string; email?: string; status?: string; error?: string }[];
}

interface RawBatch {
  batch_header: { payout_batch_id: string; batch_status: string };
  items?: {
    payout_item_id?: string;
    transaction_status?: string;
    payout_item?: { receiver?: string };
    errors?: { name?: string };
  }[];
}

const viewBatch = (b: RawBatch): PayoutBatchView => ({
  payoutBatchId: b.batch_header.payout_batch_id,
  status: b.batch_header.batch_status,
  items: (b.items ?? []).map((it) => ({
    itemId: it.payout_item_id,
    email: it.payout_item?.receiver,
    status: it.transaction_status,
    error: it.errors?.name,
  })),
});

/**
 * One PayPal Payouts batch. `batchId` is our idempotency key: PayPal rejects a second batch
 * with the same sender_batch_id for 30 days, which is the last line of defence against a double pay.
 */
export async function sendPayoutBatch(batchId: string, lines: PayoutLine[], subject: string): Promise<PayoutBatchView> {
  const { data } = await pp<RawBatch>(
    "POST",
    "/v1/payments/payouts",
    {
      sender_batch_header: {
        sender_batch_id: batchId,
        email_subject: subject,
        email_message: "Payment for delivered work. Thank you.",
      },
      items: lines.map((l, i) => ({
        recipient_type: "EMAIL",
        receiver: l.email,
        amount: { value: amountString(l.amount), currency: "USD" },
        note: l.note.slice(0, 200),
        sender_item_id: `${batchId}-${i + 1}`,
      })),
    },
    { "PayPal-Request-Id": batchId },
  );
  return viewBatch(data);
}

export async function getPayoutBatch(payoutBatchId: string): Promise<PayoutBatchView> {
  const { data } = await pp<RawBatch>(
    "GET",
    `/v1/payments/payouts/${encodeURIComponent(payoutBatchId)}?page_size=100&total_required=true`,
  );
  return viewBatch(data);
}

export const PAYOUT_FINAL = ["SUCCESS", "DENIED", "CANCELED"];
