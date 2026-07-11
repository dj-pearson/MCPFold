import { UsageError, type ResolvedServer } from '@mcpfold/core';
import { canonicalizeTools, handshake, type CanonicalTool } from '@mcpfold/proxy';
import { defaultProviders, resolveSecrets, type SecretProvider } from '@mcpfold/secrets';
import { loadConfigFromDisk } from '../util/config.js';
import { realTransport } from '../util/mcp-transport.js';
import {
  fileTrustGate,
  isExecutable,
  type ExecutableEntry,
  type TrustGate,
  untrustedServers,
} from '../trust/tofu.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold trust [name]` (S9.2) — the explicit confirmation step for config-as-code. Reviews
 * and approves the executable surface (command / args / pin) of new or changed servers so
 * `mcpfold run` will launch them. With a name, trusts that one server; with no name, trusts
 * every currently-untrusted executable server. This is what makes a synced/edited launch
 * command runnable — nothing executes without it.
 *
 * With `--tools` (S18.1) it additionally probes the named server's live tool surface and pins a
 * digest of it, so a later silent change to the tool definitions (a rug pull) is detected. Re-run
 * `trust <name> --tools` after reviewing a drift diff to re-approve.
 */

export interface TrustOptions {
  cwd: string;
  name?: string;
  gate?: TrustGate;
  /** Also probe + pin the server's tool surface (S18.1). Requires a name. */
  tools?: boolean;
  providers?: SecretProvider[];
  /** Injectable tool-surface probe (tests). Defaults to a live handshake over the real transport. */
  probeTools?: (server: ResolvedServer) => Promise<CanonicalTool[]>;
}

export interface TrustApproval {
  name: string;
  command?: string;
  args?: string[];
  pin?: string;
  /** Number of tool definitions pinned (S18.1), when --tools was used. */
  toolsPinned?: number;
}

export interface TrustData {
  approved: TrustApproval[];
}

function describe(name: string, entry: ExecutableEntry): TrustApproval {
  return { name, command: entry.command, args: entry.args, pin: entry.pin };
}

/** Default probe: open a live session and canonicalize the reported tool surface. */
async function liveProbe(
  server: ResolvedServer,
  providers?: SecretProvider[],
): Promise<CanonicalTool[]> {
  const [resolved] = await resolveSecrets([server], { providers: providers ?? defaultProviders() });
  const res = await handshake(realTransport(resolved!), { timeoutMs: 10_000 });
  if (!res.reachable) {
    throw new UsageError(
      `Could not reach "${server.name}" to record its tools: ${res.error ?? ''}`,
    );
  }
  return canonicalizeTools(res.tools ?? []);
}

export async function runTrust(options: TrustOptions): Promise<CommandOutput<TrustData>> {
  const { config } = loadConfigFromDisk(options.cwd);
  const gate = options.gate ?? fileTrustGate();

  if (options.tools && !options.name) {
    throw new UsageError('`trust --tools` needs a server name to pin its tool surface.', {
      hint: 'Run `mcpfold trust <server> --tools`.',
    });
  }

  if (options.name) {
    const server = config.servers[options.name];
    if (!server) {
      throw new UsageError(`No server "${options.name}" in the canonical config.`);
    }
    if (!isExecutable(server) && !options.tools) {
      throw new UsageError(`Server "${options.name}" has no local launch command to trust.`, {
        hint: 'Only stdio servers (with a `command`) are gated by trust. Use --tools to pin a remote server’s tool surface.',
      });
    }

    const approval: TrustApproval = { name: options.name };
    const lines: string[] = [];
    if (isExecutable(server)) {
      const entry: ExecutableEntry = {
        command: server.command,
        args: server.args,
        pin: server.pin,
        env: server.env,
      };
      gate.approve(options.name, entry);
      Object.assign(approval, describe(options.name, entry));
      lines.push(
        `✓ Trusted "${options.name}" → ${entry.command} ${(entry.args ?? []).join(' ')}`.trim(),
      );
    }

    if (options.tools) {
      const asResolved: ResolvedServer = {
        name: options.name,
        ...server,
        tags: server.tags ?? [],
        client: 'cursor',
        scope: 'user',
      };
      const surface = await (options.probeTools ?? ((s) => liveProbe(s, options.providers)))(
        asResolved,
      );
      gate.approveTools(options.name, surface);
      approval.toolsPinned = surface.length;
      lines.push(`✓ Pinned ${surface.length} tool definition(s) for "${options.name}".`);
    }

    return { data: { approved: [approval] }, human: lines.join('\n') };
  }

  const untrusted = untrustedServers(config, gate);
  if (untrusted.length === 0) {
    return { data: { approved: [] }, human: '✓ All executable servers are already trusted.' };
  }
  const approved: TrustApproval[] = [];
  const lines: string[] = ['Trusting the following launch commands:'];
  for (const u of untrusted) {
    gate.approve(u.name, u.entry);
    approved.push(describe(u.name, u.entry));
    lines.push(
      `  ✓ ${u.name} (${u.status}): ${u.entry.command} ${(u.entry.args ?? []).join(' ')}`.trim(),
    );
  }
  return { data: { approved }, human: lines.join('\n') };
}
