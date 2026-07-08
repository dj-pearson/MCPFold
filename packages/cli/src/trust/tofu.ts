import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Config, ServerConfig } from '@mcpfold/core';

/**
 * Trust-on-first-use for config-as-code (S9.2). `mcpfold run` execs a server's `command`/`args`,
 * and `pull` writes that config from the cloud — a code-execution channel. Like SSH host keys,
 * we record a signature of each server's *executable surface* (command + args + pin) the first
 * time the user approves it; a new or changed surface must be explicitly re-approved before it
 * can run. This blocks a tampered or malicious synced config from silently executing code.
 */

/** The runnable surface of a server — the only fields that decide what actually executes. */
export interface ExecutableEntry {
  command?: string;
  args?: string[];
  pin?: string;
}

export type TrustStatus = 'trusted' | 'new' | 'changed';

/** A server has an executable surface worth trusting only when it launches a local command. */
export function isExecutable(server: Pick<ServerConfig, 'transport' | 'command'>): boolean {
  return server.transport === 'stdio' && typeof server.command === 'string';
}

/** A stable hash of exactly the fields that determine what code runs. */
export function executableSignature(entry: ExecutableEntry): string {
  const stable = JSON.stringify({
    command: entry.command ?? null,
    args: entry.args ?? [],
    pin: entry.pin ?? null,
  });
  return createHash('sha256').update(stable).digest('hex');
}

interface TrustFile {
  version: 1;
  entries: Record<string, string>; // server name → approved signature
}

export interface TrustGate {
  status(name: string, entry: ExecutableEntry): TrustStatus;
  isTrusted(name: string, entry: ExecutableEntry): boolean;
  approve(name: string, entry: ExecutableEntry): void;
}

function makeGate(read: () => TrustFile, write: (f: TrustFile) => void): TrustGate {
  return {
    status(name, entry) {
      const approved = read().entries[name];
      if (!approved) return 'new';
      return approved === executableSignature(entry) ? 'trusted' : 'changed';
    },
    isTrusted(name, entry) {
      return read().entries[name] === executableSignature(entry);
    },
    approve(name, entry) {
      const file = read();
      file.entries[name] = executableSignature(entry);
      write(file);
    },
  };
}

/** The per-machine trust store path (never synced — trust is a local decision). */
export function defaultTrustPath(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
): string {
  if (platform === 'win32') {
    const base = process.env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(base, 'mcpfold', 'trust.json');
  }
  const base = process.env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(base, 'mcpfold', 'trust.json');
}

/** A trust gate backed by a JSON file on disk. */
export function fileTrustGate(path: string = defaultTrustPath()): TrustGate {
  const read = (): TrustFile => {
    if (!existsSync(path)) return { version: 1, entries: {} };
    try {
      const parsed = JSON.parse(readFileSync(path, 'utf8')) as TrustFile;
      return parsed.entries ? parsed : { version: 1, entries: {} };
    } catch {
      return { version: 1, entries: {} };
    }
  };
  const write = (file: TrustFile): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(file, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  };
  return makeGate(read, write);
}

/** An in-memory trust gate for tests; optionally pre-approving entries by name→signature. */
export function memoryTrustGate(seed: Record<string, string> = {}): TrustGate {
  let file: TrustFile = { version: 1, entries: { ...seed } };
  return makeGate(
    () => file,
    (f) => {
      file = f;
    },
  );
}

export interface UntrustedServer {
  name: string;
  status: 'new' | 'changed';
  entry: ExecutableEntry;
}

/** Every executable server in the config whose surface is not currently trusted. */
export function untrustedServers(config: Config, gate: TrustGate): UntrustedServer[] {
  const out: UntrustedServer[] = [];
  for (const [name, server] of Object.entries(config.servers)) {
    if (!isExecutable(server)) continue;
    const entry: ExecutableEntry = { command: server.command, args: server.args, pin: server.pin };
    const status = gate.status(name, entry);
    if (status !== 'trusted') out.push({ name, status, entry });
  }
  return out;
}
