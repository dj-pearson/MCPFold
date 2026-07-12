import { realOsContext, userConfigDir, type OsContext } from '@mcpfold/adapters';
import { findConfigPath } from '../util/config.js';
import { detectClients } from '../util/detect-clients.js';
import {
  defaultCachePath,
  detectChannel,
  isNewer,
  isNotifierEnabled,
  readUpdateCache,
  type UpdateChannel,
} from '../update-notifier.js';
import { isTelemetryEnabled, type TelemetryEnv } from '../telemetry.js';
import { CLI_VERSION } from '../version.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold info` (S23.3) — a redaction-safe "how is the tool running" snapshot: version + install
 * channel, runtime, where mcpfold looks for its config, whether one is found, the diagnostic state
 * (telemetry / update-notifier opt-in), the last update check, and how many MCP clients are on this
 * machine. It's the first command to run when something feels off, and the block to paste into a bug
 * report. Read-only, and it names only *paths and counts* — never config contents or secret values.
 * `mcpfold diagnose` remains the deep, per-config bundle; this is the fast environment overview.
 */

export interface InfoData {
  version: string;
  channel: UpdateChannel;
  node: string;
  platform: NodeJS.Platform;
  configPath: string | null;
  configDir: string;
  updateCachePath: string;
  latestKnown: string | null;
  updateAvailable: boolean;
  lastCheckedAt: string | null;
  telemetryEnabled: boolean;
  updateNotifierEnabled: boolean;
  clientsConfigured: number;
  clientsInstalledOnly: number;
}

export interface InfoOptions {
  cwd: string;
  osContext?: OsContext;
  env?: TelemetryEnv & { CI?: string; DO_NOT_TRACK?: string; MCPFOLD_NO_UPDATE_NOTIFIER?: string };
  isTTY?: boolean;
  execPath?: string;
}

function onOff(enabled: boolean): string {
  return enabled ? style.green('on') : style.dim('off');
}

function renderHuman(data: InfoData): string {
  const lines: string[] = [style.bold('mcpfold'), ''];
  const row = (label: string, value: string): string => `  ${label.padEnd(16)} ${value}`;

  lines.push(row('version', `${style.bold(data.version)} (${data.channel})`));
  lines.push(row('runtime', `node ${data.node} · ${data.platform}`));
  lines.push('');

  lines.push(
    row(
      'config',
      data.configPath
        ? `${style.green(symbols.ok)} ${data.configPath}`
        : `${style.yellow('not found')} — run \`mcpfold init\``,
    ),
  );
  lines.push(row('config dir', data.configDir));
  lines.push('');

  const clients = `${data.clientsConfigured} configured`;
  const extra =
    data.clientsInstalledOnly > 0
      ? `, ${data.clientsInstalledOnly} installed without a profile`
      : '';
  lines.push(row('clients', `${clients}${extra}`));
  lines.push('');

  lines.push(row('telemetry', onOff(data.telemetryEnabled)));
  lines.push(row('update check', onOff(data.updateNotifierEnabled)));
  if (data.updateAvailable) {
    lines.push(
      row(
        'update',
        `${style.cyan(symbols.spark)} ${style.bold(
          `${data.version} ${symbols.arrow} ${data.latestKnown}`,
        )} available`,
      ),
    );
  } else if (data.latestKnown) {
    lines.push(row('update', `${style.green(symbols.ok)} up to date (latest ${data.latestKnown})`));
  }
  if (data.lastCheckedAt) lines.push(row('last checked', style.dim(data.lastCheckedAt)));

  return lines.join('\n');
}

export function runInfo(options: InfoOptions): CommandOutput<InfoData> {
  const ctx = options.osContext ?? realOsContext();
  const env = options.env ?? (process.env as InfoOptions['env']);
  const isTTY = options.isTTY ?? Boolean(process.stdout.isTTY);
  const execPath = options.execPath ?? process.execPath;

  const configPath = findConfigPath(options.cwd);
  const cachePath = defaultCachePath(ctx);
  const cache = readUpdateCache(cachePath);
  const latestKnown = cache?.latest ?? null;
  const updateAvailable = latestKnown !== null && isNewer(latestKnown, CLI_VERSION);

  const detected = detectClients(ctx);
  const clientsConfigured = detected.filter((c) => c.state === 'configured').length;
  const clientsInstalledOnly = detected.filter((c) => c.state === 'installed-only').length;

  const data: InfoData = {
    version: CLI_VERSION,
    channel: detectChannel(execPath),
    node: process.version.replace(/^v/, ''),
    platform: ctx.platform,
    configPath,
    configDir: userConfigDir(ctx),
    updateCachePath: cachePath,
    latestKnown,
    updateAvailable,
    lastCheckedAt: cache?.checkedAt ?? null,
    telemetryEnabled: isTelemetryEnabled(env),
    updateNotifierEnabled: isNotifierEnabled(env ?? {}, isTTY),
    clientsConfigured,
    clientsInstalledOnly,
  };
  return { data, human: renderHuman(data) };
}
