import { describe, expect, it } from 'vitest';
import type { ResolvedServer } from '@mcpfold/core';
import {
  cursorAdapter,
  claudeCodeAdapter,
  windsurfAdapter,
  warpAdapter,
  copilotCliAdapter,
  geminiCliAdapter,
  opencodeAdapter,
  type ClientAdapter,
  type OsContext,
} from '@mcpfold/adapters';
import { renderWithStrategy } from '../src/sync/strategy.js';

/**
 * `native-env` secret strategy (S19.4). For a plain `${env:NAME}` ref, each supporting client writes
 * its OWN env placeholder (no `mcpfold run` wrapper) — the value is never resolved or written. Non-env
 * schemes fall back to the shim. Opt-in per profile/server; the default stays each adapter's own.
 */
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

function stdioServer(client: string, tokenRef: string): ResolvedServer {
  return {
    name: 'srv',
    transport: 'stdio',
    command: 'run-srv',
    env: { API_TOKEN: tokenRef },
    tags: [],
    client: client as ResolvedServer['client'],
    scope: 'user',
  };
}

// Each adapter's documented dialect (verified July 2026) → what `${env:MYVAR}` must render to.
const DIALECTS: { adapter: ClientAdapter; native: string }[] = [
  { adapter: cursorAdapter, native: '${env:MYVAR}' },
  { adapter: claudeCodeAdapter, native: '${MYVAR}' },
  { adapter: windsurfAdapter, native: '${env:MYVAR}' },
  { adapter: warpAdapter, native: '${MYVAR}' },
  { adapter: copilotCliAdapter, native: '${MYVAR}' },
  { adapter: geminiCliAdapter, native: '${MYVAR}' },
  { adapter: opencodeAdapter, native: '{env:MYVAR}' },
];

describe('native-env strategy (S19.4)', () => {
  for (const { adapter, native } of DIALECTS) {
    it(`${adapter.id}: renders ${native} for an env ref (no wrapper, no value) and round-trips`, async () => {
      const file = await renderWithStrategy(adapter, [stdioServer(adapter.id, '${env:MYVAR}')], {
        osContext: linux,
        strategyOverride: 'native-env',
      });
      // The client's own placeholder is written verbatim…
      expect(file.contents).toContain(native);
      // …never the mcpfold run shim…
      expect(file.contents).not.toContain('"run"');
      // …and parse reconstructs the canonical `${env:MYVAR}` ref (round-trip).
      const parsed = adapter.parse(file.contents);
      expect(parsed.servers?.srv?.env?.API_TOKEN).toBe('${env:MYVAR}');
    });
  }

  it('declares an interpolation dialect on every supporting adapter', () => {
    for (const { adapter } of DIALECTS) {
      expect(typeof adapter.envInterpolation).toBe('function');
      expect(adapter.envInterpolation!('X')).not.toBe('X'); // it embeds the name in a placeholder
    }
  });

  it('a bearer token folds to a native Authorization header placeholder (cursor)', async () => {
    const remote: ResolvedServer = {
      name: 'gh',
      transport: 'streamable-http',
      url: 'https://api.example.test/mcp',
      auth: { type: 'bearer', token: '${env:GH_PAT}' },
      tags: [],
      client: 'cursor',
      scope: 'user',
    };
    const file = await renderWithStrategy(cursorAdapter, [remote], {
      osContext: linux,
      strategyOverride: 'native-env',
    });
    expect(file.contents).toContain('Bearer ${env:GH_PAT}');
    expect(file.contents).not.toContain('"run"');
  });

  it('falls back to the shim for a NON-env scheme even when native-env is requested', async () => {
    const file = await renderWithStrategy(
      cursorAdapter,
      [stdioServer('cursor', '${infisical:dev/x}')],
      {
        osContext: linux,
        strategyOverride: 'native-env',
      },
    );
    // Can't be resolved by the client → the mcpfold run shim, and no ref on disk.
    expect(file.contents).toContain('mcpfold');
    expect(file.contents).toContain('"run"');
    expect(file.contents).not.toContain('infisical');
  });

  it('a per-SERVER override wins over the profile default', async () => {
    const server = {
      ...stdioServer('cursor', '${env:MYVAR}'),
      secretStrategy: 'native-env' as const,
    };
    // No profile override; the server opts in itself.
    const file = await renderWithStrategy(cursorAdapter, [server], { osContext: linux });
    expect(file.contents).toContain('${env:MYVAR}');
    expect(file.contents).not.toContain('"run"');
  });

  it('default (no override) still shims — no silent behavior change', async () => {
    const file = await renderWithStrategy(cursorAdapter, [stdioServer('cursor', '${env:MYVAR}')], {
      osContext: linux,
    });
    expect(file.contents).toContain('"run"'); // still the shim by default
    expect(file.contents).not.toContain('${env:MYVAR}');
  });
});
