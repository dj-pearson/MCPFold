import * as vscode from 'vscode';
import { spawn } from 'node:child_process';
import { MCP_CONFIG_SELECTOR, TokenBudgetLensProvider } from './tokenBudgetLens';
import { CurationLensProvider } from './curationLens';
import { parseCurateReport } from './curation';

/**
 * mcpfold VS Code extension. A thin front-end over the mcpfold CLI — it never reimplements CLI logic,
 * it shells out to it — plus a status-bar drift indicator driven by the CLI's stable exit codes
 * (`sync --check`: 0 = in sync, 1 = drift, 2 = error; see docs/cli-contract.md). Keeping it a wrapper
 * means the extension can never disagree with `mcpfold sync`.
 */

const CALCULATOR_URL = 'https://mcpfold.com/mcp-token-calculator';

let output: vscode.OutputChannel;
let status: vscode.StatusBarItem;
let curationLens: CurationLensProvider;
/** True once we've fallen back to npx for this session (so we only tell the user once). */
let usingNpxFallback = false;

export function activate(context: vscode.ExtensionContext): void {
  output = vscode.window.createOutputChannel('mcpfold');
  status = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  status.command = 'mcpfold.showMenu';
  context.subscriptions.push(output, status);

  const register = (id: string, fn: () => unknown) =>
    context.subscriptions.push(vscode.commands.registerCommand(id, fn));

  register('mcpfold.sync', () => runCommand('Sync', ['sync']));
  register('mcpfold.diff', () => runCommand('Diff', ['diff']));
  register('mcpfold.import', () => runCommand('Import', ['import']));
  register('mcpfold.doctor', () => runCommand('Doctor', ['doctor']));
  register('mcpfold.init', () => runCommand('Init', ['init']));
  register('mcpfold.checkDrift', () => void refreshDrift());
  register('mcpfold.showMenu', showMenu);
  register('mcpfold.openCalculator', () =>
    vscode.env.openExternal(vscode.Uri.parse(CALCULATOR_URL)),
  );

  // Curation (E23): a usage report, an apply-all, a per-server apply (invoked by the CodeLens),
  // and a manual refresh of the cached report.
  register('mcpfold.curate', () => runCommand('Curate', curateArgs()));
  register('mcpfold.curateApply', () => void curateWriteFlow());
  register(
    'mcpfold.curateServer',
    (name?: unknown) => void curateWriteFlow(typeof name === 'string' ? name : undefined),
  );
  register('mcpfold.refreshCuration', () => void refreshCuration());

  // Re-check sync state and refresh the curation report when a config file is saved.
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument((doc) => {
      if (!/mcp\.config\.jsonc?$/.test(doc.fileName)) return;
      if (getConfig().get<boolean>('checkDriftOnSave', true)) void refreshDrift();
      void refreshCuration();
    }),
  );

  // Inline tool-token-budget CodeLens on MCP config files (S21.2).
  const budgetLens = new TokenBudgetLensProvider();
  // "Curate to usage" CodeLens driven by real recorded usage (E23).
  curationLens = new CurationLensProvider();
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(MCP_CONFIG_SELECTOR, budgetLens),
    vscode.languages.registerCodeLensProvider(MCP_CONFIG_SELECTOR, curationLens),
    vscode.workspace.onDidChangeConfiguration((e) => {
      if (e.affectsConfiguration('mcpfold.showTokenBudget')) budgetLens.refresh();
      if (e.affectsConfiguration('mcpfold.showCurateLens')) curationLens.refresh();
      if (e.affectsConfiguration('mcpfold.auditLog')) void refreshCuration();
    }),
  );

  status.text = '$(sync) mcpfold';
  status.tooltip = 'mcpfold — click for actions';
  status.show();

  // Kick off an initial, non-blocking drift check and curation report.
  void refreshDrift();
  void refreshCuration();
}

export function deactivate(): void {
  /* disposables are cleaned up via context.subscriptions */
}

function getConfig(): vscode.WorkspaceConfiguration {
  return vscode.workspace.getConfiguration('mcpfold');
}

/** The workspace folder to run the CLI in, or undefined when no folder is open. */
function workspaceCwd(): string | undefined {
  return vscode.workspace.workspaceFolders?.[0]?.uri.fsPath;
}

