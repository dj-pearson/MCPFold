import { existsSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig, UsageError } from '@mcpfold/core';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { detectClients, type DetectedClient } from '../util/detect-clients.js';
import { CONFIG_FILENAMES } from '../util/config.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold init` (S3.2) — scaffold a commented starter `mcp.config.jsonc` (with a `$schema`
 * line for editor autocomplete) and report which clients are installed. Never clobbers an
 * existing config without `--force`; `--dry-run` previews.
 */

export const SCHEMA_URL = 'https://mcpfold.com/schema/v1.json';

export function starterConfig(): string {
  return `{
  // mcpfold canonical config — one source of truth, folded out to every client.
  // Docs: https://mcpfold.com  ·  Schema: ${SCHEMA_URL}
  "$schema": "${SCHEMA_URL}",
  "version": 1,

  "servers": {
    // A stdio server. Pin @latest to a fixed version for supply-chain hygiene.
    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "pin": "1.4.2",
      "tags": ["code"]
    }

    // A remote server with a secret REFERENCE (never a hardcoded token):
    // "github": {
    //   "transport": "http",
    //   "url": "https://api.githubcopilot.com/mcp/",
    //   "auth": { "type": "bearer", "token": "\${env:GITHUB_PAT}" },
    //   "tags": ["work", "code"]
    // }
  },

  "profiles": {
    // Fold only servers whose tags intersect \`include\` into each client.
    "cursor": { "client": "cursor", "scope": "user", "include": ["code"] }
  }
}
`;
}

export interface InitOptions {
  cwd: string;
  force?: boolean;
  dryRun?: boolean;
  osContext?: OsContext;
}

export interface InitData {
  configPath: string;
  created: boolean;
  detected: DetectedClient[];
}

export function runInit(options: InitOptions): CommandOutput<InitData> {
  const ctx = options.osContext ?? realOsContext();
  const configPath = join(options.cwd, CONFIG_FILENAMES[0]);
  const exists = existsSync(configPath);
  const detected = detectClients(ctx);
  const contents = starterConfig();

  // Sanity: the scaffold we ship must itself validate.
  const check = loadConfig(contents);
  if (!check.ok) {
    throw new Error(`internal: starter config failed validation: ${check.errors[0]?.message}`);
  }

  if (exists && !options.force) {
    throw new UsageError(`${configPath} already exists.`, {
      hint: 'Pass --force to overwrite it (a backup is not made by init — commit first).',
    });
  }

  if (options.dryRun) {
    return {
      data: { configPath, created: false, detected },
      human: renderHuman(configPath, false, detected, contents),
    };
  }

  writeFileSync(configPath, contents, { encoding: 'utf8' });
  return {
    data: { configPath, created: true, detected },
    human: renderHuman(configPath, true, detected, contents),
  };
}

function renderHuman(
  configPath: string,
  created: boolean,
  detected: DetectedClient[],
  contents: string,
): string {
  const installed = detected.filter((c) => c.installed).map((c) => c.id);
  const lines: string[] = [];
  if (created) lines.push(`Created ${configPath}`);
  else lines.push(`Would create ${configPath}:`, '', contents);
  lines.push(
    '',
    installed.length > 0
      ? `Detected clients: ${installed.join(', ')}.`
      : 'No installed clients detected (that is fine — add profiles for the clients you use).',
    '',
    'Next: edit the config, then run `mcpfold sync` to fold it out.',
    'Already have a .mcp.json? Run `mcpfold import` to adopt it. Need one for another tool?',
    '`mcpfold export --mcp-json` writes one.',
  );
  return lines.join('\n');
}
