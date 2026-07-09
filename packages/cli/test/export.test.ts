import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { UsageError } from '@mcpfold/core';
import { runExport } from '../src/commands/export.js';
import { runImport } from '../src/commands/import.js';

let cwd: string;

const CONFIG = `{
  "version": 1,
  "servers": {
    "github": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "auth": { "type": "bearer", "token": "\${env:GITHUB_PAT}" },
      "tags": ["work"]
    },
    "vault": {
      "transport": "http",
      "url": "https://vault.example/mcp/",
      "auth": { "type": "bearer", "token": "\${infisical:dev/mcp/VAULT}" },
      "tags": ["work"]
    },
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "env": { "HEADLESS": "true" },
      "tags": ["code"]
    }
  },
  "profiles": {
    "work": { "client": "claude-code", "scope": "user", "include": ["work"] }
  }
}`;

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-exp-'));
  writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
});
afterEach(() => rmSync(cwd, { recursive: true, force: true }));

function read(): { mcpServers: Record<string, Record<string, unknown>> } {
  return JSON.parse(readFileSync(join(cwd, '.mcp.json'), 'utf8'));
}

describe('runExport --mcp-json (S20.1)', () => {
  it('exports every server to a flat .mcp.json by default', () => {
    const { data } = runExport({ cwd });
    expect(data.wrote).toBe(true);
    expect(data.servers).toEqual(['github', 'playwright', 'vault']);
    const out = read();
    expect(Object.keys(out.mcpServers).sort()).toEqual(['github', 'playwright', 'vault']);
    // stdio round-trips structurally.
    expect(out.mcpServers.playwright).toEqual({
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
    });
  });

  it('preserves env refs as ${VAR} interpolation and flags non-env refs', () => {
    const { data } = runExport({ cwd });
    const out = read();
    // ${env:GITHUB_PAT} → ${GITHUB_PAT} inside the bearer Authorization header.
    expect(out.mcpServers.github!.headers).toEqual({
      Authorization: 'Bearer ${GITHUB_PAT}',
    });
    // A non-env scheme cannot be plain env-interpolated → left verbatim AND reported.
    expect(out.mcpServers.vault!.headers).toEqual({
      Authorization: 'Bearer ${infisical:dev/mcp/VAULT}',
    });
    const flagged = data.unresolved.find((u) => u.server === 'vault');
    expect(flagged?.ref).toBe('${infisical:dev/mcp/VAULT}');
    expect(flagged?.location).toBe('auth.token');
  });

  it('--profile restricts export to that profile’s folded server set', () => {
    const { data } = runExport({ cwd, profile: 'work' });
    expect(data.servers).toEqual(['github', 'vault']); // playwright is tagged "code", excluded
    expect(Object.keys(read().mcpServers).sort()).toEqual(['github', 'vault']);
  });

  it('--dry-run writes nothing', () => {
    const { data } = runExport({ cwd, dryRun: true });
    expect(data.wrote).toBe(false);
    expect(existsSync(join(cwd, '.mcp.json'))).toBe(false);
  });

  it('refuses to overwrite an existing file without --force', () => {
    runExport({ cwd });
    expect(() => runExport({ cwd })).toThrow(/already exists/);
    expect(() => runExport({ cwd, force: true })).not.toThrow();
  });

  it('refuses to export onto the canonical filename', () => {
    expect(() => runExport({ cwd, output: 'mcp.config.jsonc' })).toThrow(UsageError);
  });

  it('round-trips: export → import reconstructs the servers', () => {
    runExport({ cwd });
    // Import the .mcp.json we just wrote (no client adapters installed in this empty ctx home).
    const emptyHome = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
    const { data } = runImport({
      cwd,
      force: true,
      osContext: { platform: 'linux', home: emptyHome, env: {} },
    });
    expect(data.sources).toContain('mcp-json');
    expect(data.servers).toEqual(['github', 'playwright', 'vault']);
    rmSync(emptyHome, { recursive: true, force: true });
  });
});