/** Resolve the base command + args to invoke mcpfold, honoring settings. */
function resolveCli(forceNpx = false): { command: string; baseArgs: string[] } {
  const custom = getConfig().get<string>('path', '').trim();
  if (custom && !forceNpx) return { command: custom, baseArgs: [] };
  if (forceNpx || getConfig().get<boolean>('useNpx', false)) {
    return { command: 'npx', baseArgs: ['--yes', 'mcpfold@latest'] };
  }
  return { command: 'mcpfold', baseArgs: [] };
}

interface RunResult {
  code: number;
  stdout: string;
  stderr: string;
}

/**
 * Spawn the CLI with `args`. When `stream` is true, output is echoed to the mcpfold channel live.
 * If the binary is missing (ENOENT) and we weren't already using npx, transparently retry via npx.
 */
function runCli(args: string[], stream: boolean, forceNpx = false): Promise<RunResult> {
  const cwd = workspaceCwd();
  const { command, baseArgs } = resolveCli(forceNpx);
  const argv = [...baseArgs, ...args];

  return new Promise((resolve, reject) => {
    let stdout = '';
    let stderr = '';
    // shell:true resolves `npx.cmd` / `mcpfold.cmd` on Windows and respects PATH cross-platform.
    const child = spawn(command, argv, { cwd, shell: true });

    child.stdout.on('data', (d: Buffer) => {
      const text = d.toString();
      stdout += text;
      if (stream) output.append(text);
    });
    child.stderr.on('data', (d: Buffer) => {
      const text = d.toString();
      stderr += text;
      if (stream) output.append(text);
    });
    child.on('error', (err: NodeJS.ErrnoException) => {
      if (err.code === 'ENOENT' && !forceNpx && !getConfig().get<boolean>('useNpx', false)) {
        if (!usingNpxFallback) {
          usingNpxFallback = true;
          output.appendLine(
            '[mcpfold] binary not found on PATH — falling back to `npx mcpfold@latest`.',
          );
        }
        runCli(args, stream, true).then(resolve, reject);
        return;
      }
      reject(err);
    });
    child.on('close', (code) => resolve({ code: code ?? 0, stdout, stderr }));
  });
}

/** Run a user-facing command: reveal the output channel, stream, report the outcome, refresh drift. */
async function runCommand(label: string, args: string[]): Promise<void> {
  if (!workspaceCwd()) {
    void vscode.window.showWarningMessage('mcpfold: open a folder to run commands.');
    return;
  }
  output.show(true);
  output.appendLine(`\n$ mcpfold ${args.join(' ')}`);
  try {
    const { code } = await runCli(args, true);
    if (code === 0) {
      void vscode.window.showInformationMessage(`mcpfold ${label.toLowerCase()}: done.`);
    } else if (code === 1) {
      // Exit 1 is an actionable difference (e.g. diff found drift) — informational, not an error.
      void vscode.window.showInformationMessage(
        `mcpfold ${label.toLowerCase()}: changes detected — see the mcpfold output.`,
      );
    } else {
      void vscode.window.showErrorMessage(
        `mcpfold ${label.toLowerCase()} failed (exit ${code}) — see the mcpfold output.`,
      );
    }
  } catch (err) {
    void vscode.window.showErrorMessage(
      `mcpfold: could not run the CLI (${(err as Error).message}). Install it or set "mcpfold.useNpx".`,
    );
  } finally {
    void refreshDrift();
  }
}

/** Build a `curate` argv, honoring the optional `mcpfold.auditLog` setting and an optional server. */
function curateArgs(server?: string, extra: string[] = []): string[] {
  const auditLog = getConfig().get<string>('auditLog', '').trim();
  const audit = auditLog ? ['--audit-log', auditLog] : [];
  return ['curate', ...(server ? [server] : []), ...audit, ...extra];
}

/** Whether an audit log is discoverable (setting or inherited env), gating the background report. */
function auditLogConfigured(): boolean {
  return (
    getConfig().get<string>('auditLog', '').trim() !== '' ||
    typeof process.env.MCPFOLD_AUDIT_LOG === 'string'
  );
}

/**
 * Refresh the cached curation report by running `mcpfold curate --json` (read-only). Skips the CLI
 * entirely when no audit log is configured, so the lens simply stays absent rather than churning the
 * CLI or nagging. Any failure (CLI missing, too old to know `curate`, unreadable log) clears the
 * report so no stale lenses linger.
 */
