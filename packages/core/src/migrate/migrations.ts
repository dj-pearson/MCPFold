/**
 * Config schema migrations (S0.7). Each migration transforms a config from version `from`
 * to `from + 1`. The runner applies them in sequence, so adding a v2 later is a one-entry
 * change here — the pipeline is already proven.
 */

export interface Migration {
  from: number;
  to: number;
  description: string;
  migrate: (config: Record<string, unknown>) => Record<string, unknown>;
}

/**
 * The registry, keyed implicitly by `from`. v2 (S17.5) is the first REAL migration: it renames the
 * remote transport `http` → the spec-canonical `streamable-http` (the wire semantics are identical,
 * so it is lossless), leaving `stdio` and the now-deprecated `sse` untouched. `mcpfold migrate`
 * persists it; `loadConfig` also applies it in-memory so a v1 file keeps loading.
 */
export const MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    description: 'v1→v2: canonicalize the `http` transport to `streamable-http`',
    migrate: (config) => {
      const servers = config.servers as Record<string, Record<string, unknown>> | undefined;
      const migratedServers: Record<string, unknown> = {};
      for (const [name, server] of Object.entries(servers ?? {})) {
        migratedServers[name] =
          server.transport === 'http' ? { ...server, transport: 'streamable-http' } : server;
      }
      return { ...config, version: 2, servers: migratedServers };
    },
  },
];
