import {
  detectChannel,
  fetchLatestFromNpm,
  isNewer,
  upgradeCommand,
  type UpdateChannel,
} from '../update-notifier.js';
import { CLI_VERSION } from '../version.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold update` (S23.2) — an on-demand version check. The passive notifier only surfaces a
 * cached result at the end of another command; this checks *now* and prints the channel-correct
 * upgrade command. It never installs anything itself — it tells you the one line to run, because
 * the right command depends on how mcpfold was installed (npm / brew / scoop / standalone binary).
 *
 * `--json` returns a stable payload for scripts (e.g. a CI staleness gate). Exit 0 whether or not
 * an update exists — "you are up to date" is a success, not a failure; only a hard error exits 2.
 */

export interface UpdateData {
  current: string;
  latest: string | null;
  channel: UpdateChannel;
  updateAvailable: boolean;
  upgradeCommand: string;
  /** Set when the registry could not be reached (offline, timeout, registry error). */
  checkFailed: boolean;
}

export interface UpdateOptions {
  currentVersion?: string;
  execPath?: string;
  /** Injectable for tests; defaults to the npm registry lookup. */
  fetchLatest?: () => Promise<string | null>;
}

function renderHuman(data: UpdateData): string {
  if (data.checkFailed) {
    return [
      `${style.yellow(symbols.warn)} Couldn't reach the registry to check for updates.`,
      `  You're on ${style.bold(data.current)}. Try again, or run ${style.green(
        `\`${data.upgradeCommand}\``,
      )} to upgrade.`,
    ].join('\n');
  }
  if (!data.updateAvailable) {
    return `${style.green(symbols.ok)} mcpfold is up to date (${style.bold(data.current)}).`;
  }
  return [
    `${style.cyan(symbols.spark)} Update available: ${style.bold(
      `${data.current} ${symbols.arrow} ${data.latest}`,
    )}`,
    `  Run ${style.green(`\`${data.upgradeCommand}\``)} to update.`,
  ].join('\n');
}

export async function runUpdate(options: UpdateOptions = {}): Promise<CommandOutput<UpdateData>> {
  const current = options.currentVersion ?? CLI_VERSION;
  const channel = detectChannel(options.execPath ?? process.execPath);
  const command = upgradeCommand(channel);

  const latest = await (options.fetchLatest ?? fetchLatestFromNpm)();
  const checkFailed = latest === null;
  const updateAvailable = latest !== null && isNewer(latest, current);

  const data: UpdateData = {
    current,
    latest,
    channel,
    updateAvailable,
    upgradeCommand: command,
    checkFailed,
  };
  return { data, human: renderHuman(data), exit: EXIT.SUCCESS };
}
