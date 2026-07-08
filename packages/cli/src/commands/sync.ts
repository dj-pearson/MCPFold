import { existsSync, readFileSync } from 'node:fs';
import {
  diffRendered,
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
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';
import { atomicWrite } from '../io/atomic-write.js';
import { backupIfExists } from '../io/backup.js';
import { renderWithStrategy } from '../sync/strategy.js';
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
  const { config } = loadConfigFromDisk(options.cwd);

  if (options.profile && !config.profiles[options.profile]) {
    throw new UnknownProfileError(options.profile, Object.keys(config.profiles));
  }
  const profileNames = options.profile ? [options.profile] : Object.keys(config.profiles).sort();
  const preview = Boolean(options.dryRun || options.check);

  const results: SyncFileResult[] = [];
  const warnings: string[] = [];
  let drift = false;
  let wrote = false;

  // Only the `inline` strategy resolves values; shim/native-input never do.
  const providers = options.providers ?? defaultProviders(options.cwd);
  const resolve = (servers: ResolvedServer[]): Promise<ResolvedServer[]> =>
    resolveSecrets(servers, { providers });

  for (const name of profileNames) {
    const profile = config.profiles[name]!;
    const adapter = requireAdapter(profile.client);
    const servers = resolveProfile(config, name);
    const file = await renderWithStrategy(adapter, servers, {
      osContext: ctx,
      resolve,
      onWarn: (w) => warnings.push(w),
    });
    const onDisk = existsSync(file.path) ? readFileSync(file.path, 'utf8') : undefined;

    if (preview) {
      const diff = diffRendered(file, onDisk, adapter);
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
  const human = renderHuman(results, { preview, drift, restartClients });
  // --check is the CI gate; --dry-run is informational (always exits 0).
  const exit = options.check && drift ? EXIT.DIFF : EXIT.SUCCESS;

  return { data: { results, drift, wrote }, human, warnings, exit };
}

function renderHuman(
  results: SyncFileResult[],
  meta: { preview: boolean; drift: boolean; restartClients: string[] },
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
