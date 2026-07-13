import { createInterface } from 'node:readline/promises';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { UsageError } from '@mcpfold/core';
import type { SecretProvider } from '@mcpfold/secrets';
import { runDoctor } from './doctor.js';
import { runSync } from './sync.js';
import { restoreBackup } from '../io/backup.js';
import { isAutoApplicable, type Finding, type FixAction } from '../checks/types.js';
import { EXIT } from '../output/exit-codes.js';
import type { CommandOutput } from '../output/render.js';
import { style, symbols } from '../util/style.js';

/**
 * `mcpfold doctor --fix` (S25.2) — the repair engine. Consumes the machine-applicable `autofix`
 * descriptors attached to doctor findings (S25.1) and applies the safe ones deterministically.
 *
 * Contract:
 * - Without `--yes` (and without an affirmative interactive confirm) it is a DRY RUN: it prints a
 *   per-finding preview of what would change and writes nothing.
 * - `--yes` (or an interactive "yes") applies every auto-applicable fix; `--fix <ids>` scopes it.
 * - The only auto-applicable fix today is `resync-client`, which re-folds one client's on-disk file
 *   from the canonical config via `runSync({ profile })` — that already backs up + writes atomically.
 *   Because it never edits the (already-valid) canonical config, it cannot introduce a schema error;
 *   as a safety net we still re-run doctor after applying and roll back any profile whose write raised
 *   the error count.
 * - Guided fixes (`extract-secret`, `rewrite-transport`) need a human decision and are reported, never
 *   auto-applied here (extract-secret lands as `mcpfold secret extract` in S25.3).
 */

export interface DoctorFixOptions {
  cwd: string;
  osContext?: OsContext;
  /** Scope to specific 1-based finding ids (as shown in the preview); omitted → all fixable. */
  ids?: number[];
  /** Apply without an interactive confirmation (CI / scripted). */
  yes?: boolean;
  /** Force preview only, writing nothing, regardless of `--yes` (the global `--dry-run`). */
  dryRun?: boolean;
  /** Injectable confirmation; defaults to a TTY y/N prompt (non-TTY resolves to false → preview). */
  confirm?: (summary: string) => Promise<boolean>;
  /** Injectable clock for deterministic backup names (forwarded to sync). */
  now?: Date;
  /** Injectable secret providers (forwarded to sync's inline strategy). */
  providers?: SecretProvider[];
}

export interface AppliedFix {
  ids: number[];
  kind: FixAction['kind'];
  /** Client profile re-folded / server touched. */
  target: string;
  path: string;
  backup: string | null;
}

export interface SkippedFix {
  id: number;
  kind: FixAction['kind'];
  reason: string;
}

export interface DoctorFixData {
  /** 1-based ids of the fixable findings, in doctor order, with their classification. */
  fixable: { id: number; kind: FixAction['kind']; mode: 'auto' | 'guided'; where?: string }[];
  applied: AppliedFix[];
  skipped: SkippedFix[];
  failed: { ids: number[]; kind: FixAction['kind']; error: string }[];
  /** True when nothing was written (dry run, no consent, or nothing selected). */
  previewed: boolean;
  /** Error-severity findings remaining after the run (drives the exit code). */
  remainingErrors: number;
}

interface FixItem {
  id: number;
  finding: Finding;
  action: FixAction;
  mode: 'auto' | 'guided';
}

/** A stable per-finding key so we can tell whether a specific finding survived a fix. */
function findingKey(f: Finding): string {
  return `${f.file}|${f.where ?? ''}|${f.message}`;
}

function defaultConfirm(): (summary: string) => Promise<boolean> {
  return async (summary) => {
    if (!process.stdin.isTTY) return false; // non-interactive without --yes → preview, never write
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    try {
      const answer = (await rl.question(`${summary}\nApply these fixes? [y/N]: `)).trim();
      return /^y(es)?$/i.test(answer);
    } finally {
      rl.close();
    }
  };
}

/** One-line human description of what a fix would do. */
function describeAction(action: FixAction): string {
  switch (action.kind) {
    case 'resync-client':
      return `re-fold the ${action.client} client for profile "${action.profile}" (${action.path})`;
    case 'extract-secret':
      return `move the hardcoded "${action.key}" out of "${action.server}" into a provider ref — run \`mcpfold secret extract ${action.server}\``;
    case 'rewrite-transport':
      return `switch "${action.server}" from ${action.from} to ${action.to} (confirm the server supports Streamable HTTP first)`;
  }
}

