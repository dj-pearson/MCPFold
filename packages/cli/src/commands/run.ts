import { spawn } from 'node:child_process';
import { UsageError, type ResolvedServer } from '@mcpfold/core';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';

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
    const child = spawn(command, args, { stdio: 'inherit', env });
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

export interface RunOptions {
  cwd: string;
  name: string;
  providers?: SecretProvider[];
  /** Injectable spawner for tests. */
  spawnFn?: Spawner;
}

/** Rewrite an `@latest` package spec to the pinned version (supply-chain hygiene). */
function applyPin(args: string[] | undefined, pin: string | undefined): string[] | undefined {
  if (!args || !pin) return args;
  return args.map((a) => a.replace(/@latest$/, `@${pin}`));
}

/** Build `mcp-remote` args for a remote server, injecting resolved auth headers. */
function remoteArgs(server: ResolvedServer): string[] {
  const args = ['-y', 'mcp-remote', server.url ?? ''];
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
    return spawner(s.command ?? '', args, env);
  }
  // http / sse → bridge with mcp-remote and resolved headers.
  return spawner('npx', remoteArgs(s), { ...process.env });
}
