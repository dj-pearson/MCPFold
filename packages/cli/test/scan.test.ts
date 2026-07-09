import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runScan } from '../src/commands/scan.js';
import { EXIT } from '../src/output/exit-codes.js';

const SENTINEL = 'ghp_SUPERSECRETvalue1234567890';

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-scan-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

/** Plant a Windsurf client config at its user-scope path (~/.codeium/windsurf/mcp_config.json). */
function seedWindsurf(mcpServers: Record<string, unknown>): void {
  const dir = join(home, '.codeium', 'windsurf');
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'mcp_config.json'), JSON.stringify({ mcpServers }));
}

const canonical = (text: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), text);

describe('runScan (S18.2)', () => {
  it('finds a plaintext secret and a vulnerable mcp-remote bridge, exit 1', () => {
    seedWindsurf({
      gh: {
        command: 'npx',
        args: ['-y', 'mcp-remote', 'https://api.example/mcp'],
        env: { API_TOKEN: SENTINEL },
      },
    });
    const result = runScan({ cwd, osContext: ctx });

    const secret = result.data.findings.find((f) => f.where?.includes('API_TOKEN'));
    expect(secret?.severity).toBe('error');
    expect(secret?.client).toBe('windsurf');

    const bridge = result.data.findings.find((f) => f.message.includes('mcp-remote'));
    expect(bridge?.severity).toBe('error');
    expect(bridge?.message).toContain('CVE-2025-6514');

    expect(result.exit).toBe(EXIT.DIFF);
    expect(result.data.errorCount).toBeGreaterThanOrEqual(2);
  });

  it('never lets a secret VALUE appear in the output (redactor-enforced)', () => {
    seedWindsurf({
      s: { command: 'my-server', env: { SECRET_KEY: SENTINEL } },
    });
    const result = runScan({ cwd, osContext: ctx });
    // Neither the human text nor the JSON payload may contain the sentinel value.
    expect(result.human).not.toContain(SENTINEL);
    expect(JSON.stringify(result.data)).not.toContain(SENTINEL);
    // But it did detect the hardcoded secret.
    expect(result.data.findings.some((f) => f.where?.includes('SECRET_KEY'))).toBe(true);
  });

  it('flags a bare (unversioned) stdio package, but not a pinned one', () => {
    seedWindsurf({
      bare: { command: 'npx', args: ['-y', '@acme/mcp'] },
      pinned: { command: 'npx', args: ['-y', '@acme/mcp@1.2.3'] },
    });
    const findings = runScan({ cwd, osContext: ctx }).data.findings;
    const bare = findings.find((f) => f.where === 'servers.bare');
    expect(bare?.severity).toBe('warning');
    expect(bare?.message).toContain('unpinned');
    expect(findings.find((f) => f.where === 'servers.pinned')).toBeUndefined();
  });

  it('flags an unpinned @latest stdio package with the pin fix', () => {
    seedWindsurf({ pw: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] } });
    const f = runScan({ cwd, osContext: ctx }).data.findings.find((x) =>
      x.message.includes('@latest'),
    );
    expect(f?.severity).toBe('warning');
    expect(f?.fix).toMatch(/pin/i);
  });

  it('is clean (exit 0) when configs use references and pinned versions', () => {
    seedWindsurf({
      gh: {
        command: 'npx',
        args: ['-y', '@acme/mcp@2.0.0'],
        env: { API_TOKEN: '${env:GH_PAT}' },
      },
    });
    const result = runScan({ cwd, osContext: ctx });
    expect(result.data.errorCount).toBe(0);
    expect(result.data.warningCount).toBe(0);
    expect(result.exit).toBe(EXIT.SUCCESS);
  });

  it('reports nothing to scan when no configs exist', () => {
    const result = runScan({ cwd, osContext: ctx });
    expect(result.data.scanned).toEqual([]);
    expect(result.data.findings).toEqual([]);
    expect(result.exit).toBe(EXIT.SUCCESS);
    expect(result.human).toMatch(/No client configs/);
  });

  it('audits the canonical config too, flagging an uncurated server (info) and a hardcoded token', () => {
    canonical(`{
      "version": 1,
      "servers": {
        "gh": { "transport": "stdio", "command": "x", "args": ["-y", "@acme/mcp@1.0.0"], "env": { "API_KEY": "${SENTINEL}" }, "tags": ["t"] }
      },
      "profiles": {}
    }`);
    const result = runScan({ cwd, osContext: ctx });
    const secret = result.data.findings.find(
      (f) => f.client === 'canonical' && f.where?.includes('API_KEY'),
    );
    expect(secret?.severity).toBe('error');
    const info = result.data.findings.find(
      (f) => f.client === 'canonical' && f.message.includes('no tools directive'),
    );
    expect(info?.severity).toBe('info');
    expect(JSON.stringify(result.data)).not.toContain(SENTINEL);
  });
});

describe('scan --json envelope (S18.2 contract)', () => {
  it('exposes a stable data shape', () => {
    seedWindsurf({ s: { command: 'npx', args: ['-y', '@acme/mcp'] } });
    const { data } = runScan({ cwd, osContext: ctx });
    expect(Object.keys(data).sort()).toEqual([
      'errorCount',
      'findings',
      'infoCount',
      'scanned',
      'warningCount',
    ]);
    for (const f of data.findings) {
      expect(f).toHaveProperty('client');
      expect(f).toHaveProperty('severity');
      expect(f).toHaveProperty('file');
      expect(f).toHaveProperty('message');
      expect(f).toHaveProperty('fix');
    }
  });
});
