import type { CloudApi } from '../cloud/api.js';
import type { KeychainBackend } from '../cloud/token-store.js';
import { assertRefOnly } from '../cloud/refguard.js';
import { endpointError, getAccessToken, requireSession } from '../cloud/session.js';
import { loadConfigFromDisk } from '../util/config.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold push` (S6.6) — upload the local canonical config as a new append-only version,
 * tagged with this machine. The client-side ref-only guard refuses to send a raw secret
 * (mirroring the server guard), so a resolved value never leaves the machine.
 */

export interface PushOptions {
  cwd: string;
  api: CloudApi;
  backend: KeychainBackend;
  machineName?: string;
  teamId?: string;
  now?: () => number;
}

export interface PushData {
  version: number;
  endpoint: string;
}

export async function runPush(opts: PushOptions): Promise<CommandOutput<PushData>> {
  const { config } = loadConfigFromDisk(opts.cwd);
  // Belt-and-suspenders: never upload a resolved secret, even if the server would reject it.
  assertRefOnly(config);

  const session = await requireSession(opts.backend);
  const token = await getAccessToken(session, opts.api, opts.backend, opts.now?.());

  let res;
  try {
    res = await opts.api.push(token, {
      config,
      machine_name: opts.machineName,
      team_id: opts.teamId,
    });
  } catch (error) {
    throw endpointError(session.endpoint, error);
  }

  return {
    data: { version: res.version, endpoint: session.endpoint },
    human: `✓ Pushed config as version ${res.version} to ${session.endpoint}.`,
  };
}
