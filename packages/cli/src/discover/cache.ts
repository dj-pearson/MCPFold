import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import type { Transport } from '@mcpfold/core';

/**
 * Per-user tool-surface discovery cache (S24.6). A discovery run records, per server, the redacted
 * tool surface — tool NAMES and per-tool / per-server token estimates only. NO secret value and NO
 * tool-call payload is ever written here (the snapshot is built from the tools/list schema, which is
 * public server metadata; nothing from `env`/`auth`/call params reaches it). Curate reads it to know
 * the full tool universe (allow/deny/no-directive), and `mcpfold inspect` reads/writes it.
 */

/** One tool's redacted footprint: its name and what its definition costs the model each request. */
export interface ToolTokenEstimate {
  name: string;
  /** Estimated tokens the tool's serialized definition adds to context (benchmark method). */
  tokens: number;
}

/** A redacted snapshot of one server's live tool surface at discovery time. */
export interface SurfaceSnapshot {
  server: string;
  /** ISO timestamp of capture. */
  capturedAt: string;
  transport: Transport;
  /** The negotiated MCP protocol version, when the handshake reported one. */
  protocolVersion?: string;
  toolCount: number;
  /** Sum of every tool's token estimate — the server's full-surface context cost. */
  totalTokens: number;
  /** Tool names + per-tool token estimates, sorted by name for stable output. */
  tools: ToolTokenEstimate[];
}

/**
 * The per-user discovery-cache directory. Mirrors the trust store's location convention
 * (`$XDG_CONFIG_HOME|$APPDATA/mcpfold`) so all local mcpfold state lives together; never synced.
 */
export function discoveryCacheDir(
  home: string = homedir(),
  platform: NodeJS.Platform = process.platform,
  env: NodeJS.ProcessEnv = process.env,
): string {
  if (platform === 'win32') {
    const base = env.APPDATA ?? join(home, 'AppData', 'Roaming');
    return join(base, 'mcpfold', 'discovery');
  }
  const base = env.XDG_CONFIG_HOME ?? join(home, '.config');
  return join(base, 'mcpfold', 'discovery');
}

/** Sanitize a server name into a safe cache filename (server names are freeform config keys). */
function snapshotFile(dir: string, server: string): string {
  const safe = server.replace(/[^a-zA-Z0-9._-]/g, '_');
  return join(dir, `${safe}.json`);
}

/** Options for locating the cache — injectable so tests never touch the real user directory. */
export interface CacheLocation {
  dir?: string;
  home?: string;
  platform?: NodeJS.Platform;
  env?: NodeJS.ProcessEnv;
}

function resolveDir(loc: CacheLocation): string {
  return loc.dir ?? discoveryCacheDir(loc.home, loc.platform, loc.env);
}

/** Persist a discovery snapshot, creating the cache directory as needed. */
export function writeSnapshot(snapshot: SurfaceSnapshot, loc: CacheLocation = {}): string {
  const path = snapshotFile(resolveDir(loc), snapshot.server);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(snapshot, null, 2)}\n`);
  return path;
}

/** Read a server's cached snapshot, or null when none exists / it is unreadable. */
export function readSnapshot(server: string, loc: CacheLocation = {}): SurfaceSnapshot | null {
  const path = snapshotFile(resolveDir(loc), server);
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as SurfaceSnapshot;
  } catch {
    return null;
  }
}

/** The cached tool NAMES for a server, or null when no snapshot exists (curate's knownTools source). */
export function cachedToolNames(server: string, loc: CacheLocation = {}): string[] | null {
  const snapshot = readSnapshot(server, loc);
  if (!snapshot) return null;
  return snapshot.tools.map((t) => t.name);
}

/** List every server that has a cached snapshot (for a whole-config inspect / audit). */
export function listSnapshotServers(loc: CacheLocation = {}): string[] {
  const dir = resolveDir(loc);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => f.slice(0, -'.json'.length));
}
