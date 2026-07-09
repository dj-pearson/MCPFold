import {
  resolveProfile,
  UnknownProfileError,
  UsageError,
  type Config,
  type ResolvedServer,
  type Transport,
} from '@mcpfold/core';
import {
  canonicalizeTools,
  diffToolSurface,
  handshake,
  hasToolDrift,
  renderToolSurfaceDiff,
  type MessageTransport,
  type ToolSurfaceDiff,
} from '@mcpfold/proxy';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';
import { realTransport } from '../util/mcp-transport.js';
import { fileTrustGate, type TrustGate } from '../trust/tofu.js';
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
  /** Tool-definition drift vs the trusted surface (S18.1), when the server is pinned. */
  toolDrift?: { drifted: boolean; diff?: ToolSurfaceDiff; summary?: string };
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
  /**
   * Check the live tool surface against the trusted digest (S18.1) — the test-time enforcement
   * point for NON-proxied servers. Pass `false` to disable, a gate to override; defaults to the
   * on-disk trust gate.
   */
  trust?: TrustGate | false;
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

export async function runTest(options: TestOptions): Promise<CommandOutput<TestData>> {
  const { config } = loadConfigFromDisk(options.cwd);
  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const factory = options.transportFactory ?? realTransport;
  const trustGate = options.trust === false ? undefined : (options.trust ?? fileTrustGate());

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
      // Tool-definition pinning (S18.1): the test-time drift check for non-proxied servers.
      const pinned = trustGate?.trustedTools(server.name);
      if (pinned && res.reachable && res.tools) {
        const diff = diffToolSurface(pinned.surface, canonicalizeTools(res.tools));
        result.toolDrift = hasToolDrift(diff)
          ? { drifted: true, diff, summary: renderToolSurfaceDiff(diff) }
          : { drifted: false };
      }
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

  // A reachable-but-drifted server is a failure signal too — silent tool-definition drift is the
  // exact rug-pull we're defending against.
  const anyFail = results.some((r) => !r.reachable || r.toolDrift?.drifted);
  return {
    data: { results },
    human: renderHuman(results),
    exit: anyFail ? EXIT.DIFF : EXIT.SUCCESS,
  };
}

function renderHuman(results: TestServerResult[]): string {
  if (results.length === 0) return 'No servers to test.';
  const lines: string[] = [];
  for (const r of results) {
    if (r.reachable) {
      const proto = r.protocolVersion ? ` · MCP ${r.protocolVersion}` : '';
      lines.push(`  ✓ ${r.server} (${r.transport}): reachable — ${r.toolCount} tool(s)${proto}`);
      if (r.toolDrift?.drifted) {
        lines.push(`  ⚠ ${r.server}: tool definitions CHANGED since you trusted this server:`);
        if (r.toolDrift.summary) lines.push(r.toolDrift.summary);
        lines.push(`      Review, then re-run \`mcpfold trust ${r.server} --tools\` to approve.`);
      }
    } else {
      lines.push(`  ✗ ${r.server} (${r.transport}): ${r.error ?? 'unreachable'}`);
    }
  }
  const failed = results.filter((r) => !r.reachable).length;
  const drifted = results.filter((r) => r.toolDrift?.drifted).length;
  const parts: string[] = [];
  parts.push(failed === 0 ? 'All servers reachable.' : `${failed} server(s) failed.`);
  if (drifted > 0) parts.push(`${drifted} server(s) with drifted tool definitions.`);
  return ['Server health:', ...lines, '', parts.join(' ')].join('\n');
}
