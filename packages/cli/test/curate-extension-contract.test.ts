import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { buildCurateData } from '../src/commands/curate.js';
import { successEnvelope } from '../src/output/envelope.js';

// The VS Code extension is dependency-free and shells out to `mcpfold curate --json`, then parses the
// stdout with these pure functions (no `vscode`, no `child_process` in that module). We load the REAL
// parser from the extension source and feed it the REAL curate envelope in one process — a drift guard
// for S24.3: rename a field in CurateServerReport and this test fails, instead of the CodeLens silently
// degrading to nothing in a shipped extension. The extension package is CJS while this one is NodeNext
// ESM, so a static import trips `verbatimModuleSyntax`; a variable-path dynamic import runs the module
// at runtime (vitest/esbuild resolve it) while tsc treats it as `any` and never typechecks across the
// package boundary.
const EXT_CURATION = '../../../apps/vscode-extension/src/curation.js';
interface CurationParser {
  parseCurateReport: (stdout: string) => Map<string, unknown> | null;
  curatableCount: (report: Map<string, unknown> | null) => number;
  buildCurationLenses: (
    anchors: { name: string; line: number }[],
    report: Map<string, unknown> | null,
  ) => { line: number; title: string; command?: string; args?: unknown[] }[];
}
let ext: CurationParser;
beforeAll(async () => {
  ext = (await import(EXT_CURATION)) as CurationParser;
});

/**
 * S24.3 reconciliation: the extension's "Curate to usage" CodeLens is KEPT, so its parser must track
 * the CLI's real `curate --json` output. This test drives the extension parser against the actual
 * envelope `runCommand` emits (successEnvelope('curate', buildCurateData(...))), not a hand-copied
 * fixture that could drift.
 */

const CONFIG = `{
  "version": 1,
  "servers": {
    "github": {
      "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-github@latest"],
      "tags": ["code"],
      "tools": { "mode": "allow", "list": ["search_code", "create_pr", "delete_repo"] }
    }
  },
  "profiles": { "cursor-user": { "client": "cursor", "scope": "user", "include": ["code"] } }
}`;

function call(server: string, tool: string, outcome: string, ts: string): string {
  return JSON.stringify({ ts, server, type: 'tools/call', tool, outcome });
}

// github's allow-list has 3 tools; only search_code + create_pr are actually used, so the server is
// curatable (unused: delete_repo) — exactly the state the lens exists to surface.
const LOG = [
  call('github', 'search_code', 'ok', '2026-07-10T00:00:00.000Z'),
  call('github', 'create_pr', 'ok', '2026-07-11T00:00:00.000Z'),
].join('\n');

let cwd: string;
let logPath: string;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-curate-contract-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  logPath = join(cwd, 'audit.jsonl');
  writeFileSync(logPath, LOG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

describe('curate --json ↔ VS Code CodeLens contract (S24.3)', () => {
  it('the real curate envelope parses into an actionable lens through the extension parser', () => {
    const data = buildCurateData({ cwd, auditLogPath: logPath });
    // Serialize exactly as the CLI does on the `--json` path, then parse as the extension does.
    const stdout = `${JSON.stringify(successEnvelope('curate', data, []))}\n`;

    const report = ext.parseCurateReport(stdout);
    expect(report).not.toBeNull();
    const github = report!.get('github') as
      { usedCount: number; unusedCount: number; alreadyCurated: boolean } | undefined;
    expect(github).toBeDefined();
    // The parser read the CLI's fields: recommended.list → usedCount, unusedAllowed → unusedCount.
    expect(github!.usedCount).toBe(2);
    expect(github!.unusedCount).toBe(1);
    expect(github!.alreadyCurated).toBe(false);

    expect(ext.curatableCount(report)).toBe(1);
    const lenses = ext.buildCurationLenses([{ name: 'github', line: 3 }], report);
    expect(lenses).toHaveLength(1);
    expect(lenses[0]!.command).toBe('mcpfold.curateServer');
    expect(lenses[0]!.args).toEqual(['github']);
    expect(lenses[0]!.title).toContain('Curate to usage');
  });

  it('an already-curated server yields a non-actionable lens (contract holds both ways)', () => {
    // Tighten the allow-list to exactly what was used: the CLI reports alreadyCurated, and the
    // extension must render the dim confirmation lens with no command.
    writeFileSync(
      join(cwd, 'mcp.config.jsonc'),
      CONFIG.replace('"search_code", "create_pr", "delete_repo"', '"search_code", "create_pr"'),
    );
    const data = buildCurateData({ cwd, auditLogPath: logPath });
    const stdout = `${JSON.stringify(successEnvelope('curate', data, []))}\n`;

    const report = ext.parseCurateReport(stdout);
    expect(ext.curatableCount(report)).toBe(0);
    const lenses = ext.buildCurationLenses([{ name: 'github', line: 3 }], report);
    expect(lenses).toHaveLength(1);
    expect(lenses[0]!.command).toBeUndefined();
    expect(lenses[0]!.title).toContain('curated');
  });
});
