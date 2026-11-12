// AG Studio's LLM adapter for Claude. Runs in the browser and posts each turn to this app's own route
// (app/api/ai/books), which holds the key and streams Claude's reply back.
//
// Two jobs, the same as AG Studio's own OpenAI adapter example:
//   encode  AG Studio's request (instructions, conversation items, tool schemas, tool calls and their
//           results, text or JSON format) into a Claude Messages API request;
//   decode  Claude's stream events into the AG Studio events the chat panel reads, and the final
//           AgLlmResponse the agent loop continues from.
//
// Claude's thinking blocks are shown as reasoning but not sent back on later turns: the API accepts
// a history without them, and AG Studio rebuilds instructions and tools every turn anyway.

import type Anthropic from "@anthropic-ai/sdk";
import type {
  AgAiConversationItem,
  AgAiEvent,
  AgAiOutputItem,
  AgAiToolSchema,
  AgAiUsage,
  AgLlmAdapter,
  AgLlmExecuteTurnOptions,
  AgLlmRequest,
  AgLlmResponse,
  AgLlmResponseHandler,
} from "ag-studio";
import { headers } from "@/lib/client/api";
import { CODE_KEY } from "@/lib/client/store";
import type { BooksAiRequest, BooksAiStreamEvent, BooksAiTool } from "./aiWire";

type MessageParam = Anthropic.Beta.BetaMessageParam;
type Block = Anthropic.Beta.BetaContentBlockParam;
type ToolResultBlock = Anthropic.Beta.BetaToolResultBlockParam;
type Role = "user" | "assistant";
type JsonSchema = Record<string, unknown>;

const ENDPOINT = "/api/ai/books";

// =============================================================================
// Encoding: AG Studio -> Claude
// =============================================================================

/** Claude tool ids allow letters, digits, `_` and `-`. Ids that came from Claude pass unchanged. */
function safeId(id: string): string {
  return id.replace(/[^a-zA-Z0-9_-]/g, "_") || "call";
}

