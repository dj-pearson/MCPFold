import { spawn } from 'node:child_process';
import {
  MCP_REMOTE_SPEC,
  UsageError,
  type ResolvedServer,
  type ToolsDirective,
} from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import {
  connectProxy,
  renderToolSurfaceDiff,
  streamTransport,
  type PinnedToolsOptions,
} from '@mcpfold/proxy';
import { loadConfigFromDisk } from '../util/config.js';
import { fileTrustGate, isExecutable, type TrustGate } from '../trust/tofu.js';
import { resolveCommand } from '../util/spawn.js';

/**
 * `mcpfold run <name>` (S4.7) — the shim launcher the `shim` strategy points clients at.
 * Reads the canonical config, resolves the named server's secret references via the
 * providers, injects them, and execs the real server transparently (stdio passthrough) or
 * bridges a remote server with `mcp-remote` and the resolved auth headers.
 *
 * The resolved secret is NEVER printed. On resolution failure it throws a coded error (the
 * CLI maps it to exit 2) without leaking. SIGINT/SIGTERM are forwarded to the child.
 */

/** Spawns `command args` with `env`, forwards signals, and resolves to the child exit code. */
export type Spawner = (command: string, args: string[], env: NodeJS.ProcessEnv) => Promise<number>;

const defaultSpawner: Spawner = (command, args, env) =>
  new Promise<number>((resolve) => {
    const r = resolveCommand(command, args);
    const child = spawn(r.command, r.args, {
      stdio: 'inherit',
      env,
      windowsVerbatimArguments: r.windowsVerbatimArguments,
    });
    const forward = (signal: NodeJS.Signals): void => {
      if (!child.killed) child.kill(signal);
    };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('error', () => resolve(127));
    child.on('exit', (code, signal) => {
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve(code ?? (signal ? 1 : 0));
    });
  });

/** Spawns a piped child and proxies its stdio through the tool filter; resolves to exit code. */
export type ProxySpawner = (
  command: string,
  args: string[],
  env: NodeJS.ProcessEnv,
  tools: ToolsDirective | undefined,
  pinned?: PinnedToolsOptions,
) => Promise<number>;

const defaultProxySpawner: ProxySpawner = (command, args, env, tools, pinned) =>
  new Promise<number>((resolve) => {
    // stderr is inherited so the server's logs still reach the terminal; stdin/stdout are
    // piped so the proxy can sit between the MCP client (our process) and the real server.
    const r = resolveCommand(command, args);
    const child = spawn(r.command, r.args, {
      stdio: ['pipe', 'pipe', 'inherit'],
      env,
      windowsVerbatimArguments: r.windowsVerbatimArguments,
    });
    const clientTransport = streamTransport(process.stdin, process.stdout);
    const serverTransport = streamTransport(child.stdout!, child.stdin!);
    const dispose = connectProxy(clientTransport, serverTransport, { tools, pinnedTools: pinned });

    const forward = (signal: NodeJS.Signals): void => {
      if (!child.killed) child.kill(signal);
    };
    process.on('SIGINT', forward);
    process.on('SIGTERM', forward);
    child.on('error', () => {
      dispose();
      resolve(127);
    });
    child.on('exit', (code, signal) => {
      dispose();
      process.off('SIGINT', forward);
      process.off('SIGTERM', forward);
      resolve(code ?? (signal ? 1 : 0));
    });
  });

/** True when a server should launch behind the tool-filtering proxy (S5.3). */
export function shouldUseProxy(server: { transport: string; tools?: ToolsDirective }): boolean {
  return server.transport === 'stdio' && server.tools !== undefined;
}

export interface RunOptions {
  cwd: string;
  name: string;
  providers?: SecretProvider[];
  /** Injectable plain spawner for tests. */
  spawnFn?: Spawner;
  /** Injectable proxy spawner for tests. */
  proxySpawnFn?: ProxySpawner;
  /** Trust gate (TOFU); defaults to the per-machine trust store. Injectable for tests. */
  trust?: TrustGate;
  /** Block (not just warn) when the tool surface drifts from the pinned one (S18.1). */
  strictTools?: boolean;
  /** Sink for the drift warning line(s); defaults to stderr. Injectable for tests. */
  warn?: (line: string) => void;
}

