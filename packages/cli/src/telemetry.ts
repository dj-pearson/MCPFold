import { Redactor } from './util/redact.js';

/**
 * Telemetry (S8.3) — OFF by default, strictly opt-in, provably non-secret.
 *
 * mcpfold collects nothing unless the user explicitly opts in with `MCPFOLD_TELEMETRY=1`.
 * The event payload is a small, fixed, allow-listed set of fields — never config, file
 * paths, server names, URLs, or secret values. It additionally passes through the S0.6/S9.3
 * {@link Redactor} as belt-and-suspenders so a secret-shaped string can never escape.
 *
 * Opt-out is honored even over an explicit opt-in: the widely-supported `DO_NOT_TRACK=1`
 * convention and `MCPFOLD_TELEMETRY=0` both disable it. There is no network sink wired by
 * default; a sink is injected (so this module is testable and shippable without a backend).
 */

export interface TelemetryEnv {
  MCPFOLD_TELEMETRY?: string;
  DO_NOT_TRACK?: string;
}

/**
 * Telemetry is enabled ONLY when the user opted in and has NOT opted out. Default (unset) is
 * disabled. `DO_NOT_TRACK=1` and `MCPFOLD_TELEMETRY=0` force it off regardless.
 */
export function isTelemetryEnabled(env: TelemetryEnv = process.env): boolean {
  if (env.DO_NOT_TRACK === '1' || env.DO_NOT_TRACK === 'true') return false;
  const opt = env.MCPFOLD_TELEMETRY;
  return opt === '1' || opt === 'true';
}

/**
 * The complete, fixed telemetry payload. Every field is non-identifying and non-secret:
 * which command ran, the CLI + runtime versions, the OS, whether it succeeded, and how long
 * it took. No paths, config, server names, URLs, or secret values are ever included.
 */
export interface TelemetryEvent {
  event: 'command';
  command: string;
  cliVersion: string;
  nodeVersion: string;
  os: NodeJS.Platform;
  exitCode: number;
  durationMs: number;
}

export interface BuildEventInput {
  command: string;
  cliVersion: string;
  exitCode: number;
  durationMs: number;
  platform?: NodeJS.Platform;
  nodeVersion?: string;
}

/** Build the fixed, allow-listed event. Only the whitelisted fields are ever emitted. */
export function buildTelemetryEvent(input: BuildEventInput): TelemetryEvent {
  return {
    event: 'command',
    command: input.command,
    cliVersion: input.cliVersion,
    nodeVersion: input.nodeVersion ?? process.version,
    os: input.platform ?? process.platform,
    exitCode: input.exitCode,
    durationMs: Math.round(input.durationMs),
  };
}

export type TelemetrySink = (event: TelemetryEvent) => void | Promise<void>;

export interface SendOptions {
  env?: TelemetryEnv;
  sink?: TelemetrySink;
  redactor?: Redactor;
}

/**
 * Send an event — but only if telemetry is enabled AND a sink is configured. Returns whether
 * anything was sent. The event is redacted before sending as a final guard: if any field ever
 * carried a secret-shaped value, it would be masked, not transmitted.
 */
export async function sendTelemetry(
  event: TelemetryEvent,
  options: SendOptions = {},
): Promise<boolean> {
  if (!isTelemetryEnabled(options.env ?? process.env)) return false;
  if (!options.sink) return false;
  const redactor = options.redactor ?? new Redactor();
  const safe = redactor.deep(event) as TelemetryEvent;
  await options.sink(safe);
  return true;
}
