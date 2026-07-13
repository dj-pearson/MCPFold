import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import {
  resolveProfile,
  UnknownProfileError,
  checkRendered,
  hasDrift,
  type CheckableFile,
  type CheckResult,
  type ConfigDiff,
  type ResolvedServer,
} from '@mcpfold/core';
import { realOsContext, registerAll, requireAdapter, type OsContext } from '@mcpfold/adapters';
import { UsageError } from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { findConfigPath, loadConfigFromDisk } from '../util/config.js';
import {
  checkServer,
  describeViolation,
  loadPolicy,
  type PolicyViolation,
} from '../util/policy.js';
import { atomicWrite } from '../io/atomic-write.js';
import { backupIfExists } from '../io/backup.js';
import { type FsWatcher, watchWithDebounce, type WatchHandle } from '../io/watch.js';
import { renderWithStrategy } from '../sync/strategy.js';
import { diffRenderedSafe } from '../util/safe-diff.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold sync [--profile p]` (S3.5) — the core value loop. Resolves each profile,
 * renders it via its adapter, backs up any existing target (timestamped), writes
 * atomically, and reports which clients need a restart. `--dry-run` previews the diff and
 * writes nothing; `--check` is the CI drift gate (exit 1, writes nothing).
 *
 * Secrets remain unresolved references at this stage — the per-adapter secret strategies
 * (shim / native-input / inline) are wired at E4. Until then rendered files carry
 * `${scheme:path}` references, which is safe (no values on disk).
 */

export type SyncAction = 'written' | 'unchanged' | 'preview';

export interface SyncFileResult {
  profile: string;
  client: string;
  path: string;
  action: SyncAction;
  needsRestart: boolean;
  backup: string | null;
  diff?: ConfigDiff;
}

export interface SyncData {
  results: SyncFileResult[];
  drift: boolean;
  wrote: boolean;
  /** Org-policy violations (S18.3): servers a policy blocked, with rule + file provenance. */
  policyViolations?: { server: string; profile: string; reason: string; source: string }[];
}

export interface SyncOptions {
  cwd: string;
  profile?: string;
  dryRun?: boolean;
  check?: boolean;
  /** Injectable for tests (tmp HOME); defaults to the real OS. */
  osContext?: OsContext;
  /** Injectable clock for deterministic backup names. */
  now?: Date;
  /** Injectable secret providers (used only by the inline strategy). Defaults to env+dotenv. */
  providers?: SecretProvider[];
}

export async function runSync(options: SyncOptions): Promise<CommandOutput<SyncData>> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const { path: configPath, config } = loadConfigFromDisk(options.cwd);
  // Embedded into every shim (`mcpfold run <name> --cwd <dir>`) so GUI clients, which launch
  // MCP servers from an arbitrary working directory, still resolve the canonical config.
  const configDir = dirname(resolvePath(configPath));

  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const profileNames = options.profile ? [options.profile] : Object.keys(config.profiles).sort();
  const preview = Boolean(options.dryRun || options.check);

  const results: SyncFileResult[] = [];
  const warnings: string[] = [];
  let drift = false;
  let wrote = false;

  // Org policy (S18.3): evaluate every folded server up front. In strict mode any violation
  // fails the whole write (nothing is folded); in permissive mode the violating server is stripped
  // from its fold with a loud warning. `--check`/`--dry-run` report violations and exit nonzero.
  const loadedPolicy = loadPolicy(options.cwd, ctx);
  const violations: (PolicyViolation & { profile: string })[] = [];
  const keptServers = new Map<string, ResolvedServer[]>();
  for (const name of profileNames) {
    const kept: ResolvedServer[] = [];
    for (const server of resolveProfile(config, name)) {
      const v = checkServer(loadedPolicy, server.name, server);
      if (v) {
        violations.push({ ...v, profile: name });
        if (loadedPolicy!.policy.mode === 'permissive') {
          warnings.push(`Org policy stripped ${describeViolation(v)} (profile "${name}")`);
          continue; // strip from the fold
        }
      }
      kept.push(server);
    }
    keptServers.set(name, kept);
  }
  if (violations.length > 0 && loadedPolicy?.policy.mode === 'strict' && !preview) {
    throw new UsageError(
      `Org policy (strict) blocks ${violations.length} server(s); nothing was written.`,
      { hint: violations.map((v) => describeViolation(v)).join('; ') },
    );
  }
  const policyViolations = violations.map((v) => ({
    server: v.server,
    profile: v.profile,
    reason: v.decision.reason,
    source: v.source,
  }));

  // Only the `inline` strategy resolves values; shim/native-input never do.
  const providers = options.providers ?? defaultProviders(options.cwd);
  const resolve = (servers: ResolvedServer[]): Promise<ResolvedServer[]> =>
    resolveSecrets(servers, { providers });

  for (const name of profileNames) {
    const profile = config.profiles[name]!;
    const adapter = requireAdapter(profile.client);
    const servers = keptServers.get(name)!;
    // Read the target BEFORE rendering: shared-config adapters (Goose/Codex/opencode) merge into
    // the existing file to preserve the user's non-MCP keys, so the render depends on it.
    const scope = servers[0]?.scope ?? 'user';
    const targetPath = adapter.resolvePath(scope, servers[0]?.projectPath, ctx);
    const onDisk = existsSync(targetPath) ? readFileSync(targetPath, 'utf8') : undefined;
    const file = await renderWithStrategy(adapter, servers, {
      osContext: ctx,
      resolve,
      onWarn: (w) => warnings.push(w),
      existing: onDisk,
      // S19.4: per-profile secret-strategy override (a server's own override still wins, applied inside).
      strategyOverride: profile.secretStrategy,
      configDir,
    });

    if (preview) {
      const diff = diffRenderedSafe(file, onDisk, adapter);
      if (diff.hasDrift) drift = true;
      results.push({
        profile: name,
        client: profile.client,
        path: file.path,
        action: 'preview',
        needsRestart: file.needsRestart,
        backup: null,
        diff,
      });
      continue;
    }

    if (onDisk === file.contents) {
      results.push({
        profile: name,
        client: profile.client,
        path: file.path,
        action: 'unchanged',
        needsRestart: false,
        backup: null,
      });
    } else {
      const backup = backupIfExists(file.path, options.now);
      atomicWrite(file.path, file.contents);
      wrote = true;
      results.push({
        profile: name,
        client: profile.client,
        path: file.path,
        action: 'written',
        needsRestart: file.needsRestart,
        backup,
      });
    }
  }

  const restartClients = [
    ...new Set(
      results.filter((r) => r.action === 'written' && r.needsRestart).map((r) => r.client),
    ),
  ];
  const human = renderHuman(results, { preview, drift, restartClients, policyViolations });
  // --check is the CI gate: fail on drift OR any org-policy violation. --dry-run always exits 0.
  const exit = options.check && (drift || policyViolations.length > 0) ? EXIT.DIFF : EXIT.SUCCESS;

  return {
    data: { results, drift, wrote, policyViolations },
    human,
    warnings,
    exit,
  };
}

