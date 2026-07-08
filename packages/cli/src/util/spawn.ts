/**
 * Cross-platform executable resolution for spawned MCP servers (S16.2).
 *
 * On POSIX, `spawn('npx', args)` just works. On Windows it does not: Node won't resolve a bare
 * `npx` to `npx.cmd`, and — since the CVE-2024-27980 fix — refuses to launch a `.cmd`/`.bat`
 * without `shell: true`. Most stdio MCP servers launch via npx/uvx, so the `run` shim is broken on
 * Windows without this. We deliberately do NOT use a blanket `shell: true` (that would re-expose
 * argument injection); instead we resolve the real executable through PATH + PATHEXT and, only when
 * the resolved target is a batch script, invoke the interpreter with hand-escaped, verbatim
 * arguments (the cross-spawn technique) so untrusted args are never parsed by a shell.
 *
 * The resolver is a pure function with injectable platform/env/fs so both the win32 and posix
 * branches are unit-testable on any host. Every spawner (run plain, run proxy, test, remote bridge)
 * goes through {@link resolveCommand} so behavior can't drift between launchers.
 */
import { existsSync } from 'node:fs';

export interface ResolveOptions {
  /** Defaults to `process.platform`. */
  platform?: NodeJS.Platform;
  /** Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv;
  /** Defaults to `node:fs` existsSync. Injected for tests. */
  fileExists?: (path: string) => boolean;
}

export interface ResolvedCommand {
  command: string;
  args: string[];
  /**
   * True only when we hand-built the command line for the interpreter and Node must pass it
   * through verbatim (no re-quoting). Spread into the spawn options as `windowsVerbatimArguments`.
   */
  windowsVerbatimArguments: boolean;
}

const DEFAULT_PATHEXT = '.COM;.EXE;.BAT;.CMD;.VBS;.JS;.WS';

/** Windows path separator handling is done by hand so the win32 branch is testable on POSIX. */
function joinWin(dir: string, file: string): string {
  return /[\\/]$/.test(dir) ? `${dir}${file}` : `${dir}\\${file}`;
}

/** Resolve a bare/relative Windows command to a concrete file using PATH + PATHEXT. */
function resolveWindowsExecutable(
  command: string,
  env: NodeJS.ProcessEnv,
  fileExists: (p: string) => boolean,
): string | undefined {
  const pathext = (env.PATHEXT ?? DEFAULT_PATHEXT).split(';').filter(Boolean);
  const lower = command.toLowerCase();
  const hasExt = pathext.some((ext) => lower.endsWith(ext.toLowerCase()));
  const hasSep = command.includes('\\') || command.includes('/');

  const tryFile = (base: string): string | undefined => {
    if (hasExt && fileExists(base)) return base;
    for (const ext of pathext) if (fileExists(base + ext)) return base + ext;
    return undefined;
  };

  if (hasSep) {
    // Explicit path (relative or absolute): resolve extension in place, else trust as-is.
    return tryFile(command) ?? (hasExt ? command : undefined);
  }

  const rawPath = env.Path ?? env.PATH ?? '';
  const dirs = rawPath.split(';').filter(Boolean);
  for (const dir of dirs) {
    const found = tryFile(joinWin(dir, command));
    if (found) return found;
  }
  return undefined;
}

/**
 * Escape a single argument for a `cmd.exe /c` command line (cross-spawn's algorithm). The result
 * is embedded verbatim, so cmd's meta-characters are neutralized with `^` and inner quotes are
 * backslash-escaped — the child receives the exact original argument, never a shell-parsed one.
 */
export function escapeCmdArgument(arg: string): string {
  let out = `${arg}`;
  // Escape any double quotes, doubling the backslashes that precede them.
  out = out.replace(/(\\*)"/g, '$1$1\\"');
  // Double the trailing backslashes so the closing quote isn't escaped.
  out = out.replace(/(\\*)$/, '$1$1');
  // Surround with quotes.
  out = `"${out}"`;
  // Escape cmd meta-characters so nothing is interpreted before reaching the program.
  out = out.replace(/[ !%^&()<>|"]/g, '^$&');
  return out;
}

/**
 * Resolve a command + args for the current platform. On POSIX this is a no-op passthrough. On
 * win32 it resolves the real executable and, for `.cmd`/`.bat` targets, wraps them in the command
 * interpreter with escaped verbatim args.
 */
export function resolveCommand(
  command: string,
  args: string[],
  opts: ResolveOptions = {},
): ResolvedCommand {
  const platform = opts.platform ?? process.platform;
  if (platform !== 'win32') {
    return { command, args, windowsVerbatimArguments: false };
  }

  const env = opts.env ?? process.env;
  const fileExists = opts.fileExists ?? existsSync;
  const resolved = resolveWindowsExecutable(command, env, fileExists) ?? command;

  if (/\.(cmd|bat)$/i.test(resolved)) {
    const comspec = env.ComSpec ?? env.COMSPEC ?? 'cmd.exe';
    const line = [resolved, ...args].map(escapeCmdArgument).join(' ');
    // /d skips AutoRun scripts, /s + surrounding quotes preserve the line verbatim, /c runs it.
    return {
      command: comspec,
      args: ['/d', '/s', '/c', `"${line}"`],
      windowsVerbatimArguments: true,
    };
  }

  return { command: resolved, args, windowsVerbatimArguments: false };
}
