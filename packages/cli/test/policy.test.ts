import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runSync } from '../src/commands/sync.js';
import { runAdd } from '../src/commands/add.js';
import { runRun } from '../src/commands/run.js';
import { loadPolicy, machinePolicyPath, policyCandidates } from '../src/util/policy.js';
import type { TrustGate } from '../src/trust/tofu.js';
import { EXIT } from '../src/output/exit-codes.js';

const trustAll: TrustGate = {
  status: () => 'trusted',
  isTrusted: () => true,
  approve: () => {},
  trustedTools: () => undefined,
  toolsStatus: () => 'trusted',
  approveTools: () => {},
};

let cwd: string;
let home: string;
let ctx: OsContext;

const CONFIG = `{
  "version": 1,
  "servers": {
    "fs": { "transport": "stdio", "command": "npx", "args": ["-y", "@modelcontextprotocol/server-filesystem"], "tags": ["all"] },
    "evil": { "transport": "stdio", "command": "npx", "args": ["-y", "@evil/backdoor"], "tags": ["all"] }
  },
  "profiles": {
    "cursor": { "client": "cursor", "scope": "user", "include": ["all"] }
  }
}`;

function writePolicy(body: object): void {
  writeFileSync(join(cwd, 'mcp.policy.jsonc'), JSON.stringify(body));
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-pol-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  ctx = { platform: 'linux', home, env: {} };
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('policy discovery (S18.3)', () => {
  it('finds the project file first, then $MCPFOLD_POLICY, then the machine location', () => {
    const withEnv: OsContext = { ...ctx, env: { MCPFOLD_POLICY: '/tmp/env-policy.jsonc' } };
    const cands = policyCandidates(cwd, withEnv);
    expect(cands[0]).toBe(join(cwd, 'mcp.policy.jsonc'));
    expect(cands).toContain('/tmp/env-policy.jsonc');
    expect(cands[cands.length - 1]).toBe(machinePolicyPath(withEnv));
    // Machine path is OS-specific.
    expect(machinePolicyPath({ ...ctx, platform: 'win32', env: {} })).toMatch(/ProgramData/);
    expect(machinePolicyPath({ ...ctx, platform: 'linux' })).toBe('/etc/mcpfold/mcp.policy.jsonc');
  });

  it('returns null when no policy exists, and throws on an invalid one', () => {
    expect(loadPolicy(cwd, ctx)).toBeNull();
    writeFileSync(join(cwd, 'mcp.policy.jsonc'), '{ "version": 1, "deny": [{}] }'); // rule w/o matcher
    expect(() => loadPolicy(cwd, ctx)).toThrow(/Invalid policy/);
  });
});

describe('sync enforcement (S18.3)', () => {
  it('permissive: strips a denied server from the fold and warns, keeps the rest', async () => {
    writePolicy({ version: 1, mode: 'permissive', deny: [{ namespace: '@evil' }] });
    const res = await runSync({ cwd, osContext: ctx });
    expect(res.data.policyViolations?.map((v) => v.server)).toEqual(['evil']);
    expect(res.warnings?.some((w) => w.includes('evil'))).toBe(true);
    // The written cursor config contains fs but not evil.
    const written = readFileSync(join(home, '.cursor', 'mcp.json'), 'utf8');
    expect(written).toContain('fs');
    expect(written).not.toContain('evil');
  });

  it('strict: refuses to write anything when a server is not allow-listed', async () => {
    writePolicy({ version: 1, mode: 'strict', allow: [{ name: 'fs' }] });
    await expect(runSync({ cwd, osContext: ctx })).rejects.toThrow(/strict.*blocks/i);
    expect(existsSync(join(home, '.cursor', 'mcp.json'))).toBe(false); // nothing written
  });

  it('--check exits DIFF and reports the violation with rule + file provenance', async () => {
    writePolicy({ version: 1, deny: [{ namespace: '@evil', description: 'unreviewed' }] });
    const res = await runSync({ cwd, check: true, osContext: ctx });
    expect(res.exit).toBe(EXIT.DIFF);
    expect(res.human).toContain('Org-policy violations');
    expect(res.human).toContain('unreviewed');
    expect(res.human).toContain('mcp.policy.jsonc'); // provenance: which file
  });
});

describe('add + run enforcement (S18.3)', () => {
  it('add refuses a server the policy denies', async () => {
    writePolicy({ version: 1, deny: [{ namespace: '@evil' }] });
    await expect(
      runAdd({ cwd, name: 'evil2', package: '@evil/another', osContext: ctx }),
    ).rejects.toThrow(/Org policy blocks adding/);
  });

  it('run refuses a denied server — deny wins over local trust', async () => {
    writePolicy({ version: 1, deny: [{ name: 'evil' }] });
    let spawned = false;
    await expect(
      runRun({
        cwd,
        name: 'evil',
        osContext: ctx,
        trust: trustAll, // even fully trusted…
        spawnFn: async () => {
          spawned = true;
          return 0;
        },
      }),
    ).rejects.toThrow(/Refusing to run/);
    expect(spawned).toBe(false); // …the process never launched
  });

  it('run allows a server no policy denies', async () => {
    writePolicy({ version: 1, deny: [{ name: 'evil' }] });
    let spawned = false;
    await runRun({
      cwd,
      name: 'fs',
      osContext: ctx,
      trust: trustAll,
      spawnFn: async () => {
        spawned = true;
        return 0;
      },
    });
    expect(spawned).toBe(true);
  });
});