export async function runDoctorFix(
  options: DoctorFixOptions,
): Promise<CommandOutput<DoctorFixData>> {
  const ctx = options.osContext ?? realOsContext();
  const before = runDoctor({ cwd: options.cwd, osContext: ctx });

  // Number the fixable findings 1..N in doctor's deterministic order.
  const items: FixItem[] = [];
  let n = 0;
  for (const finding of before.data.findings) {
    if (!finding.autofix) continue;
    n += 1;
    items.push({
      id: n,
      finding,
      action: finding.autofix,
      mode: isAutoApplicable(finding.autofix) ? 'auto' : 'guided',
    });
  }

  const fixable = items.map((i) => ({
    id: i.id,
    kind: i.action.kind,
    mode: i.mode,
    where: i.finding.where,
  }));

  // Scope selection to requested ids (validating each), else select every fixable finding.
  let selected = items;
  if (options.ids && options.ids.length > 0) {
    const known = new Set(items.map((i) => i.id));
    const unknown = options.ids.filter((id) => !known.has(id));
    if (unknown.length > 0) {
      throw new UsageError(
        `No fixable finding with id ${unknown.join(', ')} (fixable ids: ${items.map((i) => i.id).join(', ') || 'none'}).`,
        { hint: 'Run `mcpfold doctor --fix` first to list the ids.' },
      );
    }
    const want = new Set(options.ids);
    selected = items.filter((i) => want.has(i.id));
  }

  const selectedAuto = selected.filter((i) => i.mode === 'auto');
  const skipped: SkippedFix[] = [];
  // Guided fixes are never auto-applied here — report them with the command that WILL apply them.
  for (const i of selected.filter((x) => x.mode === 'guided')) {
    skipped.push({ id: i.id, kind: i.action.kind, reason: `guided — ${describeAction(i.action)}` });
  }

  const previewText = renderPreview(items, selected);

  // Decide whether to write: --dry-run forces preview; otherwise --yes or an affirmative confirm.
  const wantsWrite = !options.dryRun && selectedAuto.length > 0;
  const confirmed =
    wantsWrite && (options.yes || (await (options.confirm ?? defaultConfirm())(previewText)));

  if (!confirmed) {
    return {
      data: {
        fixable,
        applied: [],
        skipped,
        failed: [],
        previewed: true,
        remainingErrors: before.data.errorCount,
      },
      human: renderHuman(previewText, {
        applied: [],
        skipped,
        failed: [],
        previewed: true,
        autoCount: selectedAuto.length,
        remainingErrors: before.data.errorCount,
        dryRun: Boolean(options.dryRun) || selectedAuto.length === 0,
      }),
      exit: before.data.errorCount > 0 ? EXIT.ERROR : EXIT.SUCCESS,
    };
  }

  // Apply: group resync-client fixes by profile (several findings can share one client file), then
  // re-fold each profile exactly once through the real sync path (backup + atomic write + validation).
  const beforeKeys = new Set(before.data.findings.map(findingKey));
  const byProfile = new Map<string, FixItem[]>();
  for (const i of selectedAuto) {
    if (i.action.kind !== 'resync-client') continue; // resync is the only auto kind today
    const list = byProfile.get(i.action.profile) ?? [];
    list.push(i);
    byProfile.set(i.action.profile, list);
  }

  const applied: AppliedFix[] = [];
  const failed: DoctorFixData['failed'] = [];
  const writtenBackups: { path: string; backup: string | null }[] = [];

  for (const [profile, group] of byProfile) {
    const action = group[0]!.action as Extract<FixAction, { kind: 'resync-client' }>;
    const ids = group.map((g) => g.id);
    try {
      const result = await runSync({
        cwd: options.cwd,
        profile,
        osContext: ctx,
        now: options.now,
        providers: options.providers,
      });
      const written = result.data.results.find((r) => r.profile === profile);
      const backup = written?.backup ?? null;
      writtenBackups.push({ path: action.path, backup });
      applied.push({ ids, kind: 'resync-client', target: profile, path: action.path, backup });
    } catch (err) {
      failed.push({
        ids,
        kind: 'resync-client',
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // Re-validate: re-run doctor. If applying RAISED the error count, roll back every file we wrote
  // (restore its backup) so a fix can never leave the user worse off than before.
  let after = runDoctor({ cwd: options.cwd, osContext: ctx });
  if (after.data.errorCount > before.data.errorCount) {
    for (const { path, backup } of writtenBackups) {
      if (backup) restoreBackup(path, backup, options.now);
    }
    // Move the applied fixes into `failed` — they regressed and were rolled back.
    for (const a of applied.splice(0)) {
      failed.push({
        ids: a.ids,
        kind: a.kind,
        error: 'fix raised the error count; rolled back from backup',
      });
    }
    after = runDoctor({ cwd: options.cwd, osContext: ctx });
  } else {
    // A fix that "applied" but left its finding present is a non-fix — report it honestly.
    const stillPresent = new Set(
      after.data.findings.map(findingKey).filter((k) => beforeKeys.has(k)),
    );
    for (const a of [...applied]) {
      const group = byProfile.get(a.target) ?? [];
      const unresolved = group.filter((g) => stillPresent.has(findingKey(g.finding)));
      if (unresolved.length === group.length && group.length > 0) {
        applied.splice(applied.indexOf(a), 1);
        failed.push({ ids: a.ids, kind: a.kind, error: 'the finding persisted after re-folding' });
      }
    }
  }

  return {
    data: {
      fixable,
      applied,
      skipped,
      failed,
      previewed: false,
      remainingErrors: after.data.errorCount,
    },
    human: renderHuman(previewText, {
      applied,
      skipped,
      failed,
      previewed: false,
      autoCount: selectedAuto.length,
      remainingErrors: after.data.errorCount,
      dryRun: false,
    }),
    exit: after.data.errorCount > 0 ? EXIT.ERROR : EXIT.SUCCESS,
  };
}

function renderPreview(items: FixItem[], selected: FixItem[]): string {
  if (items.length === 0) return `${style.green(symbols.ok)} No machine-applicable fixes found.`;
  const chosen = new Set(selected.map((i) => i.id));
  const line = (i: FixItem): string => {
    const mark = chosen.has(i.id) ? '' : style.dim(' (not selected)');
    const loc = i.finding.where ? ` ${style.dim(`(${i.finding.where})`)}` : '';
    return [
      `  ${style.bold(`[${i.id}]`)} ${i.finding.file}${loc}${mark}`,
      `      ${i.finding.message}`,
      `      ${style.dim('→')} ${describeAction(i.action)}`,
    ].join('\n');
  };
  const auto = items.filter((i) => i.mode === 'auto');
  const guided = items.filter((i) => i.mode === 'guided');
  const out: string[] = [];
  if (auto.length > 0) {
    out.push(style.bold(`Auto-applicable (${auto.length}):`), ...auto.map(line));
  }
  if (guided.length > 0) {
    out.push('', style.bold(`Guided — needs your input (${guided.length}):`), ...guided.map(line));
  }
  return out.join('\n');
}

function renderHuman(
  preview: string,
  meta: {
    applied: AppliedFix[];
    skipped: SkippedFix[];
    failed: DoctorFixData['failed'];
    previewed: boolean;
    autoCount: number;
    remainingErrors: number;
    dryRun: boolean;
  },
): string {
  const parts = [preview, ''];
  if (meta.previewed) {
    if (meta.autoCount === 0) {
      parts.push(style.dim('Nothing to apply automatically.'));
    } else {
      parts.push(
        style.yellow(
          `Dry run — nothing written. Re-run with \`--fix --yes\` to apply ${meta.autoCount} fix(es).`,
        ),
      );
    }
  } else {
    for (const a of meta.applied) {
      const bak = a.backup ? style.dim(` (backup: ${a.backup})`) : '';
      parts.push(`${style.green(symbols.ok)} fixed [${a.ids.join(', ')}] — re-folded "${a.target}"${bak}`);
    }
    for (const f of meta.failed) {
      parts.push(`${style.red(symbols.err)} failed [${f.ids.join(', ')}] — ${f.error}`);
    }
    if (meta.applied.length === 0 && meta.failed.length === 0) {
      parts.push(style.dim('No auto-applicable fixes were selected.'));
    }
  }
  if (meta.skipped.length > 0) {
    parts.push('', style.bold('Skipped (guided):'));
    for (const s of meta.skipped) parts.push(`  ${style.dim(`[${s.id}]`)} ${s.reason}`);
  }
  parts.push(
    '',
    meta.remainingErrors > 0
      ? style.red(`${meta.remainingErrors} error(s) remain.`)
      : style.green('No errors remain.'),
  );
  return parts.join('\n');
}
