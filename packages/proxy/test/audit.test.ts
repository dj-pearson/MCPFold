import { mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { connectProxy } from '../src/proxy.js';
import { MemoryTransport } from '../src/transport/memory.js';
import {
  argumentShape,
  createAuditRecorder,
  fileAuditSink,
  type AuditEvent,
} from '../src/audit.js';
import type { JsonRpcMessage } from '../src/jsonrpc.js';

const SECRET = 'ghp_SUPERSECRETvalue1234567890';

/** A recorder whose events land in `events`, with a deterministic ms clock. */
function capturing(server = 'gh') {
  const events: AuditEvent[] = [];
  let t = 1_000;
  const recorder = createAuditRecorder({
    server,
    sink: (e) => events.push(e),
    now: () => (t += 5),
  });
  return { recorder, events };
}

describe('argumentShape (S18.4) — keys/types only, never values', () => {
  it('maps argument keys to JSON types and drops values', () => {
    const shape = argumentShape({
      name: 'search',
      arguments: { q: SECRET, limit: 10, deep: true, tags: ['a'], filter: { x: 1 }, none: null },
    });
    expect(shape).toEqual({
      q: 'string',
      limit: 'number',
      deep: 'boolean',
      tags: 'array',
      filter: 'object',
      none: 'null',
    });
    expect(JSON.stringify(shape)).not.toContain(SECRET);
  });

  it('is undefined when there are no arguments', () => {
    expect(argumentShape({ name: 'x' })).toBeUndefined();
    expect(argumentShape(undefined)).toBeUndefined();
  });
});

describe('connectProxy audit hooks (S18.4)', () => {
  const listResult = (id: number, tools: { name: string }[]): JsonRpcMessage => ({
    jsonrpc: '2.0',
    id,
    result: { tools },
  });

  it('logs a successful tool call with duration and arg shape only', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    const { recorder, events } = capturing();
    connectProxy(client, server, { audit: recorder });

    client.receive({
      jsonrpc: '2.0',
      id: 7,
      method: 'tools/call',
      params: { name: 'search', arguments: { q: SECRET, limit: 5 } },
    });
    // Request forwarded verbatim (secret still reaches the real server, just never the log).
    expect(server.sent[0]!.params).toMatchObject({ arguments: { q: SECRET } });
    server.receive({ jsonrpc: '2.0', id: 7, result: { content: [] } });

    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e).toMatchObject({ server: 'gh', type: 'tools/call', tool: 'search', outcome: 'ok' });
    expect(e.durationMs).toBeGreaterThan(0);
    expect(e.argShape).toEqual({ q: 'string', limit: 'number' });
    expect(JSON.stringify(e)).not.toContain(SECRET);
  });

  it('logs an error outcome when the response carries an error', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    const { recorder, events } = capturing();
    connectProxy(client, server, { audit: recorder });

    client.receive({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'boom' } });
    server.receive({ jsonrpc: '2.0', id: 1, error: { code: -32000, message: 'nope' } });

    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({ type: 'tools/call', tool: 'boom', outcome: 'error' });
  });

  it('logs a denied call (filtered) with a reason and never forwards it', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    const { recorder, events } = capturing();
    connectProxy(client, server, {
      audit: recorder,
      tools: { mode: 'deny', list: ['secret_tool'] },
    });

    client.receive({
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: { name: 'secret_tool', arguments: {} },
    });
    // Denied before reaching the server; client gets an error response.
    expect(server.sent).toHaveLength(0);
    expect(client.sent[0]!.error?.message).toContain('filtered by mcpfold');
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      type: 'tools/call',
      tool: 'secret_tool',
      outcome: 'denied',
      reason: 'filtered by mcpfold',
    });
    expect(events[0]!.durationMs).toBeUndefined();
  });

  it('logs a drift event with counts when the pinned surface changes', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    const { recorder, events } = capturing();
    connectProxy(client, server, {
      audit: recorder,
      pinnedTools: {
        surface: [{ name: 'a', description: '', schemaDigest: '' }],
        mode: 'warn',
      },
    });

    client.receive({ jsonrpc: '2.0', id: 3, method: 'tools/list' });
    server.receive(listResult(3, [{ name: 'a' }, { name: 'b' }])); // 'b' is new → drift

    const drift = events.find((e) => e.type === 'filter-drift');
    expect(drift).toBeDefined();
    expect(drift!.server).toBe('gh');
    expect(drift!.reason).toMatch(/added/);
  });

  it('does not log for a plain tools/list response (no phantom call)', () => {
    const client = new MemoryTransport();
    const server = new MemoryTransport();
    const { recorder, events } = capturing();
    connectProxy(client, server, { audit: recorder });

    client.receive({ jsonrpc: '2.0', id: 9, method: 'tools/list' });
    server.receive(listResult(9, [{ name: 'a' }]));
    expect(events).toHaveLength(0);
  });
});

describe('fileAuditSink (S18.4)', () => {
  let dir: string;
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  const event = (i: number): AuditEvent => ({
    ts: '2026-07-08T00:00:00.000Z',
    server: 'gh',
    type: 'tools/call',
    tool: `t${i}`,
    outcome: 'ok',
  });

  it('appends one JSON object per line', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-audit-'));
    const path = join(dir, 'audit.jsonl');
    const sink = fileAuditSink(path);
    sink(event(1));
    sink(event(2));
    const lines = readFileSync(path, 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[0]!)).toMatchObject({ tool: 't1' });
    expect(JSON.parse(lines[1]!)).toMatchObject({ tool: 't2' });
  });

  it('rotates to <path>.1 when the log reaches maxBytes', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-audit-'));
    const path = join(dir, 'audit.jsonl');
    const sink = fileAuditSink(path, { maxBytes: 40 });
    sink(event(1)); // writes > 40 bytes
    sink(event(2)); // sees oversized file → rotates, then writes fresh
    expect(statSync(`${path}.1`).isFile()).toBe(true);
    // The current file holds only the latest event.
    const current = readFileSync(path, 'utf8').trim().split('\n');
    expect(current).toHaveLength(1);
    expect(JSON.parse(current[0]!)).toMatchObject({ tool: 't2' });
  });

  it('is best-effort: an unwritable path warns once and never throws', () => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-audit-'));
    // Point the log at a path whose parent is a regular file → every write fails.
    const blocker = join(dir, 'blocker');
    writeFileSync(blocker, 'x');
    const warnings: string[] = [];
    const sink = fileAuditSink(join(blocker, 'audit.jsonl'), { warn: (m) => warnings.push(m) });
    expect(() => {
      sink(event(1));
      sink(event(2));
    }).not.toThrow();
    expect(warnings).toHaveLength(1); // warns once, not per event
    expect(warnings[0]).toContain('audit log write failed');
  });
});

describe('audit in-flight map is bounded (S22.13)', () => {
  it('evicts the oldest tracked call once the cap is exceeded, so unmatched ids do not accumulate', () => {
    const events: AuditEvent[] = [];
    let t = 1_000;
    const rec = createAuditRecorder({
      server: 'gh',
      sink: (e) => events.push(e),
      now: () => (t += 5),
      maxInflight: 2,
    });
    rec.callStart(1, 'a', {});
    rec.callStart(2, 'b', {});
    rec.callStart(3, 'c', {}); // over the cap → evicts id 1 (oldest)
    rec.callEnd(1, 'ok'); // id 1 was evicted → emits nothing
    rec.callEnd(3, 'ok'); // id 3 still tracked → emits
    expect(events.map((e) => e.tool)).toEqual(['c']);
  });
});
