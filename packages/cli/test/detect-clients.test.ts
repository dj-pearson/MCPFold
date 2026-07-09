import { describe, expect, it } from 'vitest';
import type { OsContext } from '@mcpfold/adapters';
import { detectClients } from '../src/util/detect-clients.js';

/**
 * Client detection is driven off `ALL_ADAPTERS`, so every registered adapter — including the
 * wave-2 clients (S19.2) — is probed for its user-scope config path automatically. This locks
 * that the six new clients are detected with a resolvable, per-OS path.
 */
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

describe('detectClients (S19.2)', () => {
  it('probes all eighteen adapters', () => {
    expect(detectClients(linux)).toHaveLength(18);
  });

  it('picks up the wave-2 clients with resolvable paths', () => {
    const byId = new Map(detectClients(linux).map((c) => [c.id, c]));
    expect(byId.get('goose')?.path).toBe('/home/dev/.config/goose/config.yaml');
    expect(byId.get('codex-cli')?.path).toBe('/home/dev/.codex/config.toml');
    expect(byId.get('lm-studio')?.path).toBe('/home/dev/.lmstudio/mcp.json');
    expect(byId.get('warp')?.path).toBe('/home/dev/.warp/.mcp.json');
    expect(byId.get('opencode')?.path).toBe('/home/dev/.config/opencode/opencode.json');
    expect(byId.get('copilot-cli')?.path).toBe('/home/dev/.copilot/mcp-config.json');
  });
});
