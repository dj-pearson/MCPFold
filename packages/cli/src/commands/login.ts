import { UsageError } from '@mcpfold/core';
import type { CloudApi } from '../cloud/api.js';
import { type CloudSession, type KeychainBackend, saveSession } from '../cloud/token-store.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold login` (S6.6) — device-code OAuth. Requests a code, tells the user where to enter
 * it, polls until approved, and stores the session in the OS keychain (never a plaintext file).
 * The API, keychain backend, clock, and sleep are injectable so the flow is testable without a
 * network, a browser, or the real keychain.
 */

export interface LoginOptions {
  api: CloudApi;
  backend: KeychainBackend;
  endpoint: string;
  machineName?: string;
  /** Prints the verification URL + user code to the user. */
  print: (message: string) => void;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  /** Poll cadence override (tests pass 0); defaults to the server-provided interval. */
  pollDelayMs?: number;
}

const realSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export interface LoginData {
  endpoint: string;
  machine?: string;
}

export async function runLogin(opts: LoginOptions): Promise<CommandOutput<LoginData>> {
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? realSleep;

  const start = await opts.api.startDevice(opts.machineName);
  opts.print(
    `To authorize this machine, open:\n    ${start.verification_uri}\n` +
      `and enter the code:  ${start.user_code}\n\nWaiting for approval…`,
  );

  const deadline = now() + start.expires_in * 1000;
  const delay = opts.pollDelayMs ?? start.interval * 1000;

  while (now() < deadline) {
    const poll = await opts.api.pollDevice(start.device_code);
    if (poll.status === 'complete') {
      const session: CloudSession = {
        accessToken: poll.access_token,
        refreshToken: poll.refresh_token,
        expiresAt: Math.floor(now() / 1000) + poll.expires_in,
        endpoint: opts.endpoint,
      };
      await saveSession(session, opts.backend);
      return {
        data: { endpoint: opts.endpoint, machine: opts.machineName },
        human: `✓ Logged in to ${opts.endpoint}. Session stored in your OS keychain.`,
      };
    }
    if (poll.status === 'error') {
      throw new UsageError(`Login failed: ${poll.error}.`, {
        hint: 'Run `mcpfold login` to start over.',
      });
    }
    await sleep(delay);
  }

  throw new UsageError('Login timed out waiting for approval.', {
    hint: 'Run `mcpfold login` to try again.',
  });
}
