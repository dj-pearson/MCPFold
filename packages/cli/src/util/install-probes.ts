import { joinFor, pathFor, userConfigDir, type OsContext } from '@mcpfold/adapters';
import type { ClientId } from '@mcpfold/core';

/**
 * App-presence probes (S19.3). `detect-clients` used to report a client only when its MCP config
 * file already existed — so an installed-but-unconfigured client (the exact case `init --guided`
 * exists to serve) was invisible. These probes add a second signal: is the app itself installed?
 *
 * A client is "present" when ANY of its signals hit:
 *   - `bins`       — a CLI on PATH (`gemini`, `codex`, `goose`, …).
 *   - `dirs`       — an app bundle / install dir / first-run data dir that exists.
 *   - `extensions` — a VS Code-family extension folder (`<host>/extensions/<publisher.id>-<ver>`),
 *                    matched by prefix since the version suffix varies.
 *
 * Every path is built from an injected {@link OsContext}, so the whole thing is testable per
 * platform without touching the real filesystem. Signals are deliberately broad (multiple install
 * shapes per OS) and lean on the durable dot-dir a client creates on first run as a backstop.
 */

export interface AppSignals {
  /** CLI binary names to look for on PATH. */
  bins: string[];
  /** Absolute paths (app bundles / install dirs / data dirs) that exist iff the app is installed. */
  dirs: string[];
  /** VS Code-family extension dirs to scan for a `<prefix>-<version>` entry. */
  extensions: { dir: string; prefix: string }[];
}

function localAppData(ctx: OsContext): string {
  return ctx.env.LOCALAPPDATA ?? joinFor(ctx, ctx.home, 'AppData', 'Local');
}

function programFiles(ctx: OsContext): string {
  return ctx.env.ProgramFiles ?? 'C:\\Program Files';
}

/** macOS `.app` bundle candidates: system `/Applications` and the per-user `~/Applications`. */
function macApps(ctx: OsContext, ...names: string[]): string[] {
  const p = pathFor(ctx.platform);
  return names.flatMap((name) => [
    `/Applications/${name}.app`,
    p.join(ctx.home, 'Applications', `${name}.app`),
  ]);
}

/** The VS Code-family extensions root for each host editor a client's extension can live under. */
function extensionHosts(ctx: OsContext): string[] {
  return [
    joinFor(ctx, ctx.home, '.vscode', 'extensions'),
    joinFor(ctx, ctx.home, '.cursor', 'extensions'),
    joinFor(ctx, ctx.home, '.windsurf', 'extensions'),
  ];
}

function extension(ctx: OsContext, prefix: string): { dir: string; prefix: string }[] {
  return extensionHosts(ctx).map((dir) => ({ dir, prefix }));
}

/**
 * Per-client install signals. Verified July 2026 (see docs/coverage.md). Deliberately conservative:
 * a hit means "very likely installed"; a miss never blocks folding (the client is still selectable),
 * it just means we can't prove presence without a config file.
 */
