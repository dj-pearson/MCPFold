import { spawn } from 'node:child_process';
import {
  resolveProfile,
  UnknownProfileError,
  UsageError,
  type Config,
  type ResolvedServer,
  type Transport,
} from '@mcpfold/core';
import { handshake, type MessageTransport, streamTransport } from '@mcpfold/proxy';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';
import { resolveCommand } from '../util/spawn.js';
import { Redactor } from '../util/redact.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold test [server]` (S10.4) — actually connect to a configured server and confirm it
 * initializes and lists tools. Resolves secrets IN MEMORY only (never printed), opens the right
 * transport, runs the MCP initialize + tools/list handshake with a bounded timeout, and reports
 * reachability / protocol / tool count. Exits nonzero if any tested server fails.
 */

export interface TestServerResult {
  server: string;
  transport: Transport;
  reachable: boolean;
  protocolVersion?: string;
  toolCount?: number;
  error?: string;
}

export interface TestData {
  results: TestServerResult[];
}

export type TransportFactory = (
  server: ResolvedServer,
) => MessageTransport | Promise<MessageTransport>;

export interface TestOptions {
  cwd: string;
  /** A single server name; omit to test every server in the (active) profile / config. */
  server?: string;
  profile?: string;
  timeoutMs?: number;
  providers?: SecretProvider[];
  /** Injectable for tests; defaults to real stdio/http transports. */
  transportFactory?: TransportFactory;
}

/** Build the list of servers to test — a named one, an active profile's set, or the whole config. */
function serversToTest(
  config: Config,
  opts: { server?: string; profile?: string },
): ResolvedServer[] {
  if (opts.profile) {
    const set = resolveProfile(config, opts.profile);
    return opts.server ? set.filter((s) => s.name === opts.server) : set;
  }
  const names = opts.server ? [opts.server] : Object.keys(config.servers);
  return names.map((name) => {
    const server = config.servers[name];
    if (!server) throw new UsageError(`No server "${name}" in the canonical config.`);
    // client/scope are irrelevant to a handshake — stub them so we can reuse ResolvedServer.
    return {
      name,
      ...server,
      tags: server.tags ?? [],
      client: 'cursor',
      scope: 'user',
    } as ResolvedServer;
  });
}

/** Default transport for a resolved server: spawn stdio, or POST JSON-RPC over HTTP/SSE. */
function realTransport(server: ResolvedServer): MessageTransport {
  if (server.transport === 'stdio') {
    if (!server.command) throw new UsageError(`Server "${server.name}" has no launch command.`);
    const r = resolveCommand(server.command, server.args ?? []);
    const child = spawn(r.command, r.args, {
      stdio: ['pipe', 'pipe', 'ignore'],
      env: { ...process.env, ...server.env },
      windowsVerbatimArguments: r.windowsVerbatimArguments,
    });
    let spawnError: string | undefined;
    child.on('error', (e) => {
      spawnError = e.message;
    });
    const transport = streamTransport(child.stdout!, child.stdin!);
    return {
      onMessage: (h) => transport.onMessage(h),
      send: (m) => {
        if (spawnError) throw new Error(spawnError);
        transport.send(m);
      },
      close: () => {
        transport.close();
        child.kill();
      },
    };
  }
  // http / sse: streamable-HTTP JSON-RPC over POST.
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json, text/event-stream',
    ...(server.auth?.headers ?? {}),
  };
  if (server.auth?.token) headers.authorization = `Bearer ${server.auth.token}`;
  let onMsg: Parameters<MessageTransport['onMessage']>[0] | undefined;
  return {
    onMessage: (h) => {
      onMsg = h;
    },
    // Once the handshake negotiates a version, echo it as MCP-Protocol-Version on every subsequent
    // request (required since MCP 2025-06-18). Mutates the shared headers used by send().
    setProtocolVersion: (version) => {
      headers['mcp-protocol-version'] = version;
    },
    send: (msg) => {
      if (msg.id == null) return; // notification: fire-and-forget
      fetch(server.url!, { method: 'POST', headers, body: JSON.stringify(msg) })
        .then(async (res) => {
          if (!res.ok) {
            onMsg?.({
              jsonrpc: '2.0',
              id: msg.id,
              error: { code: res.status, message: `HTTP ${res.status}` },
            });
            return;
          }
          const text = await res.text();
          const jsonLine = text.startsWith('data:')
            ? text
                .split('\n')
                .find((l) => l.startsWith('data:'))
                ?.slice(5)
                .trim()
            : text;
          const parsed = jsonLine ? JSON.parse(jsonLine) : null;
          if (parsed) onMsg?.(parsed);
        })
        .catch((e) =>
          onMsg?.({
            jsonrpc: '2.0',
            id: msg.id,
            error: { code: -1, message: String(e?.message ?? e) },
          }),
        );
    },
    close: () => {},
  };
}

export async function runTest(options: TestOptions): Promise<CommandOutput<TestData>> {
  const { config } = loadConfigFromDisk(options.cwd);
  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const factory = options.transportFactory ?? realTransport;

  const targets = serversToTest(config, { server: options.server, profile: options.profile });
  const resolved = await resolveSecrets(targets, {
    providers: options.providers ?? defaultProviders(),
    timeoutMs,
  });

  const results: TestServerResult[] = [];
  for (const server of resolved) {
    // Scrub every resolved secret value from anything we print.
    const redactor = new Redactor();
    Object.values(server.env ?? {}).forEach((v) => redactor.register(v));
    Object.values(server.auth?.headers ?? {}).forEach((v) => redactor.register(v));
    redactor.register(server.auth?.token);

    let result: TestServerResult;
    try {
      const transport = await factory(server);
      const res = await handshake(transport, { timeoutMs });
      result = {
        server: server.name,
        transport: server.transport,
        reachable: res.reachable,
        protocolVersion: res.protocolVersion,
        toolCount: res.toolCount,
        error: res.error ? redactor.string(res.error) : undefined,
      };
    } catch (err) {
      result = {
        server: server.name,
        transport: server.transport,
        reachable: false,
        error: redactor.string(err instanceof Error ? err.message : String(err)),
      };
    }
    results.push(result);
  }

  const anyFail = results.some((r) => !r.reachable);
  return {
    data: { results },
    human: renderHuman(results),
    exit: anyFail ? EXIT.DIFF : EXIT.SUCCESS,
  };
}

function renderHuman(results: TestServerResult[]): string {
  if (results.length === 0) return 'No servers to test.';
  const lines = results.map((r) => {
    if (r.reachable) {
      const proto = r.protocolVersion ? ` · MCP ${r.protocolVersion}` : '';
      return `  ✓ ${r.server} (${r.transport}): reachable — ${r.toolCount} tool(s)${proto}`;
    }
    return `  ✗ ${r.server} (${r.transport}): ${r.error ?? 'unreachable'}`;
  });
  const failed = results.filter((r) => !r.reachable).length;
  const footer = failed === 0 ? 'All servers reachable.' : `${failed} server(s) failed.`;
  return ['Server health:', ...lines, '', footer].join('\n');
}
