import { createInterface } from 'node:readline';
import { writeFileSync } from 'node:fs';
import { basename } from 'node:path';
import { type Config, isSecretRef, serialize } from '@mcpfold/core';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import type { SecretProvider } from '@mcpfold/secrets';
import { detectClients } from '../util/detect-clients.js';
import { findConfigPath, loadConfigFromDisk } from '../util/config.js';
import { runInit } from '../commands/init.js';
import { runImport } from '../commands/import.js';
import { runDoctor } from '../commands/doctor.js';
import { runSync } from '../commands/sync.js';

/**
 * Guided first-run onboarding (S10.3): walk a newcomer from zero to synced — detect clients,
 * import what they have, fix footguns, sync, and show the context savings. Every prompt has a
 * default so the flow is scriptable/CI-safe (see {@link autoPrompter}); `--dry-run` previews the
 * whole plan without writing; and it never clobbers an existing config or leaves partial writes.
 */

export interface Prompter {
  confirm(question: string, defaultYes: boolean): Promise<boolean>;
}

/** Non-interactive prompter — returns each step's default (or a forced answer). Used with --yes
 * and whenever stdin isn't a TTY, so the guided flow runs unattended. */
export function autoPrompter(force?: boolean): Prompter {
  return { confirm: (_q, d) => Promise.resolve(force ?? d) };
}

/** Scripted prompter for tests: answers a queue in order, then falls back to defaults. */
export function scriptedPrompter(answers: boolean[]): Prompter {
  let i = 0;
  return { confirm: (_q, d) => Promise.resolve(i < answers.length ? answers[i++]! : d) };
}

/** Interactive readline prompter (y/N). */
export function ttyPrompter(): Prompter {
  return {
    confirm(question, defaultYes) {
      const rl = createInterface({ input: process.stdin, output: process.stdout });
      const hint = defaultYes ? 'Y/n' : 'y/N';
      return new Promise((resolve) => {
        rl.question(`${question} [${hint}] `, (answer) => {
          rl.close();
          const a = answer.trim().toLowerCase();
          resolve(a === '' ? defaultYes : a === 'y' || a === 'yes');
        });
      });
    },
  };
}

// Matches the doctor hardcoded-secret check (checks/servers.ts) so a fix makes doctor go clean.
const SUSPICIOUS_KEY = /(token|secret|key|auth|pat|password|bearer)/i;
const envRef = (key: string) => `\${env:${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}}`;

/** Rewrite hardcoded secrets (literal values in suspicious env/header keys) to `${env:…}` refs. */
export function applySafeFixes(config: Config): { config: Config; fixes: string[] } {
  const fixes: string[] = [];
  const servers: Config['servers'] = {};
  for (const [name, server] of Object.entries(config.servers)) {
    const next = { ...server };
    const rewrite = (record: Record<string, string> | undefined, kind: string) => {
      if (!record) return record;
      const out: Record<string, string> = {};
      for (const [key, value] of Object.entries(record)) {
        if (!isSecretRef(value) && SUSPICIOUS_KEY.test(key)) {
          out[key] = envRef(key);
          fixes.push(`${name}: ${kind}.${key} → ${envRef(key)}`);
        } else {
          out[key] = value;
        }
      }
      return out;
    };
    if (next.env) next.env = rewrite(next.env, 'env');
    if (next.auth?.headers)
      next.auth = { ...next.auth, headers: rewrite(next.auth.headers, 'auth.headers')! };
    servers[name] = next;
  }
  return { config: { ...config, servers }, fixes };
}

export interface GuidedOptions {
  cwd: string;
  osContext?: OsContext;
  providers?: SecretProvider[];
  dryRun?: boolean;
}

export interface GuidedResult {
  configPath: string | null;
  imported: boolean;
  fixesApplied: string[];
  synced: boolean;
  aborted: boolean;
}

const SAVINGS =
  'Typical context savings: ~80% fewer tool-schema tokens (7,476 → 1,497). See docs/benchmark.md.';

