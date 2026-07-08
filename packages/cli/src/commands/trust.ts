import { UsageError } from '@mcpfold/core';
import { loadConfigFromDisk } from '../util/config.js';
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
 */

export interface TrustOptions {
  cwd: string;
  name?: string;
  gate?: TrustGate;
}

export interface TrustApproval {
  name: string;
  command?: string;
  args?: string[];
  pin?: string;
}

export interface TrustData {
  approved: TrustApproval[];
}

function describe(name: string, entry: ExecutableEntry): TrustApproval {
  return { name, command: entry.command, args: entry.args, pin: entry.pin };
}

export function runTrust(options: TrustOptions): CommandOutput<TrustData> {
  const { config } = loadConfigFromDisk(options.cwd);
  const gate = options.gate ?? fileTrustGate();

  if (options.name) {
    const server = config.servers[options.name];
    if (!server) {
      throw new UsageError(`No server "${options.name}" in the canonical config.`);
    }
    if (!isExecutable(server)) {
      throw new UsageError(`Server "${options.name}" has no local launch command to trust.`, {
        hint: 'Only stdio servers (with a `command`) are gated by trust.',
      });
    }
    const entry: ExecutableEntry = { command: server.command, args: server.args, pin: server.pin };
    gate.approve(options.name, entry);
    const approval = describe(options.name, entry);
    return {
      data: { approved: [approval] },
      human:
        `✓ Trusted "${options.name}" → ${entry.command} ${(entry.args ?? []).join(' ')}`.trim(),
    };
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
