import { CLIENT_IDS } from '@mcpfold/core';
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

/**
 * Adoption signal (S11.5) — a strictly opt-in, AGGREGATE event so adapter/provider work is driven
 * by data, not guesswork. Every field is a fixed allow-list of non-identifying values: which client
 * adapters and provider schemes were seen (from the known enums only — arbitrary strings are
 * dropped), and COARSE size buckets. Never a config, path, URL, server name, or secret. See
 * docs/telemetry.md for the exact fields and the aggregation view.
 */
export const KNOWN_SCHEMES = ['env', 'dotenv', 'infisical', 'keychain', 'op'] as const;
export type ProviderScheme = (typeof KNOWN_SCHEMES)[number];

export interface AdoptionEvent {
  event: 'adoption';
  cliVersion: string;
  os: NodeJS.Platform;
  /** Subset of the known client ids, sorted. */
  adapters: string[];
  /** Subset of the known provider schemes, sorted. */
  providerSchemes: string[];
  /** Coarse size buckets — never exact counts. */
  serverBucket: string;
  profileBucket: string;
}

/** Coarse, non-identifying size bucket. */
export function bucketCount(n: number): string {
  if (n <= 0) return '0';
  if (n <= 5) return '1-5';
  if (n <= 20) return '6-20';
  return '20+';
}

export interface BuildAdoptionInput {
  cliVersion: string;
  adapters: string[];
  providerSchemes: string[];
  serverCount: number;
  profileCount: number;
  platform?: NodeJS.Platform;
}

/**
 * Build the adoption event. Adapters and schemes are filtered to the known enums, so a config path
 * or server name passed in by mistake can never become a field value — only real client ids and
 * scheme names survive.
 */
export function buildAdoptionEvent(input: BuildAdoptionInput): AdoptionEvent {
  const clients = new Set<string>(CLIENT_IDS);
  const schemes = new Set<string>(KNOWN_SCHEMES);
  const allow = (arr: string[], set: Set<string>) =>
    [...new Set(arr.filter((x) => set.has(x)))].sort();
  return {
    event: 'adoption',
    cliVersion: input.cliVersion,
    os: input.platform ?? process.platform,
    adapters: allow(input.adapters, clients),
    providerSchemes: allow(input.providerSchemes, schemes),
    serverBucket: bucketCount(input.serverCount),
    profileBucket: bucketCount(input.profileCount),
  };
}

export type TelemetryPayload = TelemetryEvent | AdoptionEvent;
export type TelemetrySink = (event: TelemetryPayload) => void | Promise<void>;

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
async function sendEvent(event: TelemetryPayload, options: SendOptions): Promise<boolean> {
  if (!isTelemetryEnabled(options.env ?? process.env)) return false;
  if (!options.sink) return false;
  const redactor = options.redactor ?? new Redactor();
  await options.sink(redactor.deep(event) as TelemetryPayload);
  return true;
}

export function sendTelemetry(event: TelemetryEvent, options: SendOptions = {}): Promise<boolean> {
  return sendEvent(event, options);
}

/** Send the opt-in adoption signal (same gating + redaction guard as {@link sendTelemetry}). */
export function sendAdoption(event: AdoptionEvent, options: SendOptions = {}): Promise<boolean> {
  return sendEvent(event, options);
}
