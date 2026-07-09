import { describe, expect, it } from 'vitest';
import type { ResolvedServer } from '@mcpfold/core';
import { createMcpServersAdapter, remoteNeedsShim } from '../src/shared.js';
import { ALL_ADAPTERS } from '../src/all.js';
import { claudeCodeAdapter } from '../src/claude-code.js';
import { claudeDesktopAdapter } from '../src/claude-desktop.js';
import { cursorAdapter } from '../src/cursor.js';
import { vscodeAdapter } from '../src/vscode.js';
import { windsurfAdapter } from '../src/windsurf.js';
import type { ClientAdapter, OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

function authedRemote(client: ResolvedServer['client']): ResolvedServer {
  return {
    name: 'github',
    transport: 'streamable-http',
    url: 'https://api.githubcopilot.com/mcp/',
    auth: { type: 'bearer', token: '${infisical:dev/mcp/GITHUB_PAT}' },
    tags: [],
    client,
    scope: 'user',
  };
}

function unauthedRemote(client: ResolvedServer['client']): ResolvedServer {
  return {
    name: 'open',
    transport: 'streamable-http',
    url: 'https://open.example/mcp/',
    tags: [],
    client,
    scope: 'user',
  };
}

/** Does a rendered entry use the pinned mcp-remote shim? */
function isShim(contents: string, name: string): boolean {
  const json = JSON.parse(contents) as Record<
    string,
    Record<string, { command?: string; args?: string[] }>
  >;
  const container = json.mcpServers ?? json.servers ?? json.context_servers ?? {};
  const entry = container[name];
  return entry?.command === 'npx' && Boolean(entry.args?.some((a) => a.startsWith('mcp-remote@')));
}

describe('remote capability metadata (S17.2)', () => {
  it('every adapter declares a remote capability with a coherent field shape', () => {
    for (const adapter of ALL_ADAPTERS) {
      expect(adapter.remote).toBeDefined();
      expect(['url', 'type+url', 'httpUrl', 'shim']).toContain(adapter.remote.fieldShape);
      // A client that can't reach remotes at all can't authenticate one either.
      if (!adapter.remote.nativeHttp) expect(adapter.remote.nativeOauth).toBe(false);
    }
  });

  it('only the stdio-only / header-less clients need the shim for an authed remote', () => {
    const needShim = ALL_ADAPTERS.filter((a) => remoteNeedsShim(a.remote, authedRemote(a.id)))
      .map((a) => a.id)
      .sort();
    // Claude Desktop (no native remote) + Windsurf (no auth on native remote).
    expect(needShim).toEqual(['claude-desktop', 'windsurf']);
  });
});

describe('capability drives native vs shim folding (S17.2)', () => {
  it('an authed remote folds native on Claude Code / Cursor / VS Code, shim on Windsurf / Claude Desktop', () => {
    // Native: no mcp-remote wrapper; the client-native remote fields are present.
    const cc = claudeCodeAdapter.render([authedRemote('claude-code')], linux).contents;
    expect(isShim(cc, 'github')).toBe(false);
    expect(cc).toContain('"type": "http"');

    const cur = cursorAdapter.render([authedRemote('cursor')], linux).contents;
    expect(isShim(cur, 'github')).toBe(false);
    expect(cur).toContain('api.githubcopilot.com');

    const vs = vscodeAdapter.render([authedRemote('vscode')], linux).contents;
    expect(isShim(vs, 'github')).toBe(false);

    // Shim: pinned mcp-remote stdio launch carrying the auth header.
    const win = windsurfAdapter.render([authedRemote('windsurf')], linux).contents;
    expect(isShim(win, 'github')).toBe(true);
    expect(win).toContain('--header');

    const cd = claudeDesktopAdapter.render([authedRemote('claude-desktop')], linux).contents;
    expect(isShim(cd, 'github')).toBe(true);
  });

  it('Claude Desktop shims even an UNauthenticated remote (config is stdio-only)', () => {
    const cd = claudeDesktopAdapter.render([unauthedRemote('claude-desktop')], linux).contents;
    expect(isShim(cd, 'open')).toBe(true);
  });

  it('Windsurf folds an UNauthenticated remote natively (native http, no auth needed)', () => {
    const win = windsurfAdapter.render([unauthedRemote('windsurf')], linux).contents;
    expect(isShim(win, 'open')).toBe(false);
    expect(win).toContain('open.example');
  });

  it('overriding the capability flips the rendered form', () => {
    // A cursor-shaped adapter, but declared unable to reach remotes → the same server shims.
    const crippled: ClientAdapter = createMcpServersAdapter({
      id: 'cursor',
      remote: { nativeHttp: false, nativeOauth: false, fieldShape: 'shim' },
      resolvePath: () => '/tmp/x.json',
    });
    const native = cursorAdapter.render([authedRemote('cursor')], linux).contents;
    const shimmed = crippled.render([authedRemote('cursor')], linux).contents;
    expect(isShim(native, 'github')).toBe(false);
    expect(isShim(shimmed, 'github')).toBe(true);
  });

  it('a shimmed remote round-trips back to a canonical http server on parse', () => {
    const cd = claudeDesktopAdapter.render([authedRemote('claude-desktop')], linux);
    const parsed = claudeDesktopAdapter.parse(cd.contents);
    expect(parsed.servers?.github?.transport).toBe('streamable-http');
    expect(parsed.servers?.github?.url).toBe('https://api.githubcopilot.com/mcp/');
    expect(parsed.servers?.github?.auth?.headers?.Authorization).toContain('Bearer');
  });
});
