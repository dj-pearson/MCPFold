import { UsageError } from '@mcpfold/core';
import type { RegistryServer } from './map.js';

/**
 * Client for the official MCP registry (S17.7) — `registry.modelcontextprotocol.io`, v0 API (frozen
 * Oct 2025). The base URL is overridable via `MCPFOLD_REGISTRY_URL` for subregistries / self-hosted
 * mirrors. The `fetch` layer is injectable so tests run offline; network failures raise an
 * actionable, degraded-mode error (S0.9) — the caller writes nothing on failure.
 */

export const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';

type FetchLike = typeof fetch;

/** One search hit, flattened to what `mcpfold search` shows. */
export interface RegistrySearchResult {
  name: string;
  description: string;
  version: string;
}

export interface RegistryClient {
  /** Search the registry; returns matching servers (name, description, latest version). */
  search(query: string, limit?: number): Promise<RegistrySearchResult[]>;
  /** Fetch the latest `server.json` for an exact reverse-DNS name, or throw if not found. */
  getByName(name: string): Promise<RegistryServer>;
}

/** The registry base URL: `$MCPFOLD_REGISTRY_URL` or the official default. */
export function registryBaseUrl(env: NodeJS.ProcessEnv = process.env): string {
  return (env.MCPFOLD_REGISTRY_URL ?? DEFAULT_REGISTRY_URL).replace(/\/+$/, '');
}

interface RegistryItem {
  server: RegistryServer;
  _meta?: { 'io.modelcontextprotocol.registry/official'?: { isLatest?: boolean } };
}
interface ListResponse {
  servers?: RegistryItem[];
}

export function httpRegistryClient(
  base: string = registryBaseUrl(),
  fetchImpl: FetchLike = fetch,
): RegistryClient {
  const getJson = async (path: string): Promise<ListResponse> => {
    let res: Response;
    try {
      res = await fetchImpl(`${base}${path}`, { headers: { accept: 'application/json' } });
    } catch (error) {
      // Network is down / host unreachable — the degraded-mode contract (S0.9): fail clearly.
      throw new UsageError(
        `Can't reach the MCP registry at ${base} (${error instanceof Error ? error.message : 'network error'}).`,
        {
          hint: 'Check your connection, or set MCPFOLD_REGISTRY_URL to a reachable mirror. Nothing was written.',
        },
      );
    }
    if (!res.ok) {
      throw new UsageError(`Registry request failed (${res.status}) for ${path}.`, {
        hint: 'The registry returned an error; try again, or check the server name/query.',
      });
    }
    return (await res.json()) as ListResponse;
  };

  const isLatest = (item: RegistryItem): boolean =>
    item._meta?.['io.modelcontextprotocol.registry/official']?.isLatest !== false;

  return {
    async search(query, limit = 20) {
      const body = await getJson(`/v0/servers?search=${encodeURIComponent(query)}&limit=${limit}`);
      return (body.servers ?? []).filter(isLatest).map((item) => ({
        name: item.server.name,
        description: item.server.description ?? '',
        version: item.server.version ?? '',
      }));
    },

    async getByName(name) {
      const body = await getJson(`/v0/servers?search=${encodeURIComponent(name)}&limit=50`);
      // The search is fuzzy; take the exact-name, latest entry.
      const match = (body.servers ?? []).find(
        (item) => item.server.name === name && isLatest(item),
      );
      if (!match) {
        throw new UsageError(`No registry server named "${name}".`, {
          hint: 'Use `mcpfold search <query>` to find the exact reverse-DNS name (e.g. io.github.owner/name).',
        });
      }
      return match.server;
    },
  };
}
