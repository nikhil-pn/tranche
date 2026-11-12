// Server only. The PayPal Agent Toolkit (@paypal/agent-toolkit), used two ways:
//  1. read-only tools handed to the model as they are (list_invoices, get_invoice);
//  2. write tools (create, send, remind, cancel) called by our own code with values taken
//     from the plan, so the model picks the gate and never the amount or the recipient.
// The toolkit defaults to LIVE. `sandbox: true` below is not optional.

import { PayPalAgentToolkit } from "@paypal/agent-toolkit/bedrock";

type Toolkit = InstanceType<typeof PayPalAgentToolkit>;

let cached: Toolkit | null = null;

function toolkit(): Toolkit {
  if (cached) return cached;
  const clientId = process.env.PAYPAL_CLIENT_ID;
  const clientSecret = process.env.PAYPAL_CLIENT_SECRET;
  if (!clientId || !clientSecret) throw new Error("PayPal sandbox credentials are not set on the server.");
  cached = new PayPalAgentToolkit({
    clientId,
    clientSecret,
    configuration: {
      actions: {
        invoices: { create: true, send: true, get: true, list: true, sendReminder: true, cancel: true },
      },
      context: { sandbox: true },
    },
  });
  return cached;
}

export class ToolkitError extends Error {}

/** Call one toolkit tool. Results come back as JSON text (sometimes encoded twice): unwrap it. */
export async function callToolkit(name: string, input: Record<string, unknown>): Promise<unknown> {
  const res = await toolkit().handleToolCall({ toolUseId: `tranche-${Date.now()}`, name, input } as never);
  const text = (res as { content?: { text?: string }[] }).content?.[0]?.text ?? "";
  let value: unknown = text;
  for (let i = 0; i < 2 && typeof value === "string"; i++) {
    try {
      value = JSON.parse(value);
    } catch {
      break;
    }
  }
  if (typeof value === "string" && /error|failed|invalid/i.test(value)) throw new ToolkitError(value.slice(0, 400));
  if (value && typeof value === "object") {
    const o = value as { error?: unknown; name?: string; message?: string; details?: { issue?: string; description?: string }[] };
    if (o.error || (o.name && o.message && o.details)) {
      const issue = o.details?.[0]?.issue ?? o.name ?? "ERROR";
      throw new ToolkitError(`PayPal ${issue}: ${o.details?.[0]?.description ?? o.message ?? JSON.stringify(o.error).slice(0, 300)}`);
    }
  }
  return value;
}

/** Tool definitions in Anthropic's shape for the read-only tools the model may call directly. */
export function readOnlyToolkitTools(): { name: string; description: string; input_schema: Record<string, unknown> }[] {
  const allow = new Set(["list_invoices", "get_invoice"]);
  return (toolkit().getTools() as { toolSpec: { name: string; description: string; inputSchema: { json: Record<string, unknown> } } }[])
    .filter((t) => allow.has(t.toolSpec.name))
    .map((t) => {
      const { $schema: _drop, ...schema } = t.toolSpec.inputSchema.json as Record<string, unknown> & { $schema?: string };
      void _drop;
      return { name: t.toolSpec.name, description: t.toolSpec.description.trim().slice(0, 900), input_schema: schema };
    });
}

export const READ_ONLY_TOOLKIT_TOOLS = ["list_invoices", "get_invoice"];

const INVOICE_ID = /INV2(?:-[A-Z0-9]{4}){4}/;

export interface NewInvoice {
  number: string;
  reference: string;
  note: string;
  studio: string;
  studioEmail?: string;
  clientName: string;
  clientEmail: string;
  itemName: string;
  itemDescription: string;
  amount: string;
}

/** Create a DRAFT invoice. Returns PayPal's invoice id. */
export async function createInvoiceDraft(inv: NewInvoice): Promise<string> {
  const out = await callToolkit("create_invoice", {
    currency_code: "USD",
    invoice_number: inv.number,
    reference: inv.reference,
    note: inv.note,
    invoicer_business_name: inv.studio,
    ...(inv.studioEmail ? { invoicer_email_address: inv.studioEmail } : {}),
    primary_recipients: [{ billing_info: { business_name: inv.clientName, email_address: inv.clientEmail } }],
    items: [
      {
        name: inv.itemName,
        description: inv.itemDescription,
        quantity: "1",
        unit_amount: { currency_code: "USD", value: inv.amount },
        unit_of_measure: "AMOUNT",
      },
    ],
  });
  const id = JSON.stringify(out).match(INVOICE_ID)?.[0];
  if (!id) throw new ToolkitError(`PayPal did not return an invoice id: ${JSON.stringify(out).slice(0, 300)}`);
  return id;
}

/** Send a draft to the client. Returns the link the client pays at. */
export async function sendInvoice(invoiceId: string): Promise<string | undefined> {
  const out = (await callToolkit("send_invoice", { invoice_id: invoiceId, send_to_recipient: true })) as { href?: string } | string;
  return typeof out === "object" && out ? out.href : undefined;
}

export async function remindInvoice(invoiceId: string, subject: string, note: string): Promise<void> {
  await callToolkit("send_invoice_reminder", { invoice_id: invoiceId, subject, note });
}
