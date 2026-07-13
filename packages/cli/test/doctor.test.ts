import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { runDoctor } from '../src/commands/doctor.js';
import { EXIT } from '../src/output/exit-codes.js';

let cwd: string;
let home: string;
let ctx: OsContext;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-doc-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  ctx = { platform: 'linux', home, env: {} };
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

const write = (text: string) => writeFileSync(join(cwd, 'mcp.config.jsonc'), text);

describe('runDoctor (S3.7)', () => {
  it('a clean, curated config passes with no findings, exit 0', () => {
    // Curated (a `tools` directive present) so the S24.5 "no curation configured" info does not fire.
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["code"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    // The only finding is the S24.8 audit-trail disclosure (an info, so exit stays 0).
    expect(result.data.findings.filter((f) => f.severity !== 'info')).toEqual([]);
    expect(result.data.findings.every((f) => f.severity === 'info')).toBe(true);
    expect(result.exit).toBe(EXIT.SUCCESS);
  });

  it('discloses the default-on local audit trail as an info (S24.8)', () => {
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "s", "tags": ["c"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["c"] } }
    }`);
    const on = runDoctor({ cwd, osContext: ctx });
    const info = on.data.findings.find((f) => f.message.includes('Local audit trail is on'));
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('never leaves this machine');

    // Opting out flips the disclosure and does not change the exit code.
    const off = runDoctor({ cwd, osContext: { ...ctx, env: { MCPFOLD_NO_AUDIT: '1' } } });
    expect(off.data.findings.some((f) => f.message.includes('Local audit trail is off'))).toBe(
      true,
    );
    expect(off.exit).toBe(EXIT.SUCCESS);
  });

  it('warns about the deprecated sse transport, but not about an oauth server (S17.5)', () => {
    write(`{
      "version": 2,
      "servers": {
        "old": { "transport": "sse", "url": "https://x/sse", "tags": [] },
        "modern": { "transport": "streamable-http", "url": "https://y/mcp", "auth": { "type": "oauth" }, "tags": [] }
      },
      "profiles": {}
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    const sse = result.data.findings.find((f) => f.where === 'servers.old');
    expect(sse?.severity).toBe('warning');
    expect(sse?.message).toContain('deprecated');
    // The oauth server carries no token/headers and must NOT trip any secret/token finding.
    expect(result.data.findings.some((f) => f.where === 'servers.modern')).toBe(false);
  });

  describe('inert-curation detection (S24.5)', () => {
    // A curated stdio server whose profile folds to Cursor.
    const CURATED = `{
      "version": 1,
      "servers": {
        "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["code"] }
      },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`;
    const cursorFile = () => join(home, '.cursor', 'mcp.json');
    const writeCursor = (pw: unknown) => {
      mkdirSync(join(home, '.cursor'), { recursive: true });
      writeFileSync(cursorFile(), JSON.stringify({ mcpServers: { pw } }));
    };

    it('errors when a curated server routes to its real command in a client file (stale/hand-edited)', () => {
      write(CURATED);
      // A stale client file: pw wired straight at its command, bypassing the proxy.
      writeCursor({ command: 'npx', args: ['-y', '@playwright/mcp@1.4.2'] });
      const result = runDoctor({ cwd, osContext: ctx });
      const finding = result.data.findings.find((f) => f.where === 'mcpServers.pw');
      expect(finding?.severity).toBe('error');
      expect(finding?.message).toContain('bypassing the mcpfold proxy');
      expect(finding?.fix).toContain('mcpfold sync');
      expect(result.exit).toBe(EXIT.ERROR);
    });

    it('is clean when the curated server routes through the run shim', () => {
      write(CURATED);
      writeCursor({ command: 'mcpfold', args: ['run', 'pw', '--cwd', cwd] });
      const result = runDoctor({ cwd, osContext: ctx });
      expect(result.data.findings.some((f) => f.where === 'mcpServers.pw')).toBe(false);
      expect(result.exit).toBe(EXIT.SUCCESS);
    });

    it('emits an info when no server carries a tools directive at all', () => {
      write(`{
        "version": 1,
        "servers": {
          "a": { "transport": "stdio", "command": "s", "tags": ["t"] },
          "b": { "transport": "stdio", "command": "s2", "tags": ["t"] }
        },
        "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
      }`);
      const result = runDoctor({ cwd, osContext: ctx });
      const info = result.data.findings.find((f) =>
        f.message.includes('No tool curation configured'),
      );
      expect(info?.severity).toBe('info');
      expect(info?.message).toContain('all 2 servers');
      expect(info?.fix).toContain('mcpfold curate');
      // Info only — it must never fail a doctor-gated pipeline.
      expect(result.exit).toBe(EXIT.SUCCESS);
    });
  });

  it('flags an allow-list that predates new upstream tools (S24.11)', () => {
    write(`{
      "version": 1,
      "servers": {
        "gh": { "transport": "stdio", "command": "s", "tags": ["c"], "tools": { "mode": "allow", "list": ["a"] } }
      },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["c"] } }
    }`);
    // A discovery snapshot in the ctx-scoped cache showing a tool "b" the allow-list omits.
    const dir = join(home, '.config', 'mcpfold', 'discovery');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, 'gh.json'),
      JSON.stringify({
        server: 'gh',
        tools: [
          { name: 'a', tokens: 10 },
          { name: 'b', tokens: 10 },
        ],
      }),
    );
    const result = runDoctor({ cwd, osContext: ctx });
    const info = result.data.findings.find((f) => f.message.includes('new tool'));
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('b');
    expect(info?.fix).toContain('curate gh --refresh');
    expect(result.exit).toBe(EXIT.SUCCESS); // info only
  });

  it('explains the native-env → shim fallback for a non-env scheme (S19.4)', () => {
    write(`{
      "version": 2,
      "servers": {
        "envsrv": { "transport": "stdio", "command": "s", "env": { "T": "\${env:TOKEN}" }, "tags": ["all"] },
        "vaultsrv": { "transport": "stdio", "command": "s", "env": { "T": "\${infisical:dev/x}" }, "tags": ["all"] }
      },
      "profiles": {
        "cursor": { "client": "cursor", "scope": "user", "include": ["all"], "secretStrategy": "native-env" }
      }
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    // The env-only server needs no explanation; the infisical one is flagged as a shim fallback.
    const info = result.data.findings.find((f) => f.message.includes('native-env'));
    expect(info?.severity).toBe('info');
    expect(info?.message).toContain('shim');
    expect(result.data.findings.some((f) => f.where?.includes('envsrv'))).toBe(false);
  });

  it('does NOT warn about a remote tools directive — remote curation is enforced via the bridge (S24.10)', () => {
    write(`{
      "version": 2,
      "servers": {
        "gh": { "transport": "streamable-http", "url": "https://x/mcp", "tools": { "mode": "allow", "list": ["search_code"] }, "tags": ["t"] },
        "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tools": { "mode": "allow", "list": ["browser_click"] }, "tags": ["t"] }
      },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    // Both directives are enforced now (stdio directly, remote via the mcp-remote bridge proxy) — no
    // "unenforced tools directive" warning for either.
    expect(result.data.findings.some((x) => x.where === 'servers.gh.tools')).toBe(false);
    expect(result.data.findings.some((x) => x.where === 'servers.pw.tools')).toBe(false);
  });

  it('reports pathed errors for an invalid config (exit 2)', () => {
    // An invalid transport → a real schema error (v2 accepts stdio/streamable-http/sse only).
    write(
      `{ "version": 2, "servers": { "x": { "transport": "ftp", "url": "https://x" } }, "profiles": {} }`,
    );
    const result = runDoctor({ cwd, osContext: ctx });
    expect(result.exit).toBe(EXIT.ERROR);
    expect(result.data.errorCount).toBeGreaterThan(0);
  });

  it('flags an unpinned @latest stdio server with the pin fix', () => {
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@latest"], "tags": ["code"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    const f = runDoctor({ cwd, osContext: ctx }).data.findings.find((x) =>
      x.message.includes('@latest'),
    );
    expect(f?.severity).toBe('warning');
    expect(f?.fix).toContain('pin');
  });

  it('flags a hardcoded secret in env (exit 2) with an ${env:} fix', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "stdio", "command": "x", "env": { "API_TOKEN": "ghp_hardcoded123" }, "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    const f = result.data.findings.find((x) => x.where?.includes('API_TOKEN'));
    expect(f?.severity).toBe('error');
    expect(f?.fix).toContain('${env:');
    expect(result.exit).toBe(EXIT.ERROR);
  });

  it('flags an unknown secret-provider scheme', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "http", "url": "https://x/mcp", "auth": { "type": "bearer", "token": "\${vault:secret/x}" }, "tags": ["t"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["t"] } }
    }`);
    const f = runDoctor({ cwd, osContext: ctx }).data.findings.find((x) =>
      x.message.includes('scheme'),
    );
    expect(f?.message).toContain('vault');
  });

  it('flags a VS Code file that uses mcpServers instead of servers', () => {
    write(`{
      "version": 1,
      "servers": { "s": { "transport": "http", "url": "https://x/mcp", "tags": ["t"] } },
      "profiles": { "vs": { "client": "vscode", "scope": "user", "include": ["t"] } }
    }`);
    // Plant a wrong-root-key VS Code file at its user path.
    const vscodeDir = join(home, '.config', 'Code', 'User');
    mkdirSync(vscodeDir, { recursive: true });
    writeFileSync(join(vscodeDir, 'mcp.json'), '{"mcpServers":{"s":{"url":"https://x/mcp"}}}');

    const f = runDoctor({ cwd, osContext: ctx }).data.findings.find((x) =>
      x.message.includes('servers'),
    );
    expect(f?.severity).toBe('error');
    expect(f?.fix).toContain('"servers"');
  });

  it('flags an unpinned mcp-remote bridge in a client config (S17.1, CVE-2025-6514)', () => {
    write(`{
      "version": 1,
      "servers": { "gh": { "transport": "http", "url": "https://x/mcp", "auth": { "type": "bearer", "token": "\${env:T}" }, "tags": ["t"] } },
      "profiles": { "ws": { "client": "windsurf", "scope": "user", "include": ["t"] } }
    }`);
    // Plant a Windsurf config that launches an UNPINNED mcp-remote (the pre-S17.1 shape).
    const wsDir = join(home, '.codeium', 'windsurf');
    mkdirSync(wsDir, { recursive: true });
    writeFileSync(
      join(wsDir, 'mcp_config.json'),
      JSON.stringify({
        mcpServers: { gh: { command: 'npx', args: ['-y', 'mcp-remote', 'https://x/mcp'] } },
      }),
    );

    const f = runDoctor({ cwd, osContext: ctx }).data.findings.find((x) =>
      x.message.includes('mcp-remote'),
    );
    expect(f?.severity).toBe('warning');
    expect(f?.message).toContain('CVE-2025-6514');
    expect(f?.fix).toContain('mcp-remote@');
  });

  it('does NOT flag a client config whose mcp-remote is pinned to a safe version', () => {
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
        mcpServers: { gh: { command: 'npx', args: ['-y', 'mcp-remote@0.1.38', 'https://x/mcp'] } },
      }),
    );

    const findings = runDoctor({ cwd, osContext: ctx }).data.findings.filter((x) =>
      x.message.includes('mcp-remote'),
    );
    expect(findings).toEqual([]);
  });
});
