import type { Config } from '@mcpfold/core';

/**
 * Cloud API client for the web console (S7.2) — talks to the edge push/pull functions with the
 * user's Supabase access token. Abstracted so e2e (VITE_E2E=1) uses an in-memory mock with no
 * backend. Mirrors the CLI's push/pull contract: config is refs-only and versions are append-only.
 */

export interface MachineStatus {
  name: string;
  lastSeen: string;
  lastVersion: number;
}

export interface VersionRecord {
  version: number;
  author: string;
  at: string;
}

export interface CloudApi {
  getConfig(): Promise<{ config: Config; version: number } | null>;
  saveConfig(config: Config): Promise<{ version: number }>;
  getMachines(): Promise<{ machines: MachineStatus[]; latestVersion: number }>;
  getVersionHistory(): Promise<VersionRecord[]>;
  revokeMachine(name: string): Promise<void>;
}

const API_BASE = import.meta.env.VITE_API_URL ?? 'https://api.mcpfold.com';

function httpCloudApi(base: string, getToken: () => string | null): CloudApi {
  const authHeader = (): Record<string, string> => {
    const token = getToken();
    return token ? { authorization: `Bearer ${token}` } : {};
  };
  return {
    async getConfig() {
      const res = await fetch(`${base}/pull`, { headers: authHeader() });
      if (res.status === 404) return null;
      if (!res.ok) throw new Error(`Could not load config (${res.status}).`);
      const data = await res.json();
      return { config: data.config as Config, version: data.version as number };
    },
    async saveConfig(config) {
      const res = await fetch(`${base}/push`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader() },
        body: JSON.stringify({ config }),
      });
      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(err.error ?? `Save failed (${res.status}).`);
      }
      const data = await res.json();
      return { version: data.version as number };
    },
    async getMachines() {
      const res = await fetch(`${base}/machines`, { headers: authHeader() });
      if (!res.ok) throw new Error(`Could not load machines (${res.status}).`);
      return (await res.json()) as { machines: MachineStatus[]; latestVersion: number };
    },
    async getVersionHistory() {
      const res = await fetch(`${base}/history`, { headers: authHeader() });
      if (!res.ok) throw new Error(`Could not load history (${res.status}).`);
      return (await res.json()) as VersionRecord[];
    },
    async revokeMachine(name) {
      const res = await fetch(`${base}/revoke`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeader() },
        body: JSON.stringify({ machine_name: name }),
      });
      if (!res.ok) throw new Error(`Could not revoke ${name} (${res.status}).`);
    },
  };
}

// A module-level in-memory mock so version state survives client-side navigation during e2e.
let mockSingleton: CloudApi | null = null;
function mockCloudApi(): CloudApi {
  let config: Config = { version: 1, servers: {}, profiles: {} };
  let version = 0;
  let machines: MachineStatus[] = [
    { name: 'laptop', lastSeen: '2026-07-08T10:00:00Z', lastVersion: 3 },
    { name: 'desktop', lastSeen: '2026-07-07T09:00:00Z', lastVersion: 2 },
  ];
  return {
    getConfig: () => Promise.resolve(version > 0 ? { config, version } : null),
    saveConfig: (next) => {
      config = next;
      version += 1;
      return Promise.resolve({ version });
    },
    getMachines: () => Promise.resolve({ latestVersion: 3, machines: [...machines] }),
    revokeMachine: (name) => {
      machines = machines.filter((m) => m.name !== name);
      return Promise.resolve();
    },
    getVersionHistory: () =>
      Promise.resolve([
        { version: 3, author: 'dev@mcpfold.com', at: '2026-07-08T10:00:00Z' },
        { version: 2, author: 'dev@mcpfold.com', at: '2026-07-07T09:00:00Z' },
        { version: 1, author: 'dev@mcpfold.com', at: '2026-07-06T08:00:00Z' },
      ]),
  };
}

export function createCloudApi(getToken: () => string | null): CloudApi {
  if (import.meta.env.VITE_E2E === '1') return (mockSingleton ??= mockCloudApi());
  return httpCloudApi(API_BASE, getToken);
}
