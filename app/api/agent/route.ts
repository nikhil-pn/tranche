// POST /api/agent  { ws, sig, message, history? }  ->  text/event-stream of AgentStreamEvent
// Each event is one line: `data: <json>\n\n`. The stream ends after a `done` or an `error` event.

import { runAgent } from "@/lib/agent";
import type { AgentStreamEvent, AgentTurn } from "@/lib/contract";
import { HttpFail, appUrl, errorResponse, rateLimit, readEnvelope, requireCode } from "@/lib/server";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function POST(request: Request) {
  try {
    requireCode(request);
    rateLimit(request, "agent", 12, 60_000);
    const { ws, body } = await readEnvelope(request);
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpFail(503, "The agent is not set up on this server (no Claude API key).");

    const message = typeof body.message === "string" ? body.message.trim().slice(0, 2000) : "";
    if (!message) throw new HttpFail(400, "Say what you want the agent to do.");
    const history = (Array.isArray(body.history) ? body.history : []) as AgentTurn[];
    const ctx = { appUrl: appUrl(request), actor: "agent" as const };

    const abort = new AbortController();
    const encoder = new TextEncoder();
    let open = true;
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const emit = (e: AgentStreamEvent) => {
          if (!open) return;
          try {
            controller.enqueue(encoder.encode(`data: ${JSON.stringify(e)}\n\n`));
          } catch {
            open = false;
          }
        };
        try {
          await runAgent(ws, message, history, ctx, emit, abort.signal);
        } catch (err) {
          console.error("[tranche] agent run failed", err);
          emit({ type: "error", message: "The agent stopped unexpectedly. Try again." });
        } finally {
          open = false;
          try {
            controller.close();
          } catch {
            // The browser already went away.
          }
        }
      },
      cancel() {
        open = false;
        abort.abort();
      },
    });

    return new Response(stream, {
      headers: {
        "content-type": "text/event-stream; charset=utf-8",
        "cache-control": "no-cache, no-transform",
        "x-accel-buffering": "no",
      },
    });
  } catch (err) {
    return errorResponse(err);
  }
}
