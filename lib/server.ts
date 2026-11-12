// Server only. Shared plumbing for the API routes: read and verify the signed workspace,
// sign the next one, the optional access code, a small rate limit, and error replies.

import { timingSafeEqual } from "node:crypto";
import { ACCESS_HEADER } from "./contract";
import type { ApiError, PublicConfig } from "./contract";
import { OpError } from "./ops";
import { OrderError } from "./paypal/orders";
import { PayPalError, paypalConfigured } from "./paypal/rest";
import { ToolkitError } from "./paypal/toolkit";
import { signWorkspace, verifyWorkspace } from "./sign";
import type { Envelope, Workspace } from "./types";

export class HttpFail extends Error {
  status: number;
  issue?: string;
  constructor(status: number, message: string, issue?: string) {
    super(message);
    this.status = status;
    this.issue = issue;
  }
}

const MAX_BODY = 600_000;
const MAX_EVENTS = 60;
const MAX_NOTES = 30;
const MAX_PROPOSALS = 30;

/** Parse the body, check the workspace signature, and hand back the rest of the fields. */
export async function readEnvelope(request: Request): Promise<{ ws: Workspace; body: Record<string, unknown> }> {
  const raw = await request.text();
  if (raw.length > MAX_BODY) throw new HttpFail(413, "The request is too large.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpFail(400, "The request is not valid JSON.");
  }
  if (!parsed || typeof parsed !== "object") throw new HttpFail(400, "The request is empty.");
  const { ws, sig, ...body } = parsed as { ws?: Workspace; sig?: string } & Record<string, unknown>;
  if (!ws || typeof ws !== "object" || typeof sig !== "string") throw new HttpFail(400, "The signed workspace is missing.");
  if (ws.v !== 1 || !verifyWorkspace(ws, sig)) {
    throw new HttpFail(409, "This workspace was not signed by this server. Start a new demo.", "BAD_SIGNATURE");
  }
  return { ws, body };
}

/** Bump the revision, keep the lists short, and sign. Every reply to the browser goes through here. */
export function seal(ws: Workspace): Envelope {
  ws.rev += 1;
  if (ws.events.length > MAX_EVENTS) ws.events = ws.events.slice(-MAX_EVENTS);
  if (ws.notes.length > MAX_NOTES) ws.notes = ws.notes.slice(-MAX_NOTES);
  if (ws.proposals.length > MAX_PROPOSALS) ws.proposals = ws.proposals.slice(-MAX_PROPOSALS);
  return { ws, sig: signWorkspace(ws) };
}

export function json(data: unknown, status = 200): Response {
  return Response.json(data, { status, headers: { "cache-control": "no-store" } });
}

export function codeRequired(): boolean {
  return !!process.env.TRANCHE_ACCESS_CODE;
}

/** The agent and every PayPal write need the access code when the server has one set. */
export function requireCode(request: Request): void {
  const want = process.env.TRANCHE_ACCESS_CODE;
  if (!want) return;
  const got = request.headers.get(ACCESS_HEADER) ?? "";
  const a = Buffer.from(want);
  const b = Buffer.from(got);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw new HttpFail(401, "The access code is missing or wrong.");
}

const hits = new Map<string, number[]>();

/** In-memory, per IP. Enough to stop a runaway loop or a casual scraper; not a security boundary. */
export function rateLimit(request: Request, bucket: string, max: number, windowMs: number): void {
  const ip = (request.headers.get("x-forwarded-for") ?? "local").split(",")[0].trim();
  const key = `${bucket}:${ip}`;
  const now = Date.now();
  const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
  if (recent.length >= max) throw new HttpFail(429, "Too many requests. Wait a minute and try again.");
  recent.push(now);
  if (hits.size > 5000) hits.clear();
  hits.set(key, recent);
}

/** Public address of this app, for the PayPal return link. */
export function appUrl(request: Request): string {
  const fixed = process.env.APP_URL?.replace(/\/+$/, "");
  if (fixed) return fixed;
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "127.0.0.1:3400";
  const proto = request.headers.get("x-forwarded-proto") ?? (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

export function publicConfig(): PublicConfig {
  return {
    needsCode: codeRequired(),
    paypal: paypalConfigured(),
    agent: !!process.env.ANTHROPIC_API_KEY,
    sandboxBuyerEmail: process.env.TRANCHE_CLIENT_EMAIL || undefined,
    sandboxBuyerPassword: process.env.TRANCHE_CLIENT_PASSWORD || undefined,
  };
}

/** One plain sentence and, when PayPal said no, PayPal's issue code. */
export function describe(err: unknown): { status: number; body: ApiError } {
  if (err instanceof HttpFail || err instanceof OpError) return { status: err.status, body: { error: err.message, issue: err.issue } };
  if (err instanceof PayPalError) {
    return { status: err.status >= 500 || err.status === 401 ? 502 : 400, body: { error: err.message, issue: err.issue } };
  }
  if (err instanceof OrderError) return { status: err.status, body: { error: err.message, issue: err.issue } };
  if (err instanceof ToolkitError) return { status: 502, body: { error: err.message } };
  console.error("[tranche] unexpected error", err);
  return { status: 500, body: { error: "Something went wrong on the server. Try again." } };
}

export function errorResponse(err: unknown): Response {
  const { status, body } = describe(err);
  return json(body, status);
}
