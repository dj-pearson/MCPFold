import { UsageError } from '@mcpfold/core';
import {
  httpRegistryClient,
  type RegistryClient,
  type RegistrySearchResult,
} from '../registry/client.js';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold search <query>` (S17.7) — search the official MCP registry and list matching servers
 * (reverse-DNS name, description, latest version). Feed a result into
 * `mcpfold add <name> --from-registry` to pin it into your config. `--json` for scripting.
 */

export interface SearchOptions {
  query: string;
  limit?: number;
  /** Injectable registry client; defaults to the real HTTP client. */
  registry?: RegistryClient;
}

export interface SearchData {
  query: string;
  results: RegistrySearchResult[];
}

export async function runSearch(options: SearchOptions): Promise<CommandOutput<SearchData>> {
  const query = options.query.trim();
  if (!query) {
    throw new UsageError('Provide a search query, e.g. `mcpfold search github`.');
  }
  const client = options.registry ?? httpRegistryClient();
  const results = await client.search(query, options.limit);
  return {
    data: { query, results },
    human: renderHuman(query, results),
  };
}

function renderHuman(query: string, results: RegistrySearchResult[]): string {
  if (results.length === 0) return `No registry servers match "${query}".`;
  const lines = results.map((r) => {
    const desc = r.description.length > 72 ? `${r.description.slice(0, 69)}…` : r.description;
    return `  ${r.name}  ${r.version ? `(${r.version})` : ''}\n    ${desc}`;
  });
  return [
    `${results.length} registry server(s) matching "${query}":`,
    '',
    ...lines,
    '',
    'Add one with: mcpfold add <name> --from-registry',
  ].join('\n');
}
