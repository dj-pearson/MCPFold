import { UsageError } from '@mcpfold/core';
import type { RegistryServer } from './map.js';

/**
 * Client for the official MCP registry (S17.7) — `registry.modelcontextprotocol.io`, v0 API (frozen
 * Oct 2025). The base URL is overridable via `MCPFOLD_REGISTRY_URL` for subregistries / self-hosted
 * mirrors. The `fetch` layer is injectable so tests run offline; network failures raise an
 * actionable, degraded-mode error (S0.9) — the caller writes nothing on failure.
 */

export const DEFAULT_REGISTRY_URL = 'https://registry.modelcontextprotocol.io';

/** Fail fast if a mirror accepts the connection but never responds (S22.18). */
const DEFAULT_TIMEOUT_MS = 15_000;
/** Bound the response body so a mirror can't stream unbounded data into memory (S22.18). */
const MAX_RESPONSE_BYTES = 8 * 1024 * 1024;

type FetchLike = typeof fetch;

export interface RegistryClientOptions {
  /** Per-request timeout in ms (default 15s). */
  timeoutMs?: number;
  /** Max response body size in bytes (default 8 MiB). */
  maxResponseBytes?: number;
}

/** Read a response body as text, capping it at `maxBytes`; falls back to `json()` for non-stream
 * mocks. Throws a degraded-mode UsageError past the cap (S22.18). */
async function readBoundedJson(res: Response, maxBytes: number): Promise<unknown> {
  const oversize = (): UsageError =>
    new UsageError(`The MCP registry response was too large (> ${maxBytes} bytes).`, {
      hint: 'Refusing to buffer an unbounded response. Nothing was written.',
    });
  // Reject up front on a declared oversize.
  const declared = Number(res.headers?.get?.('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) throw oversize();

  const body = res.body as ReadableStream<Uint8Array> | null | undefined;
  if (!body || typeof body.getReader !== 'function') {
    // A test mock without a real stream — nothing to meter, so read directly.
    return res.json();
  }
  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (!value) continue;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel();
      throw oversize();
    }
    chunks.push(value);
  }
  const merged = new Uint8Array(total);
  let offset = 0;
  for (const c of chunks) {
    merged.set(c, offset);
    offset += c.byteLength;
  }
  return JSON.parse(new TextDecoder().decode(merged));
}

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
  opts: RegistryClientOptions = {},
): RegistryClient {
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = opts.maxResponseBytes ?? MAX_RESPONSE_BYTES;
  const getJson = async (path: string): Promise<ListResponse> => {
    let res: Response;
    try {
      // S22.18: bound the request in time so a mirror that accepts the connection but never responds
      // can't hang the CLI forever (the S0.9 fail-clearly contract).
      res = await fetchImpl(`${base}${path}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut =
        error instanceof Error && (error.name === 'TimeoutError' || error.name === 'AbortError');
      // Network is down / host unreachable / timed out — the degraded-mode contract (S0.9).
      throw new UsageError(
        timedOut
          ? `The MCP registry at ${base} did not respond within ${Math.round(timeoutMs / 1000)}s.`
          : `Can't reach the MCP registry at ${base} (${error instanceof Error ? error.message : 'network error'}).`,
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
    return (await readBoundedJson(res, maxResponseBytes)) as ListResponse;
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
