import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import type { OsContext } from '@mcpfold/adapters';
import { runImport } from '../src/commands/import.js';

let cwd: string;
let home: string;
let ctx: OsContext;

function plant(relPath: string, contents: string): void {
  const full = join(home, relPath);
  mkdirSync(join(full, '..'), { recursive: true });
  writeFileSync(full, contents);
}

beforeEach(() => {
  cwd = mkdtempSync(join(tmpdir(), 'mcpfold-imp-'));
  home = mkdtempSync(join(tmpdir(), 'mcpfold-home-'));
  ctx = { platform: 'linux', home, env: {} };

  // Cursor: github(url A) + a shared playwright.
  plant(
    '.cursor/mcp.json',
    JSON.stringify({
      mcpServers: {
        github: { url: 'https://a.example/mcp/' },
        playwright: { command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
      },
    }),
  );
  // VS Code: github(url B → conflict), same playwright (dedupe), extra(hardcoded secret).
  plant(
    '.config/Code/User/mcp.json',
    JSON.stringify({
      servers: {
        github: { type: 'http', url: 'https://b.example/mcp/' },
        playwright: { type: 'stdio', command: 'npx', args: ['-y', '@playwright/mcp@latest'] },
        extra: { type: 'stdio', command: 'node', env: { SECRET_KEY: 'plaintext-token-123' } },
      },
    }),
  );
});
afterEach(() => {
  rmSync(cwd, { recursive: true, force: true });
  rmSync(home, { recursive: true, force: true });
});

describe('runImport (S3.3)', () => {
  it('merges cursor + vscode into one valid canonical config', () => {
    const result = runImport({ cwd, osContext: ctx });
    expect(result.data.wrote).toBe(true);
    expect(result.data.sources.sort()).toEqual(['cursor', 'vscode']);
    expect(result.data.servers).toEqual(['extra', 'github', 'playwright']);
    expect(result.data.profiles).toEqual(['cursor', 'vscode']);

    const written = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(loadConfig(written).ok).toBe(true);
  });

  it('dedupes an identical server across clients and unions its tags', () => {
    const { data } = runImport({ cwd, osContext: ctx });
    const written = loadConfig(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8'));
    expect(written.ok).toBe(true);
    if (written.ok) {
      // playwright is identical in both → single entry tagged for both clients.
      expect(written.config.servers.playwright?.tags.sort()).toEqual(['cursor', 'vscode']);
    }
    expect(data.conflicts.find((c) => c.name === 'playwright')).toBeUndefined();
  });

  it('reports a conflict when the same name differs across clients (not silently merged)', () => {
    const { data } = runImport({ cwd, osContext: ctx });
    const conflict = data.conflicts.find((c) => c.name === 'github');
    expect(conflict).toBeDefined();
    expect(conflict?.clients).toContain('cursor');
    expect(conflict?.clients).toContain('vscode');
  });

  it('rewrites a hardcoded secret to an ${env:...} placeholder rather than copying it', () => {
    const { data } = runImport({ cwd, osContext: ctx });
    const flag = data.flagged.find((f) => f.location.includes('SECRET_KEY'));
    expect(flag).toBeDefined();
    const written = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(written).not.toContain('plaintext-token-123');
    expect(written).toContain('${env:EXTRA_SECRET_KEY}');
  });

  it('--dry-run shows the plan and writes nothing', () => {
    const result = runImport({ cwd, dryRun: true, osContext: ctx });
    expect(existsSync(join(cwd, 'mcp.config.jsonc'))).toBe(false);
    expect(result.data.wrote).toBe(false);
    expect(result.human).toContain('Would write');
  });
});

describe('runImport — bare .mcp.json source (S20.1)', () => {
  it('adopts a bare <cwd>/.mcp.json as a first-class source with an mcp-json profile', () => {
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'] },
        },
      }),
    );
    const { data } = runImport({ cwd, osContext: ctx });
    expect(data.sources).toContain('mcp-json');
    expect(data.profiles).toContain('mcp-json');
    expect(data.servers).toContain('fs');

    const written = loadConfig(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8'));
    expect(written.ok).toBe(true);
    if (written.ok) {
      expect(written.config.servers.fs?.tags).toContain('mcp-json');
      expect(written.config.profiles['mcp-json']?.scope).toBe('user');
    }
  });

  it('normalizes ${VAR} env interpolation to a canonical ${env:VAR} ref', () => {
    writeFileSync(
      join(cwd, '.mcp.json'),
      JSON.stringify({
        mcpServers: {
          gh: {
            type: 'http',
            url: 'https://api.githubcopilot.com/mcp/',
            headers: { Authorization: 'Bearer ${GITHUB_PAT}' },
          },
        },
      }),
    );
    const { data } = runImport({ cwd, osContext: ctx });
    expect(data.servers).toContain('gh');
    const written = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(written).toContain('${env:GITHUB_PAT}');
    expect(written).not.toContain('${GITHUB_PAT}');
  });

  it('an unreadable .mcp.json is skipped, not fatal', () => {
    writeFileSync(join(cwd, '.mcp.json'), '{ this is not valid json ');
    const { data } = runImport({ cwd, osContext: ctx });
    expect(data.sources).not.toContain('mcp-json');
    // The adapter sources still import fine.
    expect(data.sources.sort()).toEqual(['cursor', 'vscode']);
  });
});
