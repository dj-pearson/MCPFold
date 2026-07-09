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
  createAuditRecorder,
  fileAuditSink,
  renderToolSurfaceDiff,
  streamTransport,
  type AuditRecorder,
  type PinnedToolsOptions,
} from '@mcpfold/proxy';
import { realOsContext, type OsContext } from '@mcpfold/adapters';
import { loadConfigFromDisk } from '../util/config.js';
import { checkServer, describeViolation, loadPolicy } from '../util/policy.js';
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
  audit?: AuditRecorder,
) => Promise<number>;

const defaultProxySpawner: ProxySpawner = (command, args, env, tools, pinned, audit) =>
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
    const dispose = connectProxy(clientTransport, serverTransport, {
      tools,
      pinnedTools: pinned,
      audit,
    });

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
  /**
   * Path to the redacted tool-call audit log (S18.4). When set, stdio servers are routed through
   * the proxy so calls are audited even without a tools directive. Defaults to MCPFOLD_AUDIT_LOG;
   * unset means auditing is off.
   */
  auditLogPath?: string;
  /** OS context for org-policy discovery (S18.3); defaults to the real environment. */
  osContext?: OsContext;
}

/** Rewrite an `@latest` package spec to the pinned version (supply-chain hygiene). */
function applyPin(args: string[] | undefined, pin: string | undefined): string[] | undefined {
  if (!args || !pin) return args;
  return args.map((a) => a.replace(/@latest$/, `@${pin}`));
}

/** Prefix for the per-header env vars that carry resolved secret values to mcp-remote (S16.4). */
const HEADER_ENV_PREFIX = 'MCPFOLD_HDR_';

/**
 * How `mcpfold run` reaches a remote server (S17.2). mcpfold prefers a direct connection where the
 * CLI itself can speak the remote transport — but it has no built-in streamable-HTTP/SSE MCP
 * transport today (adding one would pull a heavy client dep and *more* attack surface, the opposite
 * of this story's goal). So every remote currently falls back to the pinned `mcp-remote` bridge.
 *
 * This is the single, explicit decision point: when the CLI gains a native transport, return
 * `{ mode: 'direct' }` for the servers it can handle and the rest keep bridging unchanged.
 */
export type RemoteRunPlan = { mode: 'direct' } | { mode: 'bridge'; spec: string };

export function planRemoteRun(_server: ResolvedServer): RemoteRunPlan {
  return { mode: 'bridge', spec: MCP_REMOTE_SPEC };
}

/**
 * Build the `mcp-remote` invocation (args + env) for a remote server. The bridge is pinned to a
 * CVE-safe version via MCP_REMOTE_SPEC (see @mcpfold/core bridge.ts).
 *
 * S16.4: the resolved secret VALUE is never placed in argv, where any local user could read it
 * for the process lifetime. Instead each header value is passed through an environment variable and
 * referenced from the `--header` argument as `${MCPFOLD_HDR_n}`; mcp-remote (>=0.1.x) substitutes
 * `${VAR}` in header values from `process.env` at connect time. The argv therefore only ever
 * contains the non-secret placeholder.
 */
function remoteInvocation(server: ResolvedServer): { args: string[]; env: NodeJS.ProcessEnv } {
  const args = ['-y', MCP_REMOTE_SPEC, server.url ?? ''];
  const env: NodeJS.ProcessEnv = {};
  let n = 0;
  // Push a `Name: <prefix>${VAR}` header whose secret part lives only in the child env.
  const pushHeader = (name: string, literalPrefix: string, secret: string): void => {
    const varName = `${HEADER_ENV_PREFIX}${n++}`;
    env[varName] = secret;
    args.push('--header', `${name}: ${literalPrefix}\${${varName}}`);
  };

  if (server.auth?.type === 'bearer' && server.auth.token) {
    // Keep the non-secret "Bearer " scheme visible; only the token moves to the env.
    pushHeader('Authorization', 'Bearer ', server.auth.token);
  }
  for (const [k, v] of Object.entries(server.auth?.headers ?? {})) {
    // Custom header values may be secret in full → move the whole value to the env.
    pushHeader(k, '', v);
  }
  return { args, env };
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

  // Org policy (S18.3): deny always wins over local trust — a denied server never launches,
  // regardless of TOFU approval. Evaluated before the trust gate so policy can't be bypassed.
  const policyCtx = options.osContext ?? realOsContext();
  const violation = checkServer(loadPolicy(options.cwd, policyCtx), options.name, server);
  if (violation) {
    throw new UsageError(`Refusing to run "${options.name}": ${violation.decision.reason}.`, {
      hint: `Org policy blocks this server — ${describeViolation(violation)}. Contact your platform team.`,
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

    // Redacted tool-call audit log (S18.4): opt-in via --audit-log / MCPFOLD_AUDIT_LOG. When on,
    // route stdio through the proxy so calls are logged even without a tools directive.
    const auditLogPath = options.auditLogPath ?? process.env.MCPFOLD_AUDIT_LOG;
    const audit: AuditRecorder | undefined = auditLogPath
      ? createAuditRecorder({
          server: options.name,
          sink: fileAuditSink(auditLogPath, { warn }),
        })
      : undefined;

    // S5.3: when the server declares a `tools` directive, has a pinned surface, or auditing is on,
    // route stdio through the proxy. With none of these, plain passthrough — no proxy overhead.
    if (s.tools || pinned || audit) {
      const proxySpawner = options.proxySpawnFn ?? defaultProxySpawner;
      return proxySpawner(s.command ?? '', args, env, s.tools, pinned, audit);
    }
    return spawner(s.command ?? '', args, env);
  }
  // http / sse (S17.2): prefer a direct connection where the CLI can; today it can't, so fall back
  // to the pinned mcp-remote bridge. Resolved auth values travel via env (S16.4), never argv.
  const plan = planRemoteRun(s);
  if (plan.mode === 'direct') {
    // Reserved for a future native transport; no code path reaches here yet (see planRemoteRun).
    throw new UsageError(`Direct remote connection is not implemented for "${options.name}".`, {
      hint: 'This build bridges remote servers with mcp-remote; update planRemoteRun to add a native path.',
    });
  }
  const remote = remoteInvocation(s);
  return spawner('npx', remote.args, { ...process.env, ...remote.env });
}