/** Rewrite an `@latest` package spec to the pinned version (supply-chain hygiene). */
function applyPin(args: string[] | undefined, pin: string | undefined): string[] | undefined {
  if (!args || !pin) return args;
  return args.map((a) => a.replace(/@latest$/, `@${pin}`));
}

/** Build `mcp-remote` args for a remote server, injecting resolved auth headers. The bridge is
 * pinned to a CVE-safe version via MCP_REMOTE_SPEC (see @mcpfold/core bridge.ts). */
function remoteArgs(server: ResolvedServer): string[] {
  const args = ['-y', MCP_REMOTE_SPEC, server.url ?? ''];
  if (server.auth?.type === 'bearer' && server.auth.token) {
    args.push('--header', `Authorization: Bearer ${server.auth.token}`);
  }
  for (const [k, v] of Object.entries(server.auth?.headers ?? {})) {
    args.push('--header', `${k}: ${v}`);
  }
  return args;
}

export async function runRun(options: RunOptions): Promise<number> {
  const providers = options.providers ?? defaultProviders(options.cwd);
  const spawner = options.spawnFn ?? defaultSpawner;

  const { config } = loadConfigFromDisk(options.cwd);
  const server = config.servers[options.name];
  if (!server) {
    throw new UsageError(`No server "${options.name}" in the canonical config.`, {
      hint: 'Check the server name, or add it and run `mcpfold sync`.',
    });
  }

  const trust = options.trust ?? fileTrustGate();

  // Config-as-code TOFU gate (S9.2): never exec a launch command that hasn't been trusted.
  if (isExecutable(server)) {
    const entry = { command: server.command, args: server.args, pin: server.pin };
    if (!trust.isTrusted(options.name, entry)) {
      const st = trust.status(options.name, entry);
      throw new UsageError(
        `Refusing to run "${options.name}": its launch command is ${st === 'changed' ? 'CHANGED' : 'not yet trusted'}.`,
        { hint: `Review it, then run \`mcpfold trust ${options.name}\` to approve.` },
      );
    }
  }

  const asResolved: ResolvedServer = {
    name: options.name,
    ...server,
    client: 'claude-code',
    scope: 'user',
  };
  const [resolved] = await resolveSecrets([asResolved], { providers });
  const s = resolved!;

  if (s.transport === 'stdio') {
    const args = applyPin(s.args, s.pin) ?? [];
    const env: NodeJS.ProcessEnv = { ...process.env, ...(s.env ?? {}) };

    // Tool-definition pinning (S18.1): if this server's tool surface was pinned, verify it live at
    // the proxy — warn by default, block with strictTools. This is the enforcement point for
    // PROXIED stdio servers (non-proxied get the test-time check in `mcpfold test`).
    const trustedSurface = trust.trustedTools(options.name);
    const warn = options.warn ?? ((line: string) => process.stderr.write(`${line}\n`));
    const pinned: PinnedToolsOptions | undefined = trustedSurface && {
      surface: trustedSurface.surface,
      mode: options.strictTools ? 'block' : 'warn',
      onDrift: (diff) => {
        warn(`⚠ mcpfold: tool definitions for "${options.name}" changed since you trusted it:`);
        warn(renderToolSurfaceDiff(diff));
        warn(`  Review, then re-run \`mcpfold trust ${options.name} --tools\` to approve.`);
      },
    };

    // S5.3: when the server declares a `tools` directive OR has a pinned surface, route stdio
    // through the proxy. With neither, plain passthrough — no proxy overhead.
    if (s.tools || pinned) {
      const proxySpawner = options.proxySpawnFn ?? defaultProxySpawner;
      return proxySpawner(s.command ?? '', args, env, s.tools, pinned);
    }
    return spawner(s.command ?? '', args, env);
  }
  // http / sse → bridge with mcp-remote and resolved headers.
  return spawner('npx', remoteArgs(s), { ...process.env });
}
