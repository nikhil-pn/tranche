// Small fetch helpers for the browser. Every call carries the access code when one is stored.

import { ACCESS_HEADER, type AgentStreamEvent, type ApiError } from "@/lib/contract";

export class HttpError extends Error {
  status: number;
  issue?: string;

  constructor(status: number, message: string, issue?: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
    this.issue = issue;
  }
}

function defaultMessage(status: number): string {
  if (status === 401) return "The access code is missing or wrong.";
  if (status === 404) return "The server is not ready yet (404).";
  if (status === 429) return "Too many requests. Wait a moment and try again.";
  return `The request failed (${status}).`;
}

export function headers(code: string): Record<string, string> {
  const h: Record<string, string> = { "content-type": "application/json" };
  if (code) h[ACCESS_HEADER] = code;
  return h;
}

export async function readJson<T>(res: Response): Promise<T> {
  const text = await res.text();
  let data: unknown = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = null;
  }
  if (!res.ok) {
    const e = data as Partial<ApiError> | null;
    const message = e && typeof e.error === "string" && e.error ? e.error : defaultMessage(res.status);
    throw new HttpError(res.status, message, e && typeof e.issue === "string" ? e.issue : undefined);
  }
  if (data === null || typeof data !== "object") {
    throw new HttpError(res.status, "The server sent a reply that could not be read.");
  }
  return data as T;
}

export async function getJson<T>(path: string, code: string): Promise<T> {
  const res = await fetch(path, { headers: headers(code), cache: "no-store" });
  return readJson<T>(res);
}

export async function postJson<T>(path: string, body: unknown, code: string, signal?: AbortSignal): Promise<T> {
  const res = await fetch(path, {
    method: "POST",
    headers: headers(code),
    body: JSON.stringify(body),
    cache: "no-store",
    signal,
  });
  return readJson<T>(res);
}

/** One plain sentence for the error banner. */
export function describeError(e: unknown): string | null {
  if (e instanceof HttpError) return e.issue ? `${e.message} (${e.issue})` : e.message;
  if (e instanceof DOMException && e.name === "AbortError") return null;
  return "Could not reach the server. Check that it is running and try again.";
}

/**
 * Read a text/event-stream body. Calls `onEvent` for every `data:` block.
 * Stops early when `onEvent` returns true (the stream said it is finished).
 */
export async function readEventStream(
  body: ReadableStream<Uint8Array>,
  onEvent: (ev: AgentStreamEvent) => boolean,
): Promise<void> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let finished = false;
  try {
    while (!finished) {
      const { value, done } = await reader.read();
      if (done) break;
      buf = (buf + decoder.decode(value, { stream: true })).replace(/\r\n/g, "\n");
      let cut = buf.indexOf("\n\n");
      while (cut >= 0 && !finished) {
        const block = buf.slice(0, cut);
        buf = buf.slice(cut + 2);
        cut = buf.indexOf("\n\n");
        const data = block
          .split("\n")
          .filter((l) => l.startsWith("data:"))
          .map((l) => l.slice(5).replace(/^ /, ""))
          .join("\n");
        if (!data) continue;
        let ev: AgentStreamEvent;
        try {
          ev = JSON.parse(data) as AgentStreamEvent;
        } catch {
          continue;
        }
        if (onEvent(ev)) finished = true;
      }
    }
  } finally {
    reader.cancel().catch(() => undefined);
  }
}