function renderHuman(
  results: SyncFileResult[],
  meta: {
    preview: boolean;
    drift: boolean;
    restartClients: string[];
    policyViolations: { server: string; profile: string; reason: string; source: string }[];
  },
): string {
  if (results.length === 0) return 'No profiles to sync.';
  const lines = results.map((r) => {
    if (r.action === 'preview') {
      const d = r.diff!;
      const summary = d.fileMissing
        ? 'would create'
        : d.hasDrift
          ? `${d.servers.length} change(s)`
          : 'up to date';
      return `  ${r.client} (${r.profile}) → ${r.path}: ${summary}`;
    }
    const tag = r.action === 'written' ? 'wrote' : 'unchanged';
    const bak = r.backup ? ` (backup: ${r.backup})` : '';
    return `  ${r.client} (${r.profile}) → ${r.path}: ${tag}${bak}`;
  });
  const footer: string[] = [];
  if (meta.policyViolations.length > 0) {
    footer.push('', 'Org-policy violations:');
    for (const v of meta.policyViolations) {
      footer.push(`  ✗ ${v.server} (profile "${v.profile}"): ${v.reason} [policy: ${v.source}]`);
    }
  }
  if (meta.preview) {
    footer.push(
      '',
      meta.drift ? 'Drift detected. Run `mcpfold sync` to apply.' : 'Everything is up to date.',
    );
  } else if (meta.restartClients.length > 0) {
    footer.push('', `Restart required for: ${meta.restartClients.join(', ')}.`);
  }
  return [meta.preview ? 'Sync preview:' : 'Synced:', ...lines, ...footer].join('\n');
}

/**
 * `sync --watch` (S10.2). Folds once, then re-folds on every change to the canonical config,
 * debounced to coalesce rapid saves. Each fold reuses the exact atomic-write + backup path of a
 * manual sync; `--dry-run` prints diffs without writing. A fold that throws (e.g. an invalid config
 * mid-edit) is reported and the watcher keeps running. Returns a handle; call stop() on SIGINT.
 */
export interface WatchIo {
  write: (line: string) => void;
  watcher?: FsWatcher;
  debounceMs?: number;
}

function summarize(data: SyncData, preview: boolean): string {
  if (data.results.length === 0) return 'no profiles to sync';
  if (preview) {
    const changed = data.results.filter((r) => r.diff?.hasDrift || r.diff?.fileMissing).length;
    return changed === 0 ? 'up to date' : `${changed} client(s) would change`;
  }
  const wrote = data.results.filter((r) => r.action === 'written').length;
  return wrote === 0 ? 'all clients up to date' : `folded ${wrote} client(s)`;
}

export function runSyncWatch(options: SyncOptions, io: WatchIo): WatchHandle {
  const preview = Boolean(options.dryRun);
  const stamp = () => new Date().toISOString().slice(11, 19);

  const fold = async (label: string) => {
    try {
      const out = await runSync(options);
      io.write(`[${stamp()}] ${label}: ${summarize(out.data, preview)}`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      io.write(`[${stamp()}] ${label}: error — ${msg} (still watching)`);
    }
  };

  void fold('initial fold');

  const configPath = findConfigPath(options.cwd) ?? join(options.cwd, 'mcp.config.jsonc');
  io.write(`Watching ${configPath}${preview ? ' (dry-run)' : ''} — Ctrl-C to stop.`);

  return watchWithDebounce({
    path: configPath,
    debounceMs: io.debounceMs,
    watcher: io.watcher,
    onChange: () => fold('change'),
  });
}

/** Lower-level check helper retained for the S0.10 conformance test + external callers. */
export interface SyncCheckDeps {
  rendered: CheckableFile[];
  readFile?: (path: string) => string | undefined;
}
export interface SyncCheckData {
  results: CheckResult[];
  drift: boolean;
}
export function runSyncCheck(deps: SyncCheckDeps): CommandOutput<SyncCheckData> {
  const read =
    deps.readFile ?? ((p: string) => (existsSync(p) ? readFileSync(p, 'utf8') : undefined));
  const results = checkRendered(deps.rendered, read);
  const drift = hasDrift(results);
  const human =
    results.length === 0
      ? 'Nothing to check — no client files would be rendered.'
      : results.map((r) => `  ${r.status}  ${r.path}`).join('\n');
  return { data: { results, drift }, human, exit: drift ? EXIT.DIFF : EXIT.SUCCESS };
}
