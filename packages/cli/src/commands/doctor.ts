import { readFileSync } from 'node:fs';
import { loadConfig } from '@mcpfold/core';
import { realOsContext, registerAll, type OsContext } from '@mcpfold/adapters';
import { findConfigPath } from '../util/config.js';
import { checkConfigValid } from '../checks/config.js';
import { Redactor } from '../util/redact.js';
import { checkClientFiles } from '../checks/clients.js';
import {
  checkHardcodedSecrets,
  checkPinIntegrity,
  checkSecretSchemes,
  checkUnpinnedLatest,
} from '../checks/servers.js';
import type { Finding } from '../checks/types.js';
import { EXIT } from '../output/exit-codes.js';
import { UsageError } from '@mcpfold/core';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold doctor` (S3.7) — the retention hook. Lints the canonical config and each on-disk
 * client file for known footguns (bad JSON, the VS Code `servers` trap, hardcoded secrets,
 * unpinned `@latest`, unknown secret schemes). Each finding names the file, the issue, and
 * the fix. Exits nonzero when any error-severity finding exists; `--json` supported.
 */

export interface DoctorData {
  configPath: string;
  findings: Finding[];
  errorCount: number;
  warningCount: number;
}

export interface DoctorOptions {
  cwd: string;
  osContext?: OsContext;
}

export function runDoctor(options: DoctorOptions): CommandOutput<DoctorData> {
  registerAll();
  const ctx = options.osContext ?? realOsContext();
  const configPath = findConfigPath(options.cwd);
  if (!configPath) {
    throw new UsageError(`No mcp.config.jsonc found in ${options.cwd}.`, {
      hint: 'Run `mcpfold init` to scaffold one.',
    });
  }

  const text = readFileSync(configPath, 'utf8');
  const findings: Finding[] = [];

  const validity = checkConfigValid(configPath, text);
  findings.push(...validity.findings);

  // Server + client checks only run when the config is structurally valid.
  if (validity.ok) {
    const result = loadConfig(text);
    if (result.ok) {
      const config = result.config;
      findings.push(...checkUnpinnedLatest(config, configPath));
      findings.push(...checkPinIntegrity(config, configPath));
      findings.push(...checkHardcodedSecrets(config, configPath));
      findings.push(...checkSecretSchemes(config, configPath));
      findings.push(...checkClientFiles(config, ctx));
    }
  }

  const errorCount = findings.filter((f) => f.severity === 'error').length;
  const warningCount = findings.filter((f) => f.severity === 'warning').length;

  // S9.3: mask any token-shaped string that a finding message/fix might echo.
  const safeFindings = new Redactor().deep(findings);

  return {
    data: { configPath, findings: safeFindings, errorCount, warningCount },
    human: renderHuman(configPath, safeFindings, errorCount, warningCount),
    exit: errorCount > 0 ? EXIT.ERROR : EXIT.SUCCESS,
  };
}

function renderHuman(
  configPath: string,
  findings: Finding[],
  errorCount: number,
  warningCount: number,
): string {
  if (findings.length === 0) {
    return `✓ doctor found no problems in ${configPath}.`;
  }
  const icon = { error: '✖', warning: '⚠', info: 'ℹ' } as const;
  const lines = findings.map((f) => {
    const loc = f.where ? ` (${f.where})` : '';
    return [`${icon[f.severity]} ${f.file}${loc}`, `    ${f.message}`, `    fix: ${f.fix}`].join(
      '\n',
    );
  });
  return [...lines, '', `${errorCount} error(s), ${warningCount} warning(s).`].join('\n');
}
