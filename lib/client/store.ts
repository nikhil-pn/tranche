"use client";

// The browser's copy of the workspace. The server signs it; we keep the newest signed copy,
// send it with every call and replace it with whatever comes back.

import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type {
  Action,
  ActionName,
  ActResult,
  AgentRequest,
  AgentStreamEvent,
  AgentTurn,
  PublicConfig,
} from "@/lib/contract";
import { makeSampleInProgress } from "@/lib/seed";
import type { Envelope, Workspace } from "@/lib/types";
import { describeError, getJson, headers, HttpError, postJson, readEventStream, readJson } from "./api";

export const WS_KEY = "tranche.ws.v1";
export const CODE_KEY = "tranche.code";
export const POKE_KEY = "tranche.poke";

const SYNC_EVERY_MS = 8000;
const TOAST_MS = 4000;
const HISTORY_TURNS = 8;
const SAMPLE_READ_ONLY = "Sample data is read-only. Open the app without ?sample=1 to use the live demo.";

export type AgentItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; id: string; name: string; label: string; status: "running" | "ok" | "failed"; summary?: string }
  /** The run stopped with an error. Shown in the transcript, never sent back as history. */
  | { kind: "error"; text: string };

export type BusyName = ActionName | "agent" | "reset";

export interface TrancheStore {
  ws: Workspace | null;
  sig: string;
  /** True once a workspace is loaded. */
  ready: boolean;
  /** True when the page was opened with ?sample=1 (local sample data, no API). */
  sample: boolean;
  /** What is running right now: an action name, "agent" or "reset". Null when idle. */
  busy: BusyName | null;
  /** The same, narrowed to its target, e.g. "gate.raiseInvoice:g2". See `actionKey`. */
  busyKey: string | null;
  error: string | null;
  clearError: () => void;
  config: PublicConfig | null;
  code: string;
  setCode: (code: string) => void;
  /** The server wants an access code and we have none, or the stored one was refused. */
  codeNeeded: boolean;
  act: (action: Action, opts?: { quiet?: boolean }) => Promise<boolean>;
  reset: () => Promise<void>;
  agent: { running: boolean; items: AgentItem[] };
  runAgent: (message: string) => Promise<void>;
  toast: string | null;
  dismissToast: () => void;
}

/** A key that names one button: the action plus the thing it acts on. */
export function actionKey(a: Action): string {
  switch (a.action) {
    case "gate.requestHold":
    case "gate.captureDeposit":
    case "gate.raiseInvoice":
    case "gate.remind":
    case "gate.reschedule":
    case "gate.recordPayment":
      return `${a.action}:${a.gateId}`;
    case "payout.approve":
    case "payout.reject":
      return `${a.action}:${a.proposalId}`;
    case "redteam.forge":
      return `${a.action}:${a.scenario}`;
    case "clock.advance":
      return `${a.action}:${a.days}`;
    default:
      return a.action;
  }
}

/** Something is waiting at PayPal, so it is worth asking again. */
export function openAtPayPal(ws: Workspace): boolean {
  return (
    ws.gates.some((g) => g.status === "invoiced" || g.status === "overdue") ||
    ws.receipts.some((r) => r.status === "PENDING" || r.status === "PROCESSING")
  );
}

function lsGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function lsSet(key: string, value: string) {
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Storage full or blocked: the app still works for this tab.
  }
}

function loadStored(): Envelope | null {
  const raw = lsGet(WS_KEY);
  if (!raw) return null;
  try {
    const env = JSON.parse(raw) as Partial<Envelope> | null;
    const ws = env?.ws;
    if (!ws || ws.v !== 1 || typeof env.sig !== "string" || !env.sig) return null;
    if (!Array.isArray(ws.gates) || !Array.isArray(ws.tasks) || typeof ws.rev !== "number") return null;
    return { ws, sig: env.sig };
  } catch {
    return null;
  }
}

