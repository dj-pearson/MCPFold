import { describe, expect, it } from 'vitest';
import { checkAdapter, type CompatSample, runCompatCheck, shapeOf } from '../compat/check.js';

/**
 * Compat harness self-test (S14.2): a planted upstream format change is flagged, and the
 * source-unavailable path skips cleanly instead of failing falsely.
 */
const RENDERED = JSON.stringify({ mcpServers: { srv: { command: 'npx', args: ['x'] } } });
const sample: CompatSample = {
  client: 'cursor',
  source: { type: 'captured', capturedAt: '2026-07-08' },
  rootKeys: ['mcpServers'],
  serverContainer: 'mcpServers',
  entryKeys: ['command', 'args', 'env', 'url'],
};

describe('compat harness (S14.2)', () => {
  it('a matching captured sample is compatible', () => {
    expect(checkAdapter(RENDERED, sample).status).toBe('ok');
  });

  it('flags a planted upstream change — a renamed server-entry key', () => {
    // The client renamed `command` → `cmd`; the adapter still renders `command`, so it diverges.
    const drifted: CompatSample = { ...sample, entryKeys: ['cmd', 'args', 'env', 'url'] };
    const result = checkAdapter(RENDERED, drifted);
    expect(result.status).toBe('divergent');
    expect(result.divergence.join(' ')).toContain('command');
  });

  it('flags a changed root key', () => {
    const drifted: CompatSample = { ...sample, rootKeys: ['servers'] };
    expect(checkAdapter(RENDERED, drifted).status).toBe('divergent');
  });

  it('skips cleanly when a url format source is unavailable', async () => {
    const urlSample: CompatSample = {
      ...sample,
      source: { type: 'url', url: 'https://example.test/schema', capturedAt: '2026-07-08' },
    };
    const [result] = await runCompatCheck({ cursor: RENDERED }, [urlSample], {
      fetchLatest: () => Promise.resolve(null), // upstream down
    });
    expect(result!.status).toBe('skipped');
    expect(result!.reason).toMatch(/unavailable/);
  });

  it('parses YAML and TOML rendered output by format (S19.2)', () => {
    // Goose renders YAML under `extensions`; the shape check must not JSON.parse it.
    const yamlOut = 'extensions:\n  srv:\n    type: stdio\n    cmd: npx\n    args:\n      - x\n';
    expect(shapeOf(yamlOut, 'extensions', 'yaml')).toEqual({
      rootKeys: ['extensions'],
      entryKeys: ['args', 'cmd', 'type'],
    });
    // Codex renders TOML `[mcp_servers.*]` tables.
    const tomlOut = '[mcp_servers.srv]\ncommand = "npx"\nargs = ["x"]\n';
    expect(shapeOf(tomlOut, 'mcp_servers', 'toml')).toEqual({
      rootKeys: ['mcp_servers'],
      entryKeys: ['args', 'command'],
    });
  });

  it('flags a Goose (YAML) upstream change — renamed extension key', () => {
    const yamlOut = 'extensions:\n  srv:\n    type: stdio\n    cmd: npx\n';
    const sample: CompatSample = {
      client: 'goose',
      source: { type: 'captured', capturedAt: '2026-07-09' },
      format: 'yaml',
      rootKeys: ['extensions'],
      serverContainer: 'extensions',
      entryKeys: ['type', 'command'], // upstream now wants `command`, adapter still emits `cmd`
    };
    const result = checkAdapter(yamlOut, sample);
    expect(result.status).toBe('divergent');
    expect(result.divergence.join(' ')).toContain('cmd');
  });

  it('uses the pulled shape when a url source is available', async () => {
    const urlSample: CompatSample = {
      ...sample,
      source: { type: 'url', url: 'https://example.test/schema', capturedAt: '2026-07-08' },
    };
    const [result] = await runCompatCheck({ cursor: RENDERED }, [urlSample], {
      // Upstream now only accepts a renamed key → the adapter's `command` diverges.
      fetchLatest: () =>
        Promise.resolve({
          rootKeys: ['mcpServers'],
          serverContainer: 'mcpServers',
          entryKeys: ['cmd', 'args'],
        }),
    });
    expect(result!.status).toBe('divergent');
  });
});
