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
 * The registry, keyed implicitly by `from`. Today the canonical format is v1, so no
 * migration is applied to real configs. The hypothetical 1→2 entry below is a *worked
 * example* that exercises the runner end-to-end (it becomes real the day v2 ships).
 */
export const MIGRATIONS: Migration[] = [
  {
    from: 1,
    to: 2,
    description: "v1→v2 (example): rename each server's `tags` to `labels`",
    migrate: (config) => {
      const servers = config.servers as Record<string, Record<string, unknown>> | undefined;
      const migratedServers: Record<string, unknown> = {};
      for (const [name, server] of Object.entries(servers ?? {})) {
        const { tags, ...rest } = server;
        migratedServers[name] = { ...rest, labels: tags ?? [] };
      }
      return { ...config, version: 2, servers: migratedServers };
    },
  },
];
