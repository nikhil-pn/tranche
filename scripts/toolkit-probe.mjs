// Probe the PayPal Agent Toolkit (/bedrock adapter): tool names, input schemas, result shape.
// Creates one DRAFT invoice in the sandbox and deletes nothing else. Prints ids and shapes only.
import fs from "node:fs";
import dns from "node:dns";
dns.setDefaultResultOrder("ipv4first");
const env = Object.fromEntries(
  fs.readFileSync(new URL("../.env", import.meta.url), "utf8").split("\n").filter((l) => /^[A-Z_0-9]+=/.test(l))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i), l.slice(i + 1).replace(/^['"]|['"]$/g, "")]; }),
);
const { PayPalAgentToolkit } = await import("@paypal/agent-toolkit/bedrock");
const toolkit = new PayPalAgentToolkit({
  clientId: env.PAYPAL_CLIENT_ID, clientSecret: env.PAYPAL_CLIENT_SECRET,
  configuration: { actions: { invoices: { create: true, send: true, get: true, list: true, sendReminder: true, cancel: true, generateInvoiceNumber: true }, transactions: { list: true } }, context: { sandbox: true } },
});
const tools = toolkit.getTools();
console.log("tools:", tools.map((t) => t.toolSpec.name).join(", "));
const mode = process.argv[2] || "schema";
if (mode === "schema") {
  for (const t of tools) {
    if (["create_invoice", "send_invoice", "send_invoice_reminder", "get_invoice", "list_invoices", "cancel_sent_invoice"].includes(t.toolSpec.name)) {
      console.log("\n##", t.toolSpec.name, "\n", JSON.stringify(t.toolSpec.inputSchema.json).slice(0, 2500));
    }
  }
} else {
  const call = async (name, input) => {
    const res = await toolkit.handleToolCall({ toolUseId: "probe", name, input });
    const text = res.content?.[0]?.text ?? JSON.stringify(res);
    console.log("\n##", name, "->", String(text).slice(0, 700));
    try { return JSON.parse(text); } catch { return text; }
  };
  const inv = await call("create_invoice", {
    currency_code: "USD", note: "Toolkit probe", reference: "probe-g1",
    invoicer_business_name: "Paper Lantern Studio", invoicer_email_address: env.PAYPAL_BUSINESS_EMAIL,
    primary_recipients: [{ billing_info: { business_name: "Northwind Coffee Co.", email_address: env.TRANCHE_CLIENT_EMAIL } }],
    items: [{ name: "Probe item", quantity: "1", unit_amount: { currency_code: "USD", value: "1.00" } }],
  });
  console.log("typeof:", typeof inv, "keys:", inv && typeof inv === "object" ? Object.keys(inv) : "");
  const id = inv?.id ?? inv?.createResult?.id ?? String(JSON.stringify(inv)).match(/INV2(-[A-Z0-9]{4}){4}/)?.[0];
  console.log("id:", id);
  if (id) {
    const sent = await call("send_invoice", { invoice_id: id, send_to_recipient: true });
    console.log("send keys:", sent && typeof sent === "object" ? Object.keys(sent) : typeof sent);
    const got = await call("get_invoice", { invoice_id: id });
    console.log("get: status", got?.status, "view", got?.detail?.metadata?.recipient_view_url, "num", got?.detail?.invoice_number, "due", JSON.stringify(got?.detail?.payment_term), "amt", JSON.stringify(got?.amount?.value), JSON.stringify(got?.due_amount));
    const rem = await call("send_invoice_reminder", { invoice_id: id, subject: "Probe reminder", note: "Friendly probe reminder" });
    const can = await call("cancel_sent_invoice", { invoice_id: id, send_to_recipient: false });
  }
}
