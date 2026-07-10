import { describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { detectClients, type DetectProbe } from '../src/util/detect-clients.js';

/**
 * Client detection is driven off `ALL_ADAPTERS`, so every registered adapter — including the
 * wave-2 clients (S19.2) — is probed automatically. S19.3 adds a three-way state (configured /
 * installed-only / not-found) via injectable OS probes, tested here without real I/O.
 */
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

/** A probe where nothing exists and no binary is on PATH. */
const emptyProbe: DetectProbe = {
  fileExists: () => false,
  binOnPath: () => false,
  dirHasPrefix: () => false,
};

describe('detectClients (S19.2 + S19.3)', () => {
  it('probes all eighteen adapters', () => {
    expect(detectClients(linux, emptyProbe)).toHaveLength(18);
  });

  it('picks up the wave-2 clients with resolvable paths', () => {
    const byId = new Map(detectClients(linux, emptyProbe).map((c) => [c.id, c]));
    expect(byId.get('goose')?.path).toBe('/home/dev/.config/goose/config.yaml');
    expect(byId.get('codex-cli')?.path).toBe('/home/dev/.codex/config.toml');
    expect(byId.get('lm-studio')?.path).toBe('/home/dev/.lmstudio/mcp.json');
    expect(byId.get('warp')?.path).toBe('/home/dev/.warp/.mcp.json');
    expect(byId.get('opencode')?.path).toBe('/home/dev/.config/opencode/opencode.json');
    expect(byId.get('copilot-cli')?.path).toBe('/home/dev/.copilot/mcp-config.json');
  });

  it('reports not-found when neither config nor app is present', () => {
    for (const c of detectClients(linux, emptyProbe)) {
      expect(c.state).toBe('not-found');
      expect(c.installed).toBe(false);
      expect(c.appPresent).toBe(false);
    }
  });

  it('reports configured when the MCP config file exists', () => {
    const cursorPath = '/home/dev/.cursor/mcp.json';
    const probe: DetectProbe = { ...emptyProbe, fileExists: (p) => p === cursorPath };
    const cursor = detectClients(linux, probe).find((c) => c.id === 'cursor')!;
    expect(cursor.state).toBe('configured');
    expect(cursor.installed).toBe(true); // legacy field preserved
  });

  it('reports installed-only when the app is present but unconfigured (bin on PATH)', () => {
    // `gemini` on PATH, but no ~/.gemini/settings.json.
    const probe: DetectProbe = { ...emptyProbe, binOnPath: (name) => name === 'gemini' };
    const gemini = detectClients(linux, probe).find((c) => c.id === 'gemini-cli')!;
    expect(gemini.state).toBe('installed-only');
    expect(gemini.installed).toBe(false); // not configured
    expect(gemini.appPresent).toBe(true);
  });

  it('reports installed-only for an extension client via its extensions dir', () => {
    // Roo Code's extension folder present under the VS Code host, but no MCP config.
    const probe: DetectProbe = {
      ...emptyProbe,
      dirHasPrefix: (dir, prefix) =>
        dir === '/home/dev/.vscode/extensions' && prefix === 'rooveterinaryinc.roo-cline-',
    };
    const roo = detectClients(linux, probe).find((c) => c.id === 'roo-code')!;
    expect(roo.state).toBe('installed-only');
    expect(roo.appPresent).toBe(true);
  });

  it('honors MCPFOLD_NO_APP_DETECTION=1 — config-only, deterministic (S19.3)', () => {
    const ctx: OsContext = { ...linux, env: { MCPFOLD_NO_APP_DETECTION: '1' } };
    // Even with every app signal hitting, app-presence is forced off → no installed-only noise.
    const probe: DetectProbe = {
      fileExists: () => false,
      binOnPath: () => true,
      dirHasPrefix: () => true,
    };
    for (const c of detectClients(ctx, probe)) {
      expect(c.appPresent).toBe(false);
      expect(c.state).toBe('not-found');
    }
  });

  it('prefers configured over installed-only when both signals hit', () => {
    const cursorPath = '/home/dev/.cursor/mcp.json';
    const probe: DetectProbe = {
      ...emptyProbe,
      fileExists: (p) => p === cursorPath,
      binOnPath: (name) => name === 'cursor',
    };
    const cursor = detectClients(linux, probe).find((c) => c.id === 'cursor')!;
    expect(cursor.state).toBe('configured');
    expect(cursor.appPresent).toBe(true);
  });
});
