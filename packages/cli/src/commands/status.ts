import { Buffer } from 'node:buffer';
import { realOsContext, requireAdapter, type OsContext } from '@mcpfold/adapters';
import type { ClientId } from '@mcpfold/core';
import type { SecretProvider } from '@mcpfold/secrets';
import { runDiff } from './diff.js';
import { runDoctor } from './doctor.js';
import { detectClients } from '../util/detect-clients.js';
import { loadSession, osKeychainBackend, type KeychainBackend } from '../cloud/token-store.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold status` (S10.1) — the daily front door. Aggregates the existing read-only engines —
 * diff (drift per client), doctor (footgun error/warning counts), and the stored cloud session —
 * into one scannable summary. Never writes anything. Exit 0 when clean/in-sync, 1 when there is
 * actionable drift or any doctor finding, 2 on error (via the envelope runner).
 */

export interface StatusClient {
  client: string;
  profile: string;
  path: string;
  managed: boolean;
  inSync: boolean;
  added: number;
  changed: number;
  unmanaged: number;
  needsRestart: boolean;
}

export interface StatusCloud {
  loggedIn: boolean;
  endpoint: string;
  identity?: string;
}

export interface StatusData {
  clients: StatusClient[];
  /** S19.3: client ids installed on this machine but not yet in any profile (onboarding hint). */
  installedUnconfigured: string[];
  health: { errors: number; warnings: number };
  cloud: StatusCloud | null;
  ok: boolean;
}

export interface StatusOptions {
  cwd: string;
  osContext?: OsContext;
  providers?: SecretProvider[];
  /** Cloud session store; defaults to the OS keychain. Injectable for tests. */
  backend?: KeychainBackend;
}

/** Best-effort decode of the JWT `sub` for a friendly "logged in as" line (no verification). */
function identityOf(accessToken: string): string | undefined {
  try {
    const payload = accessToken.split('.')[1];
    if (!payload) return undefined;
    const json = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as { sub?: string };
    return typeof json.sub === 'string' ? json.sub : undefined;
  } catch {
    return undefined;
  }
}

function renderHuman(data: StatusData): string {
  const lines: string[] = ['Clients:'];
  if (data.clients.length === 0) lines.push('  (none detected)');
  for (const c of data.clients) {
    const state = !c.managed
      ? 'unmanaged'
      : c.inSync
        ? 'in sync'
        : `drift (+${c.added} ~${c.changed} -${c.unmanaged})`;
    const restart = c.needsRestart && !c.inSync ? ' · needs restart' : '';
    const mark = c.inSync ? '✓' : '•';
    lines.push(`  ${mark} ${c.client} (${c.profile}): ${state}${restart}`);
  }
  if (data.installedUnconfigured.length > 0) {
    lines.push(
      `  (installed, no profile yet: ${data.installedUnconfigured.join(', ')} — add a profile to fold to them)`,
    );
  }
  lines.push('');
  lines.push(
    data.health.errors === 0 && data.health.warnings === 0
      ? 'Health: ✓ no problems'
      : `Health: ${data.health.errors} error(s), ${data.health.warnings} warning(s) (run \`mcpfold doctor\`)`,
  );
  if (data.cloud) {
    const who = data.cloud.identity ? ` as ${data.cloud.identity}` : '';
    lines.push(`Cloud: logged in${who} → ${data.cloud.endpoint}`);
  }
  lines.push('');
  lines.push(data.ok ? '✓ Everything looks good.' : '→ Some items need attention.');
  return lines.join('\n');
}

export async function runStatus(options: StatusOptions): Promise<CommandOutput<StatusData>> {
  const ctx = options.osContext ?? realOsContext();
  const diff = await runDiff({ cwd: options.cwd, osContext: ctx, providers: options.providers });
  const doctor = runDoctor({ cwd: options.cwd, osContext: ctx });

  const clients: StatusClient[] = diff.data.clients.map((c) => {
    const servers = c.diff.servers;
    return {
      client: c.client,
      profile: c.profile,
      path: c.path,
      managed: !c.diff.fileMissing,
      inSync: !c.diff.hasDrift,
      added: servers.filter((s) => s.status === 'added').length,
      changed: servers.filter((s) => s.status === 'changed').length,
      unmanaged: servers.filter((s) => s.status === 'unmanaged').length,
      needsRestart: requireAdapter(c.client as ClientId).needsRestart,
    };
  });

  const health = { errors: doctor.data.errorCount, warnings: doctor.data.warningCount };

  let cloud: StatusCloud | null = null;
  const backend = options.backend ?? osKeychainBackend();
  const session = await loadSession(backend);
  if (session) {
    cloud = {
      loggedIn: true,
      endpoint: session.endpoint,
      identity: identityOf(session.accessToken),
    };
  }

  // S19.3: clients installed on the machine but not yet covered by any profile — an onboarding hint.
  const profileClients = new Set(clients.map((c) => c.client));
  const installedUnconfigured = detectClients(ctx)
    .filter((c) => c.state === 'installed-only' && !profileClients.has(c.id))
    .map((c) => c.id);

  const ok = !diff.data.drift && health.errors === 0 && health.warnings === 0;
  const data: StatusData = { clients, installedUnconfigured, health, cloud, ok };
  return { data, human: renderHuman(data), exit: ok ? EXIT.SUCCESS : EXIT.DIFF };
}
