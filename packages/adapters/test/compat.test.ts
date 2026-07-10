import { describe, expect, it } from 'vitest';
import {
  checkAdapter,
  checkLive,
  type CompatSample,
  runCompatCheck,
  shapeOf,
} from '../compat/check.js';

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
      remoteEntryKeys: [],
    });
    // Codex renders TOML `[mcp_servers.*]` tables.
    const tomlOut = '[mcp_servers.srv]\ncommand = "npx"\nargs = ["x"]\n';
    expect(shapeOf(tomlOut, 'mcp_servers', 'toml')).toEqual({
      rootKeys: ['mcp_servers'],
      entryKeys: ['args', 'command'],
      remoteEntryKeys: [],
    });
  });

  it('collects remote-entry keys separately from stdio ones (S19.5)', () => {
    const mixed = JSON.stringify({
      mcpServers: {
        local: { command: 'npx', args: ['x'] },
        remote: { httpUrl: 'https://y/mcp', headers: { A: 'b' } },
      },
    });
    const shape = shapeOf(mixed, 'mcpServers');
    expect(shape.entryKeys).toEqual(['args', 'command', 'headers', 'httpUrl']);
    // Only the remote entry's keys — so a value-position change is visible on its own axis.
    expect(shape.remoteEntryKeys).toEqual(['headers', 'httpUrl']);
  });

  it('flags a remote value-position change — Gemini httpUrl → url (S19.5)', () => {
    // The adapter renders `httpUrl`; a client that now wants `url` diverges on the remote axis even
    // though `url` might already be an accepted stdio-era entry key.
    const rendered = JSON.stringify({ mcpServers: { gh: { httpUrl: 'https://y/mcp' } } });
    const drifted: CompatSample = {
      client: 'gemini-cli',
      source: { type: 'captured', capturedAt: '2026-07-09' },
      rootKeys: ['mcpServers'],
      serverContainer: 'mcpServers',
      entryKeys: ['httpUrl', 'url'],
      remoteEntryKeys: ['url'], // upstream now wants `url`, not `httpUrl`
    };
    const result = checkAdapter(rendered, drifted);
    expect(result.status).toBe('divergent');
    expect(result.divergence.join(' ')).toContain('httpUrl');
  });

  it('flags a remote value-position change — Windsurf url → serverUrl (S19.5)', () => {
    const rendered = JSON.stringify({ mcpServers: { gh: { url: 'https://y/mcp' } } });
    const drifted: CompatSample = {
      client: 'windsurf',
      source: { type: 'captured', capturedAt: '2026-07-09' },
      rootKeys: ['mcpServers'],
      serverContainer: 'mcpServers',
      entryKeys: ['url', 'serverUrl'],
      remoteEntryKeys: ['serverUrl'], // Windsurf docs now use `serverUrl`
    };
    const result = checkAdapter(rendered, drifted);
    expect(result.status).toBe('divergent');
    expect(result.divergence.join(' ')).toMatch(/serverUrl|url/);
  });

  it('live check: ok when upstream docs still mention our keys (S19.5)', async () => {
    const rendered = JSON.stringify({ mcpServers: { srv: { command: 'npx' } } });
    const live: CompatSample = { ...sample, liveUrl: 'https://docs.example/mcp' };
    // Doc text still documents `mcpServers`.
    const result = await checkLive(
      rendered,
      live,
      async () => 'Add servers under "mcpServers": { … }',
    );
    expect(result.status).toBe('ok');
  });

  it('live check: divergent when upstream docs drop a rendered key (S19.5)', async () => {
    const rendered = JSON.stringify({ mcpServers: { srv: { command: 'npx' } } });
    const live: CompatSample = { ...sample, liveUrl: 'https://docs.example/mcp' };
    // Upstream renamed the root — the doc no longer mentions `mcpServers`.
    const result = await checkLive(
      rendered,
      live,
      async () => 'Add servers under "servers": { … }',
    );
    expect(result.status).toBe('divergent');
    expect(result.divergence.join(' ')).toContain('mcpServers');
  });

  it('live check: skipped (never false-pass) when the doc is unreachable (S19.5)', async () => {
    const rendered = JSON.stringify({ mcpServers: { srv: { command: 'npx' } } });
    const live: CompatSample = { ...sample, liveUrl: 'https://docs.example/mcp' };
    const result = await checkLive(rendered, live, async () => null); // upstream down
    expect(result.status).toBe('skipped');
    expect(result.reason).toMatch(/unreachable/);
  });

  it('flags a resolved path move (S19.5)', () => {
    const rendered = JSON.stringify({ mcpServers: { srv: { command: 'npx' } } });
    const withPath: CompatSample = {
      ...sample,
      paths: { user: '~/.codeium/windsurf/mcp_config.json' },
    };
    const ok = checkAdapter(rendered, withPath, { user: '~/.codeium/windsurf/mcp_config.json' });
    expect(ok.status).toBe('ok');
    const moved = checkAdapter(rendered, withPath, { user: '~/.devin/mcp.json' });
    expect(moved.status).toBe('divergent');
    expect(moved.divergence.join(' ')).toContain('path moved');
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
