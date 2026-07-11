import { McpfoldError, type McpfoldErrorCode } from './errors.js';
import type { Config, ProfileConfig, ResolvedServer, ServerConfig } from './types.js';

/**
 * Profile / tag / scope resolution — the "fold" (S1.4).
 *
 * `profiles.include` filters servers by tag: a server loads into a profile's client iff
 * its `tags` intersect the profile's `include` list. Output is deterministic (servers
 * sorted by key) so rendered files and `sync --check` are reproducible. Pure — secrets
 * stay as references here; they are resolved later inside adapters/providers.
 */

/** Thrown when a profile name is not present in the config. */
export class UnknownProfileError extends McpfoldError {
  override readonly code: McpfoldErrorCode = 'UNKNOWN_PROFILE';
  constructor(
    readonly profileName: string,
    readonly available: string[],
  ) {
    super(
      available.length > 0
        ? `Unknown profile "${profileName}". Available profiles: ${available.join(', ')}.`
        : `Unknown profile "${profileName}". This config defines no profiles.`,
      { hint: 'Check the profile name against the `profiles` block in your config.' },
    );
  }
}

/** Non-fatal findings about a resolution, surfaced to `doctor`. */
export interface ResolveDiagnostics {
  /** Tags listed in `include` that no server carries. */
  unmatchedTags: string[];
  /** True when the profile's include set intersects no server at all. */
  empty: boolean;
}

function intersects(a: readonly string[], b: readonly string[]): boolean {
  const set = new Set(a);
  return b.some((t) => set.has(t));
}

function toResolved(name: string, server: ServerConfig, profile: ProfileConfig): ResolvedServer {
  return {
    name,
    transport: server.transport,
    command: server.command,
    args: server.args,
    url: server.url,
    auth: server.auth,
    env: server.env,
    pin: server.pin,
    // S22.9: carry the SRI integrity through resolution so it can reach the fetch/install layer.
    integrity: server.integrity,
    tools: server.tools,
    tags: server.tags,
    client: profile.client,
    scope: profile.scope,
    projectPath: profile.path,
    // S19.4: a server's own strategy override wins over the profile's; undefined ⇒ adapter default.
    secretStrategy: server.secretStrategy ?? profile.secretStrategy,
  };
}

/**
 * Resolve a single profile to the servers it should load, sorted by server key.
 * Throws {@link UnknownProfileError} if the profile does not exist.
 */
export function resolveProfile(config: Config, profileName: string): ResolvedServer[] {
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new UnknownProfileError(profileName, Object.keys(config.profiles));
  }
  return Object.keys(config.servers)
    .sort()
    .flatMap((name) => {
      const server = config.servers[name]!;
      return intersects(server.tags, profile.include) ? [toResolved(name, server, profile)] : [];
    });
}

/**
 * Like {@link resolveProfile} but also returns non-fatal diagnostics (unmatched tags,
 * empty result) for `doctor`. Still throws {@link UnknownProfileError} for a bad name.
 */
export function resolveProfileWithDiagnostics(
  config: Config,
  profileName: string,
): { servers: ResolvedServer[]; diagnostics: ResolveDiagnostics } {
  const profile = config.profiles[profileName];
  if (!profile) {
    throw new UnknownProfileError(profileName, Object.keys(config.profiles));
  }
  const servers = resolveProfile(config, profileName);
  const allTags = new Set<string>();
  for (const s of Object.values(config.servers)) for (const t of s.tags) allTags.add(t);
  const unmatchedTags = profile.include.filter((t) => !allTags.has(t));
  return { servers, diagnostics: { unmatchedTags, empty: servers.length === 0 } };
}

/**
 * Resolve every profile → its ResolvedServer[]. Used by `sync` without `--profile`.
 * Keys are iterated in stable (sorted) order for reproducibility.
 */
export function resolveAll(config: Config): Record<string, ResolvedServer[]> {
  const out: Record<string, ResolvedServer[]> = {};
  for (const profileName of Object.keys(config.profiles).sort()) {
    out[profileName] = resolveProfile(config, profileName);
  }
  return out;
}
