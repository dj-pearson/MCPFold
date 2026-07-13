import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { runExplain, EXPLAIN, hasExplain } from '../src/commands/explain.js';
import { runDoctor } from '../src/commands/doctor.js';

/**
 * S25.5 — `mcpfold explain`. Offline authored explanations; every doctor finding's `explain` id must
 * resolve to a catalog entry (no orphans), a bare invocation lists topics, and an unknown key is a
 * loud usage error.
 */

describe('runExplain (S25.5)', () => {
  it('prints an authored entry for a known topic, with --json structure', () => {
    const res = runExplain({ topic: 'vscode-root-key' });
    expect(res.data.entry?.id).toBe('vscode-root-key');
    expect(res.data.entry?.title).toContain('servers');
    expect(res.human).toContain(EXPLAIN['vscode-root-key']!.title);
    expect(res.human).toContain('mcpServers'); // body mentions the trap
    // The structured payload (what --json emits) carries the full entry + topic list.
    expect(res.data.topics).toContain('hardcoded-secret');
  });

  it('a bare `explain` lists every topic without erroring', () => {
    const res = runExplain({});
    expect(res.data.entry).toBeNull();
    expect(res.data.topics.length).toBe(Object.keys(EXPLAIN).length);
    expect(res.human).toContain('Available topics');
    for (const id of Object.keys(EXPLAIN)) expect(res.human).toContain(id);
  });

  it('an unknown topic is a loud usage error listing the topics', () => {
    expect(() => runExplain({ topic: 'no-such-thing' })).toThrow(UsageError);
    expect(() => runExplain({ topic: 'no-such-thing' })).toThrow(/No explanation for/);
  });

  it('every catalog entry is self-consistent (id matches key, has a body)', () => {
    for (const [key, entry] of Object.entries(EXPLAIN)) {
      expect(entry.id).toBe(key);
      expect(entry.summary.length).toBeGreaterThan(0);
      expect(entry.body.length).toBeGreaterThan(40);
      for (const rel of entry.related ?? []) expect(hasExplain(rel)).toBe(true); // no dangling links
    }
  });
});

describe('doctor → explain wiring (S25.5)', () => {
  let cwd: string;
  let home: string;
  let ctx: OsContext;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'mcpfold-expl-'));
    home = mkdtempSync(join(tmpdir(), 'mcpfold-explhome-'));
    ctx = { platform: 'linux', home, env: {} };
  });
  afterEach(() => {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(home, { recursive: true, force: true });
  });
  const write = (t: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), t);

  it('every doctor finding that carries an explain id resolves to a catalog entry (no orphans)', () => {
    // A config + planted client file that together trigger a broad spread of finding classes.
    write(`{
      "version": 2,
      "servers": {
        "old": { "transport": "sse", "url": "https://x/sse", "tags": ["t"] },
        "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["t"] },
        "hard": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_literal" }, "tags": ["t"] },
        "vault": { "transport": "streamable-http", "url": "https://y/mcp", "auth": { "type": "bearer", "token": "\${vault:secret/x}" }, "tags": ["t"] }
      },
      "profiles": { "vs": { "client": "vscode", "scope": "user", "include": ["t"] } }
    }`);
    const vscodeDir = join(home, '.config', 'Code', 'User');
    mkdirSync(vscodeDir, { recursive: true });
    writeFileSync(join(vscodeDir, 'mcp.json'), '{"mcpServers":{"pw":{"command":"npx"}}}');

    const findings = runDoctor({ cwd, osContext: ctx }).data.findings;
    // Every explain id present must resolve; and we must have exercised several distinct classes.
    const ids = new Set<string>();
    for (const f of findings) {
      if (f.explain) {
        expect(hasExplain(f.explain), `orphan explain id "${f.explain}"`).toBe(true);
        ids.add(f.explain);
      }
    }
    for (const expected of [
      'deprecated-sse',
      'unpinned-latest',
      'hardcoded-secret',
      'unknown-secret-scheme',
      'vscode-root-key',
    ]) {
      expect(ids.has(expected), `expected doctor to emit "${expected}"`).toBe(true);
    }
  });

  it('doctor prints a `see: mcpfold explain <id>` pointer for a finding', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_x" }, "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    expect(runDoctor({ cwd, osContext: ctx }).human).toContain(
      'see: mcpfold explain hardcoded-secret',
    );
  });
});