async function refreshCuration(): Promise<void> {
  if (!curationLens) return;
  if (!workspaceCwd() || !auditLogConfigured()) {
    curationLens.setReport(null);
    return;
  }
  try {
    const { code, stdout } = await runCli([...curateArgs(), '--json'], false);
    curationLens.setReport(code === 0 ? parseCurateReport(stdout) : null);
  } catch {
    curationLens.setReport(null);
  }
}

/**
 * Confirm and apply a curation recommendation — for one server (from the CodeLens) or all servers.
 * Writing is guarded by a modal confirm since it rewrites the canonical config; on completion the
 * cached report is refreshed so the lenses reflect the new state.
 */
async function curateWriteFlow(server?: string): Promise<void> {
  if (!workspaceCwd()) {
    void vscode.window.showWarningMessage('mcpfold: open a folder to run commands.');
    return;
  }
  const target = server ? `"${server}"` : 'every server';
  const choice = await vscode.window.showWarningMessage(
    `Curate ${target} to your recorded tool usage? This rewrites the \`tools\` allow-list in mcp.config.jsonc.`,
    { modal: true },
    'Curate',
  );
  if (choice !== 'Curate') return;
  await runCommand(
    server ? `Curate ${server}` : 'Curate',
    curateArgs(server, ['--write', '--yes']),
  );
  void refreshCuration();
}

/** Run `sync --check` (writing nothing) and reflect the result in the status bar. */
async function refreshDrift(): Promise<void> {
  if (!workspaceCwd()) {
    setStatus('$(sync) mcpfold', 'mcpfold — open a folder to check sync status', undefined);
    return;
  }
  setStatus('$(sync~spin) mcpfold', 'mcpfold — checking sync status…', undefined);
  try {
    const { code } = await runCli(['sync', '--check', '--json'], false);
    if (code === 0) {
      setStatus(
        '$(check) mcpfold',
        'MCP config is in sync across all clients — click for actions',
        undefined,
      );
    } else if (code === 1) {
      setStatus(
        '$(warning) mcpfold: drift',
        'MCP clients have drifted from your config — run mcpfold: Sync',
        new vscode.ThemeColor('statusBarItem.warningBackground'),
      );
    } else {
      setStatus(
        '$(error) mcpfold',
        `mcpfold: config or CLI error (exit ${code}) — run mcpfold: Doctor`,
        new vscode.ThemeColor('statusBarItem.errorBackground'),
      );
    }
  } catch {
    setStatus('$(cloud-download) mcpfold', 'mcpfold CLI not found — click to set it up', undefined);
  }
}

function setStatus(text: string, tooltip: string, background: vscode.ThemeColor | undefined): void {
  status.text = text;
  status.tooltip = tooltip;
  status.backgroundColor = background;
  status.show();
}

/** A quick-pick of the common actions, opened from the status bar. */
async function showMenu(): Promise<void> {
  const picks: Array<vscode.QuickPickItem & { command: string }> = [
    { label: '$(sync) Sync to all clients', description: 'mcpfold sync', command: 'mcpfold.sync' },
    { label: '$(diff) Preview changes', description: 'mcpfold diff', command: 'mcpfold.diff' },
    {
      label: '$(check) Check sync status',
      description: 'mcpfold sync --check',
      command: 'mcpfold.checkDrift',
    },
    {
      label: '$(cloud-download) Import from clients',
      description: 'mcpfold import',
      command: 'mcpfold.import',
    },
    { label: '$(pulse) Doctor', description: 'mcpfold doctor', command: 'mcpfold.doctor' },
    {
      label: '$(sparkle) Curate tools to your usage',
      description: 'mcpfold curate',
      command: 'mcpfold.curate',
    },
    { label: '$(new-file) Init a config', description: 'mcpfold init', command: 'mcpfold.init' },
    {
      label: '$(dashboard) Open the token calculator',
      description: 'mcpfold.com',
      command: 'mcpfold.openCalculator',
    },
  ];
  const choice = await vscode.window.showQuickPick(picks, { placeHolder: 'mcpfold' });
  if (choice) void vscode.commands.executeCommand(choice.command);
}
