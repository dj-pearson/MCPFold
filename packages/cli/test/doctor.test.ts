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
  it('a clean config passes with no findings, exit 0', () => {
    write(`{
      "version": 1,
      "servers": { "pw": { "transport": "stdio", "command": "npx", "args": ["-y", "@playwright/mcp@1.4.2"], "tags": ["code"] } },
      "profiles": { "cursor": { "client": "cursor", "scope": "user", "include": ["code"] } }
    }`);
    const result = runDoctor({ cwd, osContext: ctx });
    expect(result.data.findings).toEqual([]);
    expect(result.exit).toBe(EXIT.SUCCESS);
  });

  it('reports pathed errors for an invalid config (exit 2)', () => {
    write(`{ "version": 2, "servers": {}, "profiles": {} }`);
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
});