/** The transcript as chat turns (text only), oldest first, ready to send as history. */
function toHistory(items: AgentItem[]): AgentTurn[] {
  const turns: AgentTurn[] = [];
  for (const it of items) {
    if (it.kind !== "user" && it.kind !== "assistant") continue;
    const text = it.text.trim();
    if (!text) continue;
    const last = turns[turns.length - 1];
    if (last && last.role === it.kind) last.text = `${last.text}\n\n${text}`;
    else turns.push({ role: it.kind, text });
  }
  const tail = turns.slice(-HISTORY_TURNS);
  while (tail.length && tail[0].role !== "user") tail.shift();
  return tail;
}

const Ctx = createContext<TrancheStore | null>(null);

export function useTranche(): TrancheStore {
  const store = useContext(Ctx);
  if (!store) throw new Error("useTranche must be used inside <TrancheProvider>");
  return store;
}

export function TrancheProvider({ children }: { children: ReactNode }) {
  const [env, setEnv] = useState<Envelope | null>(null);
  const [ready, setReady] = useState(false);
  const [sample, setSample] = useState(false);
  const [busyState, setBusyState] = useState<{ name: BusyName; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<PublicConfig | null>(null);
  const [code, setCodeState] = useState("");
  const [codeRejected, setCodeRejected] = useState(false);
  const [items, setItems] = useState<AgentItem[]>([]);
  const [running, setRunning] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  // Refs hold the values that queued work must read at the moment it runs, not when it was queued.
  const envRef = useRef<Envelope | null>(null);
  const sampleRef = useRef(false);
  const codeRef = useRef("");
  const itemsRef = useRef<AgentItem[]>([]);
  const queueRef = useRef<Promise<unknown>>(Promise.resolve());
  const inFlightRef = useRef(0);
  const loudRef = useRef<{ name: BusyName; key: string }[]>([]);
  const abortRef = useRef<AbortController | null>(null);
  const toastTimer = useRef<number | undefined>(undefined);
  const flushRef = useRef<number | undefined>(undefined);
  const lastSyncRef = useRef(0);
  const bootedRef = useRef(false);

  const apply = useCallback((next: Envelope, force = false): boolean => {
    const cur = envRef.current;
    if (!force && cur && cur.ws.id === next.ws.id && next.ws.rev < cur.ws.rev) return false;
    envRef.current = next;
    setEnv(next);
    if (!sampleRef.current) lsSet(WS_KEY, JSON.stringify(next));
    return true;
  }, []);

  /** Run jobs one at a time, in the order they were asked for. */
  const enqueue = useCallback(<T,>(job: () => Promise<T>, loud?: { name: BusyName; key: string }): Promise<T> => {
    inFlightRef.current += 1;
    if (loud) {
      loudRef.current.push(loud);
      setBusyState(loudRef.current[0]);
    }
    const run = queueRef.current.then(job);
    queueRef.current = run.then(
      () => undefined,
      () => undefined,
    ).then(() => {
      inFlightRef.current -= 1;
      if (loud) {
        const i = loudRef.current.indexOf(loud);
        if (i >= 0) loudRef.current.splice(i, 1);
        setBusyState(loudRef.current[0] ?? null);
      }
    });
    return run;
  }, []);

  const fail = useCallback((e: unknown): string | null => {
    if (e instanceof HttpError && e.status === 401) setCodeRejected(true);
    const message = describeError(e);
    if (message) setError(message);
    return message;
  }, []);

  const showToast = useCallback((message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(null), TOAST_MS);
  }, []);

  const dismissToast = useCallback(() => {
    window.clearTimeout(toastTimer.current);
    setToast(null);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  const setCode = useCallback((next: string) => {
    const clean = next.trim();
    codeRef.current = clean;
    setCodeState(clean);
    setCodeRejected(false);
    lsSet(CODE_KEY, clean);
  }, []);

  const act = useCallback(
    (action: Action, opts?: { quiet?: boolean }): Promise<boolean> => {
      const quiet = opts?.quiet === true;
      return enqueue(
        async () => {
          const cur = envRef.current;
          if (!cur) return false;
          if (!quiet) setError(null);
          if (sampleRef.current) {
            if (!quiet) setError(SAMPLE_READ_ONLY);
            return false;
          }
          try {
            const res = await postJson<ActResult>("/api/act", { ws: cur.ws, sig: cur.sig, ...action }, codeRef.current);
            apply({ ws: res.ws, sig: res.sig });
            if (!quiet && res.message) {
              // A refused approval comes back as a normal answer. It must not look like a success.
              if (action.action === "payout.approve" && /^refused/i.test(res.message)) setError(res.message);
              else showToast(res.message);
            }
            return true;
          } catch (e) {
            if (!quiet) fail(e);
            return false;
          }
        },
        quiet ? undefined : { name: action.action, key: actionKey(action) },
      );
    },
    [apply, enqueue, fail, showToast],
  );

  /** Agent transcript: the ref is the truth, React state follows at most once per frame. */
  const mutateItems = useCallback((fn: (xs: AgentItem[]) => AgentItem[], now = false) => {
    itemsRef.current = fn(itemsRef.current);
    if (now) {
      if (flushRef.current !== undefined) window.cancelAnimationFrame(flushRef.current);
      flushRef.current = undefined;
      setItems(itemsRef.current);
      return;
    }
    if (flushRef.current !== undefined) return;
    flushRef.current = window.requestAnimationFrame(() => {
      flushRef.current = undefined;
      setItems(itemsRef.current);
    });
  }, []);

  const loadWorkspace = useCallback(
    (clearTranscript: boolean): Promise<void> =>
      enqueue(
        async () => {
          try {
            if (sampleRef.current) {
              apply({ ws: makeSampleInProgress(), sig: "" }, true);
            } else {
              const fresh = await postJson<Envelope>("/api/workspace/new", {}, codeRef.current);
              if (!fresh.ws || typeof fresh.sig !== "string") {
                throw new HttpError(500, "The server did not send a workspace.");
              }
              apply({ ws: fresh.ws, sig: fresh.sig }, true);
            }
            if (clearTranscript) mutateItems(() => [], true);
            setError(null);
            setReady(true);
          } catch (e) {
            fail(e);
          }
        },
        { name: "reset", key: "reset" },
      ),
    [apply, enqueue, fail, mutateItems],
  );

  const reset = useCallback((): Promise<void> => {
    abortRef.current?.abort();
    return loadWorkspace(true);
  }, [loadWorkspace]);

  const runAgent = useCallback(
    (message: string): Promise<void> => {
      const text = message.trim();
      if (!text) return Promise.resolve();
      return enqueue(
        async () => {
          const cur = envRef.current;
          if (!cur) return;
          const history = toHistory(itemsRef.current);
          mutateItems((xs) => [...xs, { kind: "user", text }], true);
          setError(null);
          setRunning(true);

          const stop = (why: string) => mutateItems((xs) => [...xs, { kind: "error", text: why }], true);
          const controller = new AbortController();
          abortRef.current = controller;
          let ended = false;

          const onEvent = (ev: AgentStreamEvent): boolean => {
            switch (ev.type) {
              case "text":
                if (!ev.delta) return false;
                mutateItems((xs) => {
                  const last = xs[xs.length - 1];
                  if (last && last.kind === "assistant") {
                    return [...xs.slice(0, -1), { kind: "assistant", text: last.text + ev.delta }];
                  }
                  return [...xs, { kind: "assistant", text: ev.delta }];
                });
                return false;
              case "tool":
                mutateItems((xs) => [
                  ...xs,
                  { kind: "tool", id: ev.id, name: ev.name, label: ev.label || ev.name, status: "running" },
                ]);
                return false;
              case "tool_result":
                mutateItems((xs) =>
                  xs.map((it) =>
                    it.kind === "tool" && it.id === ev.id
                      ? { ...it, status: ev.ok ? "ok" : "failed", summary: ev.summary }
                      : it,
                  ),
                );
                return false;
              case "state":
                apply({ ws: ev.ws, sig: ev.sig });
                return false;
              case "done":
                ended = true;
                return true;
              case "error":
                ended = true;
                stop(ev.message || "The agent stopped with an error.");
                return true;
              default:
                return false;
            }
          };

          try {
            if (sampleRef.current) throw new HttpError(400, SAMPLE_READ_ONLY);
            const body: Envelope & AgentRequest = { ws: cur.ws, sig: cur.sig, message: text, history };
            const res = await fetch("/api/agent", {
              method: "POST",
              headers: { ...headers(codeRef.current), accept: "text/event-stream" },
              body: JSON.stringify(body),
              cache: "no-store",
              signal: controller.signal,
            });
            if (!res.ok) await readJson<never>(res);
            if (!res.body) throw new HttpError(res.status, "The server sent an empty reply.");
            await readEventStream(res.body, onEvent);
            if (!ended) stop("The connection closed before the agent finished.");
          } catch (e) {
            const why = fail(e);
            if (why) stop(why);
          } finally {
            if (abortRef.current === controller) abortRef.current = null;
            // A tool that never reported back did not finish.
            mutateItems(
              (xs) =>
                xs.map((it) =>
                  it.kind === "tool" && it.status === "running"
                    ? { ...it, status: "failed", summary: it.summary ?? "No result came back." }
                    : it,
                ),
              true,
            );
            setRunning(false);
          }
        },
        { name: "agent", key: "agent" },
      );
    },
    [apply, enqueue, fail, mutateItems],
  );

  // First load: access code and sample flag from the URL, then the stored workspace or a new one.
  useEffect(() => {
    if (bootedRef.current) return;
    bootedRef.current = true;

    const url = new URL(window.location.href);
    const urlCode = url.searchParams.get("code")?.trim();
    let stored = lsGet(CODE_KEY) ?? "";
    if (urlCode) {
      stored = urlCode;
      lsSet(CODE_KEY, stored);
      url.searchParams.delete("code");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
    codeRef.current = stored;
    const isSample = url.searchParams.get("sample") === "1";
    sampleRef.current = isSample;

    void (async () => {
      await Promise.resolve();
      setCodeState(stored);
      setSample(isSample);
      getJson<PublicConfig>("/api/config", stored)
        .then((c) => setConfig(c))
        .catch(() => undefined);
      const saved = isSample ? null : loadStored();
      if (saved) {
        apply(saved, true);
        setReady(true);
      } else {
        await loadWorkspace(false);
      }
    })();
  }, [apply, loadWorkspace]);

  // Quiet sync with PayPal: on a timer while something is open there, on focus, and when the
  // PayPal return tab pokes us. Never while anything else is in flight.
  useEffect(() => {
    const quietSync = () => {
      if (!envRef.current || sampleRef.current) return;
      if (inFlightRef.current > 0) return;
      if (Date.now() - lastSyncRef.current < 1500) return;
      lastSyncRef.current = Date.now();
      void act({ action: "sync" }, { quiet: true });
    };
    const timer = window.setInterval(() => {
      if (document.visibilityState !== "visible") return;
      const ws = envRef.current?.ws;
      if (ws && openAtPayPal(ws)) quietSync();
    }, SYNC_EVERY_MS);
    let again: number | undefined;
    const onFocus = () => quietSync();
    const onStorage = (e: StorageEvent) => {
      if (e.key !== POKE_KEY) return;
      quietSync();
      // PayPal can take a moment to show the approval: look once more shortly after.
      window.clearTimeout(again);
      again = window.setTimeout(quietSync, 3000);
    };
    window.addEventListener("focus", onFocus);
    window.addEventListener("storage", onStorage);
    return () => {
      window.clearInterval(timer);
      window.clearTimeout(again);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("storage", onStorage);
    };
  }, [act]);

  const codeNeeded = codeRejected || (config?.needsCode === true && !code);

  const store = useMemo<TrancheStore>(
    () => ({
      ws: env?.ws ?? null,
      sig: env?.sig ?? "",
      ready,
      sample,
      busy: busyState?.name ?? null,
      busyKey: busyState?.key ?? null,
      error,
      clearError,
      config,
      code,
      setCode,
      codeNeeded,
      act,
      reset,
      agent: { running, items },
      runAgent,
      toast,
      dismissToast,
    }),
    [
      env,
      ready,
      sample,
      busyState,
      error,
      clearError,
      config,
      code,
      setCode,
      codeNeeded,
      act,
      reset,
      running,
      items,
      runAgent,
      toast,
      dismissToast,
    ],
  );

  return createElement(Ctx.Provider, { value: store }, children);
}