function parseArgs(raw: string): Record<string, unknown> {
  try {
    const value: unknown = JSON.parse(raw || "{}");
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

function isSchema(value: unknown): value is JsonSchema {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// AG Studio's shape library marks an optional value as `anyOf: [T, { not: {} }]`. The extra branch
// only means "may be left out", which a missing key already says, so drop it.
function isUndefinedSentinel(s: unknown): boolean {
  return isSchema(s) && Object.keys(s).length === 1 && isSchema(s.not) && Object.keys(s.not).length === 0;
}

function cleanSchema(schema: JsonSchema): JsonSchema {
  let out: JsonSchema = { ...schema };
  if (Array.isArray(out.anyOf)) {
    const kept = (out.anyOf as unknown[]).filter((b) => !isUndefinedSentinel(b));
    const { anyOf: _drop, ...rest } = out;
    void _drop;
    if (kept.length === 1 && isSchema(kept[0])) out = { ...kept[0], ...rest };
    else if (kept.length > 0) out = { ...rest, anyOf: kept.map((b) => (isSchema(b) ? cleanSchema(b) : b)) };
    else out = rest;
  }
  if (isSchema(out.properties)) {
    out.properties = Object.fromEntries(
      Object.entries(out.properties).map(([k, v]) => [k, isSchema(v) ? cleanSchema(v) : v]),
    );
  }
  if (isSchema(out.$defs)) {
    out.$defs = Object.fromEntries(Object.entries(out.$defs).map(([k, v]) => [k, isSchema(v) ? cleanSchema(v) : v]));
  }
  if (isSchema(out.items)) out.items = cleanSchema(out.items);
  if (isSchema(out.additionalProperties)) out.additionalProperties = cleanSchema(out.additionalProperties);
  return out;
}

function encodeTool(tool: AgAiToolSchema): BooksAiTool | null {
  // Provider-hosted tools are OpenAI-shaped in AG Studio; none are offered here.
  if (tool.kind === "provided") return null;
  const schema = cleanSchema(tool.parameters as unknown as JsonSchema);
  if (schema.type !== "object") schema.type = "object";
  return { name: tool.name, description: tool.description, input_schema: schema };
}

function toolUseIds(message: MessageParam | undefined): string[] {
  if (!message || message.role !== "assistant" || typeof message.content === "string") return [];
  return message.content.flatMap((b) => (b.type === "tool_use" ? [b.id] : []));
}

function missingResult(id: string): ToolResultBlock {
  return { type: "tool_result", tool_use_id: id, content: "This call did not run.", is_error: true };
}

/**
 * Which Claude reply an output item came from. The decoder names every item `<message id>_<part>_<block>`,
 * and AG Studio keeps those ids in its history, so the calls one reply made in parallel can be put
 * back into one assistant message even though AG Studio lists each call's result right after it.
 */
function replyOf(itemId: string | undefined): string | null {
  const m = /^(.+)_\d+_\d+$/.exec(itemId ?? "");
  return m ? m[1] : null;
}

/**
 * AG Studio's flat item list -> Claude's alternating user/assistant messages. Claude needs every
 * tool_use answered by a tool_result in the very next user message, results first, so the pairing is
 * repaired here rather than trusted. `closing` is what to say when the history ends on Claude's turn.
 */
function encodeMessages(items: AgAiConversationItem[], closing: string): MessageParam[] {
  const turns: { role: Role; content: Block[] }[] = [];
  let reply: { key: string | null; content: Block[] } | null = null;
  let userSide: Block[] = [];
  const flush = () => {
    if (reply) turns.push({ role: "assistant", content: reply.content });
    if (userSide.length) turns.push({ role: "user", content: userSide });
    reply = null;
    userSide = [];
  };
  const addReply = (itemId: string | undefined, block: Block) => {
    const key = replyOf(itemId);
    if (reply && key !== null && reply.key === key) {
      reply.content.push(block);
      return;
    }
    flush();
    reply = { key, content: [block] };
  };

  for (const item of items) {
    if (item.type === "function_call_output") {
      userSide.push({ type: "tool_result", tool_use_id: safeId(item.callId), content: item.output || "(no output)" });
    } else if (item.type === "function_call") {
      addReply(item.id, { type: "tool_use", id: safeId(item.callId), name: item.name, input: parseArgs(item.arguments) });
    } else if (item.type === "message" && item.kind === "input") {
      const text = item.content
        .map((c) => (c.type === "text" ? c.text : ""))
        .filter((t) => t.trim())
        .join("\n\n");
      if (!text) continue;
      if (reply && !userSide.length) flush();
      // Notes AG Studio adds mid-conversation travel with the user's turn, marked as coming from the app.
      userSide.push({ type: "text", text: item.role === "system" ? `<studio_note>\n${text}\n</studio_note>` : text });
    } else if (item.type === "message" && item.kind === "output") {
      const text = item.content.map((c) => (c.type === "text" ? c.text : c.refusal)).join("");
      if (text.trim()) addReply(item.id, { type: "text", text });
    }
    // Reasoning items are display only; see the note at the top.
  }
  flush();

  const out: MessageParam[] = [];
  for (const turn of turns) {
    const prev = out[out.length - 1];
    const owed = toolUseIds(prev);
    if (turn.role === "user") {
      const results: ToolResultBlock[] = [];
      const rest: Block[] = [];
      for (const b of turn.content) {
        if (b.type !== "tool_result") rest.push(b);
        else if (owed.includes(b.tool_use_id) && !results.some((r) => r.tool_use_id === b.tool_use_id)) results.push(b);
      }
      for (const id of owed) if (!results.some((r) => r.tool_use_id === id)) results.push(missingResult(id));
      const content = [...results, ...rest];
      if (!content.length) continue;
      if (prev && prev.role === "user" && !owed.length) {
        prev.content = [...(prev.content as Block[]), ...content];
      } else {
        out.push({ role: "user", content });
      }
    } else if (prev && prev.role === "assistant") {
      // Two Claude turns in a row: answer the first one's calls, if any, before the second.
      if (owed.length) out.push({ role: "user", content: owed.map(missingResult) });
      else {
        prev.content = [...(prev.content as Block[]), ...turn.content];
        continue;
      }
      out.push({ role: "assistant", content: turn.content });
    } else {
      out.push({ role: "assistant", content: turn.content });
    }
  }

  if (out.length === 0 || out[0].role !== "user") out.unshift({ role: "user", content: "Hello." });
  const last = out[out.length - 1];
  if (last.role === "assistant") {
    const owed = toolUseIds(last);
    out.push({ role: "user", content: owed.length ? owed.map(missingResult) : closing });
  }
  return out;
}

/** Add a line to the user's side of the last turn. */
function nudge(messages: MessageParam[], text: string): void {
  const last = messages[messages.length - 1];
  if (last.content === text) return;
  const block: Block = { type: "text", text };
  const before = (typeof last.content === "string" ? [{ type: "text", text: last.content }] : (last.content ?? [])) as Block[];
  last.content = [...before, block];
}

function encodeRequest(request: AgLlmRequest): BooksAiRequest {
  const tools = (request.tools ?? []).map(encodeTool).filter((t): t is BooksAiTool => t !== null);
  const choice = request.toolChoice ?? "auto";
  // Claude has no forced tool choice on this model, so a required call is asked for in words.
  let ask = "";
  if (tools.length && choice === "required") ask = "Continue by calling one of your tools.";
  if (tools.length && typeof choice === "object") ask = `Continue by calling the ${choice.name} tool.`;
  const messages = encodeMessages(request.input, ask || "Continue.");
  if (ask) nudge(messages, ask);
  const toolChoice: BooksAiRequest["toolChoice"] = tools.length && choice === "none" ? "none" : "auto";

  const format = request.responseFormat;
  return {
    system: request.instructions ?? "",
    messages,
    tools,
    toolChoice,
    ...(format?.type === "json" ? { format: { schema: format.schema as unknown as JsonSchema } } : {}),
  };
}

// =============================================================================
// Decoding: Claude -> AG Studio
// =============================================================================

interface OpenBlock {
  kind: "text" | "tool" | "thinking" | "other";
  /** The id AG Studio's events use: the item id, or the tool call id. */
  id: string;
  /** `<message id>_<part>_<block>`; see replyOf. */
  itemId: string;
  name?: string;
  text: string;
  started: boolean;
}

/**
 * Claude streams content blocks by index; AG Studio reads messages and tool calls by id. The only
 * state needed is the block open at each index.
 */
class ClaudeStreamTranslator {
  private messageId = "";
  private part = 0;
  private readonly blocks = new Map<string, OpenBlock>();
  private readonly order: OpenBlock[] = [];
  private model?: string;
  private stopReason: string | null = null;
  private usage = { input: 0, cacheRead: 0, cacheWrite: 0, output: 0 };
  error?: Error;
  finished = false;

  translate(ev: BooksAiStreamEvent): AgAiEvent[] {
    switch (ev.type) {
      case "message_start": {
        this.part += 1;
        this.messageId = ev.message.id;
        this.model = ev.message.model;
        const u = ev.message.usage;
        this.usage.input += u.input_tokens ?? 0;
        this.usage.cacheRead += u.cache_read_input_tokens ?? 0;
        this.usage.cacheWrite += u.cache_creation_input_tokens ?? 0;
        this.usage.output += u.output_tokens ?? 0;
        return [];
      }
      case "content_block_start":
        return this.open(ev.index, ev.content_block);
      case "content_block_delta": {
        const block = this.blocks.get(this.key(ev.index));
        if (!block) return [];
        const d = ev.delta;
        if (d.type === "text_delta" && block.kind === "text") return this.append(block, d.text);
        if (d.type === "thinking_delta" && block.kind === "thinking") return this.append(block, d.thinking);
        if (d.type === "input_json_delta" && block.kind === "tool") {
          block.text += d.partial_json;
          return d.partial_json ? [{ type: "TOOL_CALL_ARGS", toolCallId: block.id, delta: d.partial_json }] : [];
        }
        return [];
      }
      case "content_block_stop":
        return this.close(ev.index);
      case "message_delta":
        this.stopReason = ev.delta.stop_reason ?? this.stopReason;
        if (ev.usage?.output_tokens != null) this.usage.output = ev.usage.output_tokens;
        return [];
      case "message_stop":
        this.finished = true;
        return [];
      case "error":
        this.error ??= new Error(ev.error?.message || "Claude stopped unexpectedly. Try again.");
        return [];
      default:
        return [];
    }
  }

  private key(index: number): string {
    return `${this.part}:${index}`;
  }

  private open(index: number, cb: { type: string; id?: string; name?: string }): AgAiEvent[] {
    const itemId = `${this.messageId}_${this.part}_${index}`;
    const block: OpenBlock = { kind: "other", id: itemId, itemId, text: "", started: false };
    if (cb.type === "text") block.kind = "text";
    else if (cb.type === "thinking") block.kind = "thinking";
    else if (cb.type === "tool_use" && cb.id && cb.name) {
      block.kind = "tool";
      block.id = cb.id;
      block.name = cb.name;
      block.started = true;
    }
    this.blocks.set(this.key(index), block);
    this.order.push(block);
    return block.kind === "tool" ? [{ type: "TOOL_CALL_START", toolCallId: block.id, toolCallName: block.name! }] : [];
  }

  /** Text and reasoning open lazily, so an empty block never shows as an empty bubble. */
  private append(block: OpenBlock, delta: string): AgAiEvent[] {
    if (!delta) return [];
    block.text += delta;
    const events: AgAiEvent[] = [];
    if (block.kind === "text") {
      if (!block.started) events.push({ type: "TEXT_MESSAGE_START", messageId: block.id, role: "assistant" });
      events.push({ type: "TEXT_MESSAGE_CONTENT", messageId: block.id, delta });
    } else {
      if (!block.started) events.push({ type: "REASONING_MESSAGE_START", messageId: block.id, role: "reasoning" });
      events.push({ type: "REASONING_MESSAGE_CONTENT", messageId: block.id, delta });
    }
    block.started = true;
    return events;
  }

  private close(index: number): AgAiEvent[] {
    const block = this.blocks.get(this.key(index));
    if (!block || !block.started) return [];
    if (block.kind === "text") return [{ type: "TEXT_MESSAGE_END", messageId: block.id }];
    if (block.kind === "thinking") return [{ type: "REASONING_MESSAGE_END", messageId: block.id }];
    if (block.kind === "tool") return [{ type: "TOOL_CALL_END", toolCallId: block.id }];
    return [];
  }

  /** The finished turn, or the reason it cannot be used. */
  result(): { response?: AgLlmResponse; error?: Error } {
    if (this.error) return { error: this.error };
    if (!this.finished) return { error: new Error("The connection to Claude closed early. Try again.") };
    const tools = this.order.filter((b) => b.kind === "tool");
    if (this.stopReason === "refusal") {
      return { error: new Error("Claude declined this request. Try asking it a different way.") };
    }
    if (this.stopReason === "max_tokens" && tools.length) {
      return { error: new Error("The reply ran out of room. Ask for one change at a time.") };
    }
    for (const t of tools) {
      try {
        JSON.parse(t.text || "{}");
      } catch {
        return { error: new Error("Claude sent a tool call that was cut off. Try again.") };
      }
    }

    const output: AgAiOutputItem[] = [];
    for (const b of this.order) {
      if (b.kind === "text" && b.text.trim()) {
        output.push({
          id: b.id,
          kind: "output",
          type: "message",
          role: "assistant",
          status: "completed",
          content: [{ type: "text", text: b.text, annotations: [] }],
        });
      } else if (b.kind === "thinking" && b.text.trim()) {
        output.push({ id: b.id, kind: "output", type: "reasoning", summary: [{ type: "summary", text: b.text }] });
      } else if (b.kind === "tool") {
        output.push({
          id: b.itemId,
          kind: "output",
          type: "function_call",
          callId: b.id,
          name: b.name!,
          arguments: b.text || "{}",
          status: "completed",
        });
      }
    }

    const u = this.usage;
    const inputTokens = u.input + u.cacheRead + u.cacheWrite;
    const usage: AgAiUsage = {
      inputTokens,
      outputTokens: u.output,
      totalTokens: inputTokens + u.output,
      cachedInputTokens: u.cacheRead,
      cacheWriteTokens: u.cacheWrite,
    };
    return {
      response: {
        id: this.messageId,
        createdAt: Date.now(),
        model: this.model,
        status: this.stopReason === "max_tokens" ? "incomplete" : "completed",
        ...(this.stopReason === "max_tokens" ? { incompleteDetails: { reason: "max_output_tokens" as const } } : {}),
        output,
        usage,
      },
    };
  }
}

// =============================================================================
// Transport
// =============================================================================

function requestHeaders(): Record<string, string> {
  let code = "";
  try {
    code = window.localStorage.getItem(CODE_KEY) ?? "";
  } catch {
    // Storage blocked: the server will say if it wanted a code.
  }
  return { ...headers(code), accept: "text/event-stream" };
}

async function failure(res: Response): Promise<Error> {
  const body = (await res.json().catch(() => null)) as { error?: unknown } | null;
  if (body && typeof body.error === "string" && body.error) return new Error(body.error);
  if (res.status === 401) return new Error("The access code is missing or wrong.");
  if (res.status === 429) return new Error("Too many questions in a short time. Wait a minute and try again.");
  return new Error(`The assistant could not answer (${res.status}).`);
}

async function* streamTurn(
  body: BooksAiRequest,
  translator: ClaudeStreamTranslator,
  signal?: AbortSignal,
): AsyncIterableIterator<AgAiEvent> {
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: requestHeaders(),
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  if (!res.ok || !res.body) throw await failure(res);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer = (buffer + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      const frames = buffer.split("\n\n");
      buffer = frames.pop() ?? "";
      for (const frame of frames) {
        const data = frame
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let ev: BooksAiStreamEvent;
        try {
          ev = JSON.parse(data) as BooksAiStreamEvent;
        } catch {
          continue;
        }
        yield* translator.translate(ev);
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

function runTurn(request: AgLlmRequest, options?: AgLlmExecuteTurnOptions): AgLlmResponseHandler {
  const translator = new ClaudeStreamTranslator();
  let resolveComplete!: (response: AgLlmResponse) => void;
  let rejectComplete!: (error: Error) => void;
  const complete = new Promise<AgLlmResponse>((resolve, reject) => {
    resolveComplete = resolve;
    rejectComplete = reject;
  });
  // Same rule as AG Studio's own adapter: a failed turn is reported once, through `complete`.
  void complete.catch(() => undefined);

  async function* run(): AsyncIterableIterator<AgAiEvent> {
    let thrown: Error | undefined;
    try {
      yield* streamTurn(encodeRequest(request), translator, options?.signal);
    } catch (error) {
      thrown = error instanceof Error ? error : new Error(String(error));
      if (thrown.name === "TypeError") thrown = new Error("Could not reach the server. Check that it is running.");
    }
    const { response, error } = translator.result();
    if (thrown ?? error) rejectComplete((thrown ?? error)!);
    else resolveComplete(response!);
  }

  const iterator = run();
  return { stream: { [Symbol.asyncIterator]: () => iterator }, complete };
}

export function claudeAdapter(): AgLlmAdapter {
  return { executeTurn: (request, options) => runTurn(request, options) };
}
