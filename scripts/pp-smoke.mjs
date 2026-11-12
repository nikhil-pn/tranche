// Sandbox readiness check: token, a 1.00 USD payout, and a draft+sent invoice. Prints ids only, never secrets.
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");

function loadEnv(file) {
  const out = {};
  for (const line of readFileSync(file, "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if ((v.startsWith("'") && v.endsWith("'")) || (v.startsWith('"') && v.endsWith('"'))) v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}
const env = loadEnv(resolve(import.meta.dirname, "../.env"));
const BASE = "https://api-m.sandbox.paypal.com";
const what = process.argv[2] || "all";

const tokRes = await fetch(`${BASE}/v1/oauth2/token`, {
  method: "POST",
  headers: {
    Authorization: "Basic " + Buffer.from(`${env.PAYPAL_CLIENT_ID}:${env.PAYPAL_CLIENT_SECRET}`).toString("base64"),
    "Content-Type": "application/x-www-form-urlencoded",
  },
  body: "grant_type=client_credentials",
});
const tok = await tokRes.json();
console.log("token", tokRes.status, "expires_in", tok.expires_in);
const H = { Authorization: `Bearer ${tok.access_token}`, "Content-Type": "application/json" };
const crew = env.TRANCHE_CREW_EMAILS.split(",").map((s) => s.trim());

if (what === "all" || what === "payout") {
  const batch = `smoke-${Date.now()}`;
  const r = await fetch(`${BASE}/v1/payments/payouts`, {
    method: "POST",
    headers: { ...H, "PayPal-Request-Id": batch },
    body: JSON.stringify({
      sender_batch_header: { sender_batch_id: batch, email_subject: "Tranche readiness check", email_message: "Test payout" },
      items: [{ recipient_type: "EMAIL", amount: { value: "1.00", currency: "USD" }, receiver: crew[0], note: "Readiness check", sender_item_id: "smoke-1" }],
    }),
  });
  const j = await r.json();
  console.log("payout", r.status, j.batch_header?.payout_batch_id, j.batch_header?.batch_status, j.name ?? "", j.message ?? "");
  if (j.batch_header?.payout_batch_id) {
    await new Promise((s) => setTimeout(s, 6000));
    const g = await (await fetch(`${BASE}/v1/payments/payouts/${j.batch_header.payout_batch_id}`, { headers: H })).json();
    console.log("payout after 6s", g.batch_header?.batch_status, (g.items ?? []).map((i) => `${i.transaction_status}:${i.payout_item_id}`).join(","));
  }
}

if (what === "all" || what === "invoice") {
  const body = {
    detail: { currency_code: "USD", invoice_number: `SMOKE-${Date.now()}`, note: "Readiness check", payment_term: { term_type: "NET_10" } },
    invoicer: { name: { given_name: "Paper", surname: "Lantern" }, email_address: env.PAYPAL_BUSINESS_EMAIL },
    primary_recipients: [{ billing_info: { email_address: env.TRANCHE_CLIENT_EMAIL } }],
    items: [{ name: "Readiness check", quantity: "1", unit_amount: { currency_code: "USD", value: "5.00" } }],
  };
  const c = await fetch(`${BASE}/v2/invoicing/invoices`, { method: "POST", headers: { ...H, Prefer: "return=representation" }, body: JSON.stringify(body) });
  const cj = await c.json();
  console.log("invoice create", c.status, cj.id, cj.status, cj.name ?? "", JSON.stringify(cj.details ?? "").slice(0, 300));
  if (cj.id) {
    const s = await fetch(`${BASE}/v2/invoicing/invoices/${cj.id}/send`, { method: "POST", headers: H, body: JSON.stringify({ send_to_invoicer: false }) });
    const sj = await s.json().catch(() => ({}));
    console.log("invoice send", s.status, sj.href ?? sj.name ?? "", sj.message ?? "");
    const g = await (await fetch(`${BASE}/v2/invoicing/invoices/${cj.id}`, { headers: H })).json();
    console.log("invoice now", g.status, "recipient_view_url", g.detail?.metadata?.recipient_view_url);
    // tidy up: cancel the test invoice
    const x = await fetch(`${BASE}/v2/invoicing/invoices/${cj.id}/cancel`, { method: "POST", headers: H, body: JSON.stringify({ send_to_invoicer: false, send_to_recipient: false }) });
    console.log("invoice cancel", x.status);
  }
}
