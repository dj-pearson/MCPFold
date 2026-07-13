import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import { loadConfig } from '@mcpfold/core';
import { runCurate, runCurateApply, resolveAuditLogPath } from '../src/commands/curate.js';
import { checkCurationOpportunity } from '../src/checks/curation.js';

const CONFIG = `{
  "version": 1,
  "servers": {
    "github": {
      "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@latest"],
      "pin": "1.0.0", "tags": ["code"],
      "tools": { "mode": "allow", "list": ["search_code", "create_pr", "delete_repo"] }
    },
    "supabase": {
      "transport": "stdio", "command": "npx", "args": ["-y", "supabase-mcp@latest"], "pin": "1.0.0", "tags": ["db"]
    }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code", "db"] } }
}`;

function call(server: string, tool: string, outcome: string, ts: string): string {
  return JSON.stringify({ ts, server, type: 'tools/call', tool, outcome });
}

const LOG = [
  call('github', 'search_code', 'ok', '2026-07-10T00:00:00.000Z'),
  call('github', 'search_code', 'ok', '2026-07-11T00:00:00.000Z'),
  call('github', 'create_pr', 'ok', '2026-07-01T00:00:00.000Z'),
  call('github', 'delete_repo', 'denied', '2026-07-11T00:00:00.000Z'),
  'this is a torn line',
  '',
  call('supabase', 'run_sql', 'ok', '2026-07-11T00:00:00.000Z'),
].join('\n');