export async function runGuided(
  options: GuidedOptions,
  deps: {
    prompt: Prompter;
    write: (line: string) => void;
  },
): Promise<GuidedResult> {
  const { prompt, write } = deps;
  const ctx = options.osContext ?? realOsContext();
  const dryRun = Boolean(options.dryRun);
  const result: GuidedResult = {
    configPath: null,
    imported: false,
    fixesApplied: [],
    synced: false,
    aborted: false,
  };

  write("Welcome to mcpfold — let's get you from zero to synced.");
  if (dryRun) write('(dry-run: showing the plan; nothing will be written)');

  const detected = detectClients(ctx).filter((c) => c.installed);
  write(`Detected clients: ${detected.map((c) => c.id).join(', ') || 'none'}`);

  // --- Step 1: get a canonical config (never clobber without confirmation) --------------------
  let configPath = findConfigPath(options.cwd);
  if (configPath) {
    const keep = await prompt.confirm(`Found ${basename(configPath)} — use it as-is?`, true);
    if (!keep) {
      const overwrite = await prompt.confirm(
        'Overwrite it? (commit first — init makes no backup)',
        false,
      );
      if (!overwrite) {
        write('Aborted — nothing changed.');
        result.aborted = true;
        return result;
      }
      configPath = null;
    }
  }

  if (!configPath) {
    if (
      detected.length > 0 &&
      (await prompt.confirm('Import your existing client configs?', true))
    ) {
      const preview = runImport({ cwd: options.cwd, force: true, dryRun: true });
      write(
        `Would import ${preview.data.servers.length} server(s): ${preview.data.servers.join(', ') || '—'}`,
      );
      if (!dryRun && (await prompt.confirm('Apply this import?', true))) {
        const done = runImport({ cwd: options.cwd, force: true });
        configPath = done.data.configPath;
        result.imported = true;
        write(`Imported ${done.data.servers.length} server(s) — secrets rewritten to references.`);
      }
    }
    if (!configPath && !dryRun) {
      const done = runInit({ cwd: options.cwd, force: true });
      configPath = done.data.configPath;
      write('Scaffolded a starter mcp.config.jsonc.');
    }
  }
  result.configPath = configPath;
  if (!configPath) {
    write('Plan complete (dry-run). Re-run without --dry-run to apply.');
    return result;
  }

  // --- Step 2: doctor inline + offer safe fixes ----------------------------------------------
  const doctor = runDoctor({ cwd: options.cwd, osContext: ctx });
  write(
    `Health check: ${doctor.data.errorCount} error(s), ${doctor.data.warningCount} warning(s).`,
  );
  if (doctor.data.errorCount + doctor.data.warningCount > 0 && !dryRun) {
    const { config } = loadConfigFromDisk(options.cwd);
    const fixed = applySafeFixes(config);
    if (
      fixed.fixes.length > 0 &&
      (await prompt.confirm(`Apply ${fixed.fixes.length} safe fix(es)?`, true))
    ) {
      writeFileSync(configPath, `${serialize(fixed.config)}\n`, 'utf8');
      result.fixesApplied = fixed.fixes;
      for (const f of fixed.fixes) write(`  fixed ${f}`);
    }
  }

  // --- Step 3: sync --------------------------------------------------------------------------
  if (await prompt.confirm('Fold your config out to every client now?', true)) {
    const sync = await runSync({
      cwd: options.cwd,
      osContext: ctx,
      providers: options.providers,
      dryRun,
    });
    const wrote = sync.data.results.filter((r) => r.action === 'written').length;
    write(
      dryRun ? 'Sync preview ready (no files written).' : `Synced — folded ${wrote} client(s).`,
    );
    result.synced = !dryRun;
  }

  // --- Step 4: the payoff --------------------------------------------------------------------
  write(SAVINGS);
  write('Done. Try `mcpfold status` any time to check your setup.');
  return result;
}