export function appSignals(id: ClientId, ctx: OsContext): AppSignals {
  const win = ctx.platform === 'win32';
  const mac = ctx.platform === 'darwin';
  const empty: AppSignals = { bins: [], dirs: [], extensions: [] };

  switch (id) {
    case 'claude-desktop':
      return {
        bins: [],
        dirs: mac
          ? macApps(ctx, 'Claude')
          : win
            ? [
                joinFor(ctx, localAppData(ctx), 'AnthropicClaude'),
                joinFor(ctx, userConfigDir(ctx), 'Claude'),
              ]
            : [joinFor(ctx, userConfigDir(ctx), 'Claude')],
        extensions: [],
      };
    case 'claude-code':
      return { bins: ['claude'], dirs: [joinFor(ctx, ctx.home, '.claude')], extensions: [] };
    case 'cursor':
      return {
        bins: ['cursor'],
        dirs: mac
          ? macApps(ctx, 'Cursor')
          : win
            ? [joinFor(ctx, localAppData(ctx), 'Programs', 'Cursor')]
            : [joinFor(ctx, ctx.home, '.cursor')],
        extensions: [],
      };
    case 'vscode':
      return {
        bins: ['code'],
        dirs: mac
          ? macApps(ctx, 'Visual Studio Code')
          : win
            ? [
                joinFor(ctx, localAppData(ctx), 'Programs', 'Microsoft VS Code'),
                joinFor(ctx, programFiles(ctx), 'Microsoft VS Code'),
              ]
            : ['/usr/share/code', joinFor(ctx, ctx.home, '.vscode')],
        extensions: [],
      };
    case 'windsurf':
      return {
        bins: ['windsurf'],
        dirs: mac
          ? macApps(ctx, 'Windsurf')
          : win
            ? [joinFor(ctx, localAppData(ctx), 'Programs', 'Windsurf')]
            : [joinFor(ctx, ctx.home, '.codeium', 'windsurf')],
        extensions: [],
      };
    case 'zed':
      return {
        bins: ['zed'],
        dirs: mac
          ? macApps(ctx, 'Zed', 'Zed Preview')
          : win
            ? [joinFor(ctx, localAppData(ctx), 'Zed')]
            : [joinFor(ctx, ctx.home, '.local', 'share', 'zed')],
        extensions: [],
      };
    case 'cline':
      return { bins: [], dirs: [], extensions: extension(ctx, 'saoudrizwan.claude-dev-') };
    case 'gemini-cli':
      return { bins: ['gemini'], dirs: [joinFor(ctx, ctx.home, '.gemini')], extensions: [] };
    case 'jetbrains':
      return {
        bins: [],
        dirs: [
          // The shared JetBrains data root exists once any JetBrains IDE has run.
          mac
            ? joinFor(ctx, ctx.home, 'Library', 'Application Support', 'JetBrains')
            : joinFor(ctx, userConfigDir(ctx), 'JetBrains'),
          joinFor(ctx, ctx.home, '.junie'), // the mcpfold fold target's dir
        ],
        extensions: [],
      };
    case 'visual-studio':
      return {
        bins: [],
        // vswhere ships with every modern VS install; the Program Files tree is the fallback.
        dirs: win
          ? [
              joinFor(
                ctx,
                ctx.env['ProgramFiles(x86)'] ?? 'C:\\Program Files (x86)',
                'Microsoft Visual Studio',
                'Installer',
                'vswhere.exe',
              ),
              joinFor(ctx, programFiles(ctx), 'Microsoft Visual Studio'),
            ]
          : [],
        extensions: [],
      };
    case 'continue':
      return {
        bins: ['cn'],
        dirs: [joinFor(ctx, ctx.home, '.continue')],
        extensions: extension(ctx, 'continue.continue-'),
      };
    case 'roo-code':
      return { bins: [], dirs: [], extensions: extension(ctx, 'rooveterinaryinc.roo-cline-') };
    case 'goose':
      return {
        bins: ['goose'],
        dirs: [
          joinFor(ctx, ctx.home, '.config', 'goose'),
          win
            ? joinFor(ctx, userConfigDir(ctx), 'Block', 'goose')
            : joinFor(ctx, ctx.home, '.local', 'bin', 'goose'),
        ],
        extensions: [],
      };
    case 'codex-cli':
      return {
        bins: ['codex'],
        dirs: [joinFor(ctx, ctx.env.CODEX_HOME ?? joinFor(ctx, ctx.home, '.codex'))],
        extensions: [],
      };
    case 'lm-studio':
      return {
        bins: [],
        dirs: [
          joinFor(ctx, ctx.home, '.lmstudio'),
          ...(mac
            ? macApps(ctx, 'LM Studio')
            : win
              ? [joinFor(ctx, localAppData(ctx), 'LM-Studio')]
              : []),
        ],
        extensions: [],
      };
    case 'warp':
      return {
        bins: ['warp-terminal'],
        dirs: mac
          ? macApps(ctx, 'Warp')
          : win
            ? [joinFor(ctx, localAppData(ctx), 'Programs', 'Warp')]
            : [joinFor(ctx, ctx.home, '.config', 'warp-terminal')],
        extensions: [],
      };
    case 'opencode':
      return {
        bins: ['opencode'],
        dirs: [joinFor(ctx, ctx.home, '.config', 'opencode'), joinFor(ctx, ctx.home, '.opencode')],
        extensions: [],
      };
    case 'copilot-cli':
      return {
        bins: ['copilot'],
        dirs: [joinFor(ctx, ctx.env.COPILOT_HOME ?? joinFor(ctx, ctx.home, '.copilot'))],
        extensions: [],
      };
    default:
      return empty;
  }
}
