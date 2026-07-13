import { resolveProfile, UnknownProfileError, UsageError, type ResolvedServer } from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';
import { discoverSurface, type TransportFactory } from '../discover/surface.js';
import { writeSnapshot, type CacheLocation, type SurfaceSnapshot } from '../discover/cache.js';
import { Redactor } from '../util/redact.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold inspect [server]` (S24.6) — introspect a configured server's live tool surface and cache a
 * redacted snapshot (tool names + token estimates). Resolves secrets IN MEMORY only, opens the real
 * MCP session, and reports how many tools and roughly how many tokens each server costs — so curation
 * decisions and savings numbers rest on the user's real config, not fixtures. `--json` supported.
 */

export interface InspectServerResult {
  server: string;
  ok: boolean;
  snapshot?: SurfaceSnapshot;
  error?: string;
}

export interface InspectData {
  results: InspectServerResult[];
}

export interface InspectOptions {
  cwd: string;
  /** A single server name; omit to inspect every server in the (active) profile / config. */
  server?: string;
  profile?: string;
  timeoutMs?: number;
  providers?: SecretProvider[];
  /** Injectable transport for tests; defaults to the real stdio/http transport. */
  transportFactory?: TransportFactory;
  /** Injectable clock for deterministic snapshots in tests. */
  now?: () => Date;
  /** Cache location override (tests point this at a temp dir). */
  cache?: CacheLocation;
}

/** Build the list of servers to inspect — a named one, an active profile's set, or the whole config. */
function targetsFor(
  config: Parameters<typeof resolveProfile>[0],
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
    return { name, ...server, tags: server.tags ?? [], client: 'cursor', scope: 'user' } as ResolvedServer;
  });
}

export async function runInspect(options: InspectOptions): Promise<CommandOutput<InspectData>> {
  const { config } = loadConfigFromDisk(options.cwd);
  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const timeoutMs = options.timeoutMs ?? 10_000;
  const targets = targetsFor(config, { server: options.server, profile: options.profile });
  const resolved = await resolveSecrets(targets, {
    providers: options.providers ?? defaultProviders(options.cwd),
    timeoutMs,
  });

  const results: InspectServerResult[] = [];
  for (const server of resolved) {
    // Scrub any resolved secret value from anything we might print (defense in depth — the snapshot
    // never contains one, but a transport error message could echo an env value).
    const redactor = new Redactor();
    Object.values(server.env ?? {}).forEach((v) => redactor.register(v));
    Object.values(server.auth?.headers ?? {}).forEach((v) => redactor.register(v));
    redactor.register(server.auth?.token);

    try {
      const snapshot = await discoverSurface(server, {
        timeoutMs,
        transportFactory: options.transportFactory,
        now: options.now,
      });
      writeSnapshot(snapshot, options.cache);
      results.push({ server: server.name, ok: true, snapshot });
    } catch (err) {
      results.push({
        server: server.name,
        ok: false,
        error: redactor.string(err instanceof Error ? err.message : String(err)),
      });
    }
  }

  const anyFail = results.some((r) => !r.ok);
  return {
    data: { results },
    human: renderHuman(results),
    exit: anyFail ? EXIT.DIFF : EXIT.SUCCESS,
  };
}

function renderHuman(results: InspectServerResult[]): string {
  if (results.length === 0) return 'No servers to inspect.';
  const lines: string[] = [];
  for (const r of results) {
    if (!r.ok || !r.snapshot) {
      lines.push(`${style.red(symbols.err)} ${style.bold(r.server)}: ${r.error ?? 'discovery failed'}`);
      continue;
    }
    const s = r.snapshot;
    lines.push(
      `${style.green(symbols.ok)} ${style.bold(s.server)} ${style.dim(`— ${s.toolCount} tool${s.toolCount === 1 ? '' : 's'}, ~${s.totalTokens} tokens`)}`,
    );
    for (const t of s.tools) {
      lines.push(`    ${t.name} ${style.dim(`~${t.tokens} tok`)}`);
    }
  }
  const total = results.reduce((sum, r) => sum + (r.snapshot?.totalTokens ?? 0), 0);
  lines.push('');
  lines.push(
    `${style.dim('Full tool surface costs')} ~${total} ${style.dim('tokens of context per request. Curate with')} \`mcpfold curate\`.`,
  );
  return lines.join('\n');
}
