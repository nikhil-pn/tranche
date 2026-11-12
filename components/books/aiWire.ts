// The wire format between the Books assistant in the browser (./claudeAdapter.ts) and the server
// route that holds the Claude key (app/api/ai/books/route.ts). Types only, so both sides can import it.
//
// Browser -> server: one POST per AG Studio turn, already in Claude Messages API shape.
// Server -> browser: text/event-stream, one `data: <json>\n\n` per Claude stream event, then the
// stream closes. A failure after the stream opened arrives as a `BooksAiErrorEvent`.

import type Anthropic from "@anthropic-ai/sdk";

/** One custom tool, as the browser describes it. The server adds everything else. */
export interface BooksAiTool {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
}

export interface BooksAiRequest {
  /** AG Studio's instructions for the agent running this turn. */
  system: string;
  messages: Anthropic.Beta.BetaMessageParam[];
  tools: BooksAiTool[];
  /** Claude rejects forced tool use on this model, so only these two are sent. */
  toolChoice: "auto" | "none";
  /** Present when AG Studio asked for a JSON reply instead of text. */
  format?: { schema: Record<string, unknown> };
}

export interface BooksAiErrorEvent {
  type: "error";
  error: { message: string };
}

export type BooksAiStreamEvent = Anthropic.Beta.BetaRawMessageStreamEvent | BooksAiErrorEvent;
