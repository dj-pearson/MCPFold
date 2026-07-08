import { readFileSync } from 'node:fs';
import { arch, platform, release } from 'node:os';
import { loadConfig } from '@mcpfold/core';
import { CLI_VERSION } from '../version.js';
import { detectClients, type DetectedClient } from '../util/detect-clients.js';
import { redactConfig, Redactor } from '../util/redact.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold diagnose` (S0.6) — emit a sanitized diagnostic bundle a user can paste into a
 * bug report. It contains versions, detected clients, and (if present) the canonical
 * config with every secret VALUE and provider ref PATH redacted. Proven leak-free by
 * test: no sentinel secret and no ref path survive.
 */

export interface DiagnoseBundle {
  mcpfoldVersion: string;
  node: string;
  platform: string;
  arch: string;
  osRelease: string;
  clients: DetectedClient[];
  configPath: string | null;
  config: unknown | null;
  notes: string[];
}

export interface DiagnoseOptions {
  /** Path to the canonical config to include (redacted). Omitted → not included. */
  configPath?: string;
  /** Injectable reader for testing; defaults to fs. */
  readFile?: (path: string) => string;
}

export function buildDiagnoseBundle(options: DiagnoseOptions = {}): DiagnoseBundle {
  const read = options.readFile ?? ((p: string) => readFileSync(p, 'utf8'));
  const notes = [
    'Client detection here is provisional (S0.6); `mcpfold init` performs authoritative detection.',
    'Secret values and provider ref paths are redacted from this bundle.',
  ];

  let config: unknown | null = null;
  let configPath: string | null = null;
  if (options.configPath) {
    configPath = options.configPath;
    try {
      const text = read(options.configPath);
      const result = loadConfig(text);
      config = result.ok ? redactConfig(result.config, new Redactor()) : { invalid: result.errors };
    } catch (error) {
      notes.push(`Could not read config at ${options.configPath}: ${(error as Error).message}`);
    }
  }

  return {
    mcpfoldVersion: CLI_VERSION,
    node: process.version,
    platform: platform(),
    arch: arch(),
    osRelease: release(),
    clients: detectClients(),
    configPath,
    config,
    notes,
  };
}

export function diagnose(options: DiagnoseOptions = {}): CommandOutput<DiagnoseBundle> {
  const bundle = buildDiagnoseBundle(options);
  const detected = bundle.clients.filter((c) => c.installed).map((c) => c.id);
  const human = [
    'mcpfold diagnostic bundle',
    `  mcpfold:  ${bundle.mcpfoldVersion}`,
    `  node:     ${bundle.node}`,
    `  platform: ${bundle.platform} (${bundle.arch}) ${bundle.osRelease}`,
    `  clients:  ${detected.length ? detected.join(', ') : 'none detected'}`,
    `  config:   ${bundle.configPath ?? 'not provided'}`,
    '',
    'Secrets and ref paths are redacted. Re-run with --json to copy the full bundle.',
  ].join('\n');

  return { data: bundle, human };
}
