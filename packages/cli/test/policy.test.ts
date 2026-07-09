import { mkdtempSync, writeFileSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { isMcpfoldError } from '@mcpfold/core';
import { envProvider } from '@mcpfold/secrets';
import { discoverPolicy, machinePolicyPath, policySearchPaths } from '../src/policy/discover.js';
import { runSync } from '../src/commands/sync.js';
import { runAdd } from '../src/commands/add.js';
import { runRun, type Spawner } from '../src/commands/run.js';
import { runScan } from '../src/commands/scan.js';
import { EXIT } from '../src/output/exit-codes.js';

const trustAll = {
  status: () => 'trusted' as const,
  isTrusted: () => true,
  approve: () => {},
  trustedTools: () => undefined,
  toolsStatus: () => 'unpinned' as const,
  approveTools: () => {},
};

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-pol-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const writeConfig = (text: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), text);
const writePolicy = (policy: unknown) =>
  writeFileSync(join(cwd, 'mcp.policy.json'), JSON.stringify(policy));

const DENYING_POLICY = {
  version: 1,
  deny: [{ match: 'namespace', pattern: '@evilcorp', reason: 'unvetted vendor' }],
};

const EVIL_CONFIG = `{
  "version": 1,
  "servers": {
    "evil": { "transport": "stdio", "command": "npx", "args": ["-y", "@evilcorp/mcp@1.0.0"], "tags": ["t"] },
    "ok": { "transport": "stdio", "command": "npx", "args": ["-y", "@good/mcp@1.0.0"], "tags": ["t"] }
  },
  "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
}`;

describe('policy discovery (S18.3)', () => {
  it('resolves the per-OS machine path and search order', () => {
    expect(machinePolicyPath({ platform: 'linux', home, env: {} })).toBe(
      '/etc/mcpfold/policy.json',
    );
    expect(machinePolicyPath({ platform: 'darwin', home, env: {} })).toBe(
      '/Library/Application Support/mcpfold/policy.json',
    );
    expect(machinePolicyPath({ platform: 'win32', home, env: { PROGRAMDATA: 'D:\\PD' } })).toBe(
      join('D:\\PD', 'mcpfold', 'policy.json'),
    );
    // Project file is probed before MCPFOLD_POLICY, which is before the machine location.
    const order = policySearchPaths(cwd, {
      platform: 'linux',
      home,
      env: { MCPFOLD_POLICY: '/x/p.json' },
    });
    expect(order[0]).toBe(join(cwd, 'mcp.policy.jsonc'));
    expect(order).toContain('/x/p.json');
    expect(order[order.length - 1]).toBe('/etc/mcpfold/policy.json');
  });

  it('loads the project policy and reports a parse error clearly', () => {
    writePolicy(DENYING_POLICY);
    const ok = discoverPolicy(cwd, ctx);
    expect(ok.loaded?.policy.deny[0]!.pattern).toBe('@evilcorp');
    writeFileSync(join(cwd, 'mcp.policy.json'), '{ bad');
    expect(discoverPolicy(cwd, ctx).error).toMatch(/Invalid org policy/);
  });
});

describe('policy enforcement across commands (S18.3)', () => {
  it('sync refuses to fold a denied server (deny wins), naming the rule', async () => {
    writeConfig(EVIL_CONFIG);
    writePolicy(DENYING_POLICY);
    await expect(runSync({ cwd, osContext: ctx })).rejects.toSatisfy(
      (e) => isMcpfoldError(e) && /blocked by org policy/i.test(e.message),
    );
  });

  it('sync --strip-denied folds the permitted servers, warns, and omits the denied one', async () => {
    writeConfig(EVIL_CONFIG);
    writePolicy(DENYING_POLICY);
    const out = await runSync({ cwd, osContext: ctx, stripDenied: true });
    expect(out.warnings?.some((w) => /policy.*evil/i.test(w))).toBe(true);
    const written = out.data.results.find((r) => r.action === 'written');
    const rendered = readFileSync(written!.path, 'utf8');
    expect(rendered).toContain('ok');
    expect(rendered).not.toContain('evilcorp');
  });

  it('sync --check fails (exit 1) on a violation instead of throwing', async () => {
    writeConfig(EVIL_CONFIG);
    writePolicy(DENYING_POLICY);
    const out = await runSync({ cwd, osContext: ctx, check: true });
    expect(out.exit).toBe(EXIT.DIFF);
    expect(out.warnings?.some((w) => /policy/i.test(w))).toBe(true);
  });

  it('add refuses to add a denied server', async () => {
    writeConfig(`{ "version": 1, "servers": {}, "profiles": {} }`);
    writePolicy(DENYING_POLICY);
    await expect(
      runAdd({ cwd, name: 'evil', package: '@evilcorp/mcp@1.0.0', osContext: ctx }),
    ).rejects.toSatisfy((e) => isMcpfoldError(e) && /blocked by org policy/i.test(e.message));
  });

  it('run refuses to launch a denied server, before the trust gate', async () => {
    writeConfig(EVIL_CONFIG);
    writePolicy(DENYING_POLICY);
    const spawnFn: Spawner = async () => 0;
    await expect(
      runRun({
        cwd,
        name: 'evil',
        providers: [envProvider({})],
        spawnFn,
        trust: trustAll,
        osContext: ctx,
      }),
    ).rejects.toSatisfy((e) => isMcpfoldError(e) && /blocked by org policy/i.test(e.message));
  });

  it('scan reports a policy violation on the canonical config with provenance', async () => {
    writeConfig(EVIL_CONFIG);
    writePolicy(DENYING_POLICY);
    const result = runScan({ cwd, osContext: ctx });
    const violation = result.data.findings.find(
      (f) => f.client === 'canonical' && /blocked by org policy/i.test(f.message),
    );
    expect(violation?.severity).toBe('error');
    expect(violation?.fix).toMatch(/Governed by/);
  });

  it('no policy present → commands behave normally', async () => {
    writeConfig(EVIL_CONFIG);
    const out = await runSync({ cwd, osContext: ctx });
    expect(out.data.results.length).toBeGreaterThan(0);
  });
});
