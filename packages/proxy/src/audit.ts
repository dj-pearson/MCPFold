import { appendFileSync, mkdirSync, renameSync, statSync } from 'node:fs';
import { dirname } from 'node:path';
import type { JsonRpcId } from './jsonrpc.js';

/**
 * Redacted runtime tool-call audit log at the proxy (S18.4).
 *
 * The proxy already sits in the call path, so it is the natural place to record what tools were
 * invoked, when, for how long, and with what outcome — the kind of observability enterprises ask
 * for. Auditing is OPT-IN and off by default; a {@link noopAuditRecorder} is used otherwise.
 *
 * Privacy by construction: an event records the argument SHAPE only — each argument key mapped to
 * its JSON type — never argument VALUES. There is therefore no path for a secret to reach the log,
 * independent of any redaction pass. Writing is best-effort: a corrupt or unwritable log emits one
 * stderr note and is then ignored, so it can never break the proxied session.
 */

export type AuditOutcome = 'ok' | 'error' | 'denied';

export interface AuditEvent {
  /** ISO-8601 timestamp. */
  ts: string;
  /** Canonical mcpfold server name the call was routed to. */
  server: string;
  /** `tools/call` for an invocation, `filter-drift` for a pinned-surface drift. */
  type: 'tools/call' | 'filter-drift';
  /** The tool name, when known. */
  tool?: string;
  /** Invocation outcome (absent for drift events). */
  outcome?: AuditOutcome;
  /** Wall-clock duration for a completed call. */
  durationMs?: number;
  /** Argument key → JSON type. Never argument values. */
  argShape?: Record<string, string>;
  /** Why a call was denied, or a one-line drift summary — enough context to alert on. */
  reason?: string;
}

/** A sink persists a fully-formed audit event. */
export type AuditSink = (event: AuditEvent) => void;

/**
 * The lifecycle hooks the proxy calls. Created once per proxied connection (bound to one server).
 * `callEnd` is safe to call for any response id — it only emits for ids that were `callStart`ed.
 */
export interface AuditRecorder {
  callStart(id: JsonRpcId, tool: string | undefined, params: unknown): void;
  callEnd(id: JsonRpcId, outcome: 'ok' | 'error'): void;
  denied(tool: string | undefined, reason: string): void;
  drift(reason: string): void;
}

/** A recorder that records nothing — the default when auditing is disabled. */
export const noopAuditRecorder: AuditRecorder = {
  callStart() {},
  callEnd() {},
  denied() {},
  drift() {},
};

/** JSON type of a value, distinguishing null and array from the generic `object`. */
function jsonType(v: unknown): string {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  return typeof v;
}

/** Argument key → JSON type for a `tools/call` params object; undefined when there are no args. */
export function argumentShape(params: unknown): Record<string, string> | undefined {
  const args = (params as { arguments?: unknown } | undefined)?.arguments;
  if (typeof args !== 'object' || args === null) return undefined;
  const shape: Record<string, string> = {};
  for (const [k, v] of Object.entries(args)) shape[k] = jsonType(v);
  return shape;
}

/** Build a recorder that stamps + correlates events and forwards them to `sink`. */
export function createAuditRecorder(opts: {
  server: string;
  sink: AuditSink;
  /** Injectable clock (ms since epoch) for deterministic tests. */
  now?: () => number;
  /** Max concurrently-tracked in-flight calls before the oldest are evicted (S22.13). Default 1024. */
  maxInflight?: number;
}): AuditRecorder {
  const now = opts.now ?? (() => Date.now());
  const maxInflight = opts.maxInflight ?? 1024;
  const iso = (ms: number) => new Date(ms).toISOString();
  const inflight = new Map<
    JsonRpcId,
    { tool?: string; argShape?: Record<string, string>; at: number }
  >();

  return {
    callStart(id, tool, params) {
      // Bound the map: a server that never sends a matching response would otherwise leak one entry
      // per call. Evict the oldest tracked calls (Map keeps insertion order) once over the cap (S22.13).
      while (inflight.size >= maxInflight) {
        const oldest = inflight.keys().next().value;
        if (oldest === undefined) break;
        inflight.delete(oldest);
      }
      inflight.set(id, { tool, argShape: argumentShape(params), at: now() });
    },
    callEnd(id, outcome) {
      const started = inflight.get(id);
      if (!started) return; // not a tracked tools/call (e.g. a tools/list response) → ignore
      inflight.delete(id);
      const at = now();
      opts.sink({
        ts: iso(at),
        server: opts.server,
        type: 'tools/call',
        tool: started.tool,
        outcome,
        durationMs: at - started.at,
        argShape: started.argShape,
      });
    },
    denied(tool, reason) {
      opts.sink({
        ts: iso(now()),
        server: opts.server,
        type: 'tools/call',
        tool,
        outcome: 'denied',
        reason,
      });
    },
    drift(reason) {
      opts.sink({ ts: iso(now()), server: opts.server, type: 'filter-drift', reason });
    },
  };
}

/**
 * A file-backed JSONL sink with size-based rotation. When the log reaches `maxBytes` it is rolled
 * to `${path}.1` (single generation) and a fresh file is started. Every failure is swallowed after
 * one stderr note so the proxied session is never interrupted.
 */
export function fileAuditSink(
  path: string,
  opts: { maxBytes?: number; warn?: (msg: string) => void } = {},
): AuditSink {
  const maxBytes = opts.maxBytes ?? 5 * 1024 * 1024;
  const warn = opts.warn ?? ((m: string) => process.stderr.write(`${m}\n`));
  let warned = false;

  return (event) => {
    try {
      mkdirSync(dirname(path), { recursive: true });
      try {
        if (statSync(path).size >= maxBytes) renameSync(path, `${path}.1`);
      } catch {
        // No existing log yet (or stat failed) — nothing to rotate.
      }
      appendFileSync(path, `${JSON.stringify(event)}\n`, { encoding: 'utf8', mode: 0o600 });
    } catch (error) {
      if (!warned) {
        warned = true;
        warn(
          `mcpfold: audit log write failed (${(error as Error).message}); continuing without audit.`,
        );
      }
    }
  };
}