let cwd: string;
let logPath: string;
const NOW = () => Date.parse('2026-07-12T00:00:00.000Z');

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-curate-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  logPath = join(cwd, 'audit.jsonl');
  writeFileSync(logPath, LOG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('resolveAuditLogPath (S23.2)', () => {
  it('prefers the flag, then env, else throws a UsageError naming both', () => {
    expect(resolveAuditLogPath({ auditLogPath: '/a', env: { MCPFOLD_AUDIT_LOG: '/b' } })).toBe(
      '/a',
    );
    expect(resolveAuditLogPath({ env: { MCPFOLD_AUDIT_LOG: '/b' } })).toBe('/b');
    expect(() => resolveAuditLogPath({ env: {} })).toThrow(UsageError);
    try {
      resolveAuditLogPath({ env: {} });
    } catch (e) {
      expect((e as UsageError).message).toMatch(/--audit-log|MCPFOLD_AUDIT_LOG/);
    }
  });
});

describe('runCurate (S23.2)', () => {
  it('reports per-server usage and a recommended allow-list, read-only', () => {
    const configPath = join(cwd, 'mcp.config.jsonc');
    const before = readFileSync(configPath, 'utf8');
    const { data, exit } = runCurate({ cwd, auditLogPath: logPath, now: NOW });
    expect(exit).toBe(0);
    expect(data.servers.map((s) => s.server)).toEqual(['github', 'supabase']);

    const gh = data.servers.find((s) => s.server === 'github')!;
    // Sorted by call count desc: search_code (2), then create_pr/delete_repo (1 each, name tiebreak).
    expect(gh.tools.map((t) => t.tool)).toEqual(['search_code', 'create_pr', 'delete_repo']);
    const sc = gh.tools.find((t) => t.tool === 'search_code')!;
    expect(sc.calls).toBe(2);
    // Recommendation excludes the denied-only delete_repo.
    expect(gh.recommended).toEqual({ mode: 'allow', list: ['create_pr', 'search_code'] });
    // delete_repo is allowed today but never successfully used.
    expect(gh.unusedAllowed).toEqual(['delete_repo']);
    expect(gh.alreadyCurated).toBe(false);
    expect(gh.currentMode).toBe('allow');
    // Read-only: the config file is byte-identical afterwards.
    expect(readFileSync(configPath, 'utf8')).toBe(before);
  });

  it('narrows to a single server via the positional argument', () => {
    const { data } = runCurate({ cwd, auditLogPath: logPath, server: 'supabase', now: NOW });
    expect(data.servers.map((s) => s.server)).toEqual(['supabase']);
    expect(data.servers[0]!.recommended.list).toEqual(['run_sql']);
  });

  it('applies the --since window', () => {
    // 7-day window from 2026-07-12 → cutoff 07-05, drops create_pr (07-01).
    const { data } = runCurate({ cwd, auditLogPath: logPath, sinceDays: 7, now: NOW });
    const gh = data.servers.find((s) => s.server === 'github')!;
    expect(gh.recommended.list).toEqual(['search_code']);
    expect(data.sinceDays).toBe(7);
  });

  it('applies --min-calls', () => {
    const { data } = runCurate({ cwd, auditLogPath: logPath, minCalls: 2, now: NOW });
    const gh = data.servers.find((s) => s.server === 'github')!;
    // Only search_code has ≥2 calls.
    expect(gh.tools.map((t) => t.tool)).toEqual(['search_code']);
    expect(gh.recommended.list).toEqual(['search_code']);
  });

  it('throws a UsageError when the log path does not exist', () => {
    expect(() => runCurate({ cwd, auditLogPath: join(cwd, 'nope.jsonl'), now: NOW })).toThrow(
      UsageError,
    );
  });

  it('throws a UsageError when neither flag nor env is set', () => {
    expect(() => runCurate({ cwd, env: {}, now: NOW })).toThrow(UsageError);
  });

  it('reports empty (exit 0) when the log has no matching calls', () => {
    writeFileSync(logPath, '');
    const { data, exit } = runCurate({ cwd, auditLogPath: logPath, now: NOW });
    expect(exit).toBe(0);
    expect(data.servers).toEqual([]);
  });

  it('human output carries no ANSI codes (color disabled under no-TTY test env)', () => {
    const { human } = runCurate({ cwd, auditLogPath: logPath, now: NOW });
    // eslint-disable-next-line no-control-regex
    expect(human).not.toMatch(/\u001b\[/);
    expect(human).toContain('github');
    expect(human).toContain('recommend allow');
  });
});

describe('runCurateApply (S23.3)', () => {
  const configPath = () => join(cwd, 'mcp.config.jsonc');

  it('--write applies the recommended allow-list and preserves JSONC comments', async () => {
    // Add a comment to prove the structural edit keeps it.
    writeFileSync(configPath(), `// keep me\n${CONFIG}`);
    const out = await runCurateApply({
      cwd,
      auditLogPath: logPath,
      now: NOW,
      write: true,
      yes: true,
    });
    expect(out.exit).toBe(0);
    const text = readFileSync(configPath(), 'utf8');
    expect(text).toContain('// keep me'); // comment survived
    const cfg = loadConfig(text);
    expect(cfg.ok).toBe(true);
    if (cfg.ok) {
      // github allow-list tightened to actually-used tools; delete_repo (denied-only) dropped.
      expect(cfg.config.servers.github!.tools).toEqual({
        mode: 'allow',
        list: ['create_pr', 'search_code'],
      });
      // supabase had no directive; it gains one for its used tool.
      expect(cfg.config.servers.supabase!.tools).toEqual({ mode: 'allow', list: ['run_sql'] });
    }
  });

  it('--dry-run shows the diff but leaves the file byte-identical', async () => {
    const before = readFileSync(configPath(), 'utf8');
    const out = await runCurateApply({ cwd, auditLogPath: logPath, now: NOW, dryRun: true });
    expect(out.exit).toBe(0);
    expect(out.human).toContain('allow');
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
  });

  it('non-interactive without --yes does not write', async () => {
    const before = readFileSync(configPath(), 'utf8');
    const out = await runCurateApply({
      cwd,
      auditLogPath: logPath,
      now: NOW,
      write: true,
      isTTY: false,
    });
    expect(out.human).toMatch(/--yes/);
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
  });

  it('a declined confirmation does not write', async () => {
    const before = readFileSync(configPath(), 'utf8');
    await runCurateApply({
      cwd,
      auditLogPath: logPath,
      now: NOW,
      write: true,
      isTTY: true,
      confirm: () => Promise.resolve(false),
    });
    expect(readFileSync(configPath(), 'utf8')).toBe(before);
  });

  it('is idempotent — a second --write reports already-curated and does not rewrite', async () => {
    await runCurateApply({ cwd, auditLogPath: logPath, now: NOW, write: true, yes: true });
    const after1 = readFileSync(configPath(), 'utf8');
    const out = await runCurateApply({
      cwd,
      auditLogPath: logPath,
      now: NOW,
      write: true,
      yes: true,
    });
    expect(out.human).toMatch(/[Aa]lready curated/);
    expect(readFileSync(configPath(), 'utf8')).toBe(after1); // unchanged second time
  });
});

describe('checkCurationOpportunity (S23.3 doctor hint)', () => {
  it('hints for a server with usage and no tools directive when the log env is set', () => {
    const cfg = loadConfig(CONFIG);
    expect(cfg.ok).toBe(true);
    if (!cfg.ok) return;
    const findings = checkCurationOpportunity(cfg.config, 'mcp.config.jsonc', {
      MCPFOLD_AUDIT_LOG: logPath,
    });
    // supabase has recorded run_sql and no directive → hint. github already has a directive → none.
    expect(findings).toHaveLength(1);
    expect(findings[0]!.severity).toBe('info');
    expect(findings[0]!.where).toBe('servers.supabase');
    expect(findings[0]!.fix).toContain('mcpfold curate supabase');
  });

  it('is silent when no audit-log env is set', () => {
    const cfg = loadConfig(CONFIG);
    if (!cfg.ok) return;
    expect(checkCurationOpportunity(cfg.config, 'mcp.config.jsonc', {})).toEqual([]);
  });
});
