import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { runDoctor } from '../src/commands/doctor.js';
import { checkHardcodedSecrets } from '../src/checks/servers.js';
import { isAutoApplicable, type Finding, type FixAction } from '../src/checks/types.js';

/**
 * S25.1 — the machine-applicable fix model. These assert that the unambiguous doctor findings carry a
 * well-formed `autofix` descriptor, that ambiguous/advisory findings carry none, and that descriptors
 * survive a JSON round-trip (they cross the `doctor --json` boundary).
 */

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-fix-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-fixhome-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const write = (text: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), text);
const findings = () => runDoctor({ cwd, osContext: ctx }).data.findings;
const roundTrips = (a: FixAction | undefined) =>
  expect(JSON.parse(JSON.stringify(a))).toEqual(a);

describe('autofix descriptors (S25.1)', () => {
  it('a hardcoded secret carries an extract-secret descriptor (guided, not auto-applicable)', () => {
    // Tested against the check directly: runDoctor's Redactor (S9.3) masks the ref path in output,
    // which is intended — the raw descriptor is what the S25.3 flow consumes internally.
    const loaded = loadConfig(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_hardcoded123" }, "auth": { "type": "bearer", "headers": { "X-Api-Key": "literal-key" } }, "tags": ["t"] } },
      "profiles": {}
    }`);
    if (!loaded.ok) throw new Error('fixture should be valid');
    const found = checkHardcodedSecrets(loaded.config, 'mcp.config.jsonc');

    const envHit = found.find((f) => f.where?.endsWith('env.API_TOKEN'));
    expect(envHit?.autofix).toEqual({
      kind: 'extract-secret',
      server: 's',
      field: 'env',
      key: 'API_TOKEN',
      suggestedRef: '${env:API_TOKEN}',
    });
    // The suggested ref matches the human fix text — no divergence between the two forms.
    expect(envHit?.fix).toContain('${env:API_TOKEN}');
    expect(isAutoApplicable(envHit!.autofix!)).toBe(false);
    roundTrips(envHit?.autofix);

    // A header secret is located as field 'auth.headers' with a sanitized env name.
    const headerHit = found.find((f) => f.where?.includes('auth.headers'));
    expect(headerHit?.autofix).toMatchObject({
      kind: 'extract-secret',
      server: 's',
      field: 'auth.headers',
      key: 'X-Api-Key',
      suggestedRef: '${env:X_API_KEY}',
    });
  });

  it('the VS Code root-key trap carries a resync-client descriptor (auto-applicable)', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "http", "url": "https://x/mcp", "tags": ["t"] } },
      "profiles": { "vs": { "client": "vscode", "scope": "user", "include": ["t"] } }
    }`);
    const vscodeDir = join(home, '.config', 'Code', 'User');
    mkdirSync(vscodeDir, { recursive: true });
    writeFileSync(join(vscodeDir, 'mcp.json'), '{"mcpServers":{"s":{"url":"https://x/mcp"}}}');

    const f = findings().find((x) => x.message.includes('mcpServers'));
    expect(f?.autofix).toMatchObject({ kind: 'resync-client', profile: 'vs', client: 'vscode' });
    // The descriptor's path matches the finding's file — the engine repairs exactly this file.
    expect((f?.autofix as { path: string }).path).toBe(f?.file);
    expect(isAutoApplicable(f!.autofix!)).toBe(true);
    roundTrips(f?.autofix);
  });

  it('an unpinned mcp-remote bridge carries a resync-client descriptor', () => {
    write(`{
      "version": 1,
      "servers": { "gh": { "transport": "http", "url": "https://x/mcp", "auth": { "type": "bearer", "token": "\${env:T}" }, "tags": ["t"] } },
      "profiles": { "ws": { "client": "windsurf", "scope": "user", "include": ["t"] } }
    }`);
    const wsDir = join(home, '.codeium', 'windsurf');
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, 'mcp_config.json'),
      JSON.stringify({
        mcpServers: { gh: { command: 'npx', args: ['-y', 'mcp-remote', 'https://x/mcp'] } },
      }),
    );
    const f = findings().find((x) => x.message.includes('mcp-remote'));
    expect(f?.autofix?.kind).toBe('resync-client');
    expect((f?.autofix as { profile: string }).profile).toBe('ws');
    expect((f?.autofix as { path: string }).path).toBe(f?.file);
    roundTrips(f?.autofix);
  });

  it('inert curation (server bypasses the shim) carries a resync-client descriptor', () => {
    write(`{
      "version": 1,
      "servers": {
        "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["code"] }
      },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(
      join(home, '.cursor', 'mcp.json'),
      JSON.stringify({ mcpServers: { pw: { command: 'npx', args: ['-y', '@playwright/mcp@1.4.2'] } } }),
    );
    const f = findings().find((x) => x.where === 'mcpServers.pw');
    expect(f?.autofix).toMatchObject({ kind: 'resync-client', profile: 'cursor', client: 'cursor' });
    expect((f?.autofix as { path: string }).path).toBe(f?.file);
    roundTrips(f?.autofix);
  });

  it('an invalid client JSON file carries a resync-client descriptor', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "http", "url": "https://x/mcp", "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    mkdirSync(join(home, '.cursor'), { recursive: true });
    writeFileSync(join(home, '.cursor', 'mcp.json'), '{ not json');
    const f = findings().find((x) => x.message.includes('not valid JSON'));
    expect(f?.autofix?.kind).toBe('resync-client');
    expect((f?.autofix as { path: string }).path).toBe(f?.file);
  });

  it('the deprecated sse transport carries a guided rewrite-transport descriptor (not auto-applicable)', () => {
    write(`{
      "version": 2,
      "servers": { "old": { "transport": "sse", "url": "https://x/sse", "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const f = findings().find((x) => x.where === 'servers.old');
    expect(f?.autofix).toEqual({
      kind: 'rewrite-transport',
      server: 'old',
      from: 'sse',
      to: 'streamable-http',
    });
    expect(isAutoApplicable(f!.autofix!)).toBe(false);
    roundTrips(f?.autofix);
  });

  it('advisory findings carry no autofix (unpinned @latest, unknown scheme, info nudges)', () => {
    write(`{
      "version": 2,
      "servers": {
        "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["t"] },
        "vault": { "transport": "streamable-http", "url": "https://y/mcp", "auth": { "type": "bearer", "token": "\${vault:secret/x}" }, "tags": ["t"] }
      },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const all = findings();
    const advisory = (pred: (f: Finding) => boolean) => all.find(pred);

    // Pinning @latest needs a network version resolve — neither deterministic nor offline — so no autofix.
    expect(advisory((f) => f.message.includes('@latest'))?.autofix).toBeUndefined();
    expect(advisory((f) => f.message.includes('scheme'))?.autofix).toBeUndefined();
    // Every info-severity finding is advisory-only.
    expect(all.filter((f) => f.severity === 'info').every((f) => f.autofix === undefined)).toBe(true);
  });

  it('a clean config yields no autofix descriptors at all', () => {
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["code"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    expect(findings().every((f) => f.autofix === undefined)).toBe(true);
  });
});
