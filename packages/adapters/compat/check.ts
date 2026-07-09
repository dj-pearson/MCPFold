import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';

/**
 * Live-client compatibility harness (S14.2). Adapters render to committed fixtures; if a client
 * changes its on-disk config format upstream, mcpfold can silently produce a file the client no
 * longer accepts. This compares each adapter's rendered SHAPE (root keys + server-entry keys)
 * against a captured/pulled sample of the client's accepted format and flags divergence — so drift
 * surfaces in CI, not for users.
 *
 * Pure + injectable: `runCompatCheck` takes the rendered output per client and the samples, and an
 * optional `fetchLatest` for clients that publish a schema (skips cleanly when it's unavailable).
 */

/** On-disk config format of a client (S19.2 adds non-JSON clients). Defaults to `json`. */
export type CompatFormat = 'json' | 'yaml' | 'toml';

export interface CompatSample {
  client: string;
  /** Where the accepted-format sample comes from. `url` samples are pulled live; `captured` ones
   *  are a versioned snapshot refreshed by hand (see compat/README.md). */
  source: { type: 'captured' | 'url'; url?: string; capturedAt: string };
  /** The client's config file format. Omit for JSON (the default). */
  format?: CompatFormat;
  /** Top-level keys the client's config accepts. */
  rootKeys: string[];
  /** The root key whose values are the per-server entries. */
  serverContainer: string;
  /** Keys a server entry may contain. */
  entryKeys: string[];
}

/** Parse a rendered client config of any supported format into a plain object. */
function parseConfig(rendered: string, format: CompatFormat): Record<string, unknown> {
  if (format === 'yaml') return (parseYaml(rendered) ?? {}) as Record<string, unknown>;
  if (format === 'toml') return (parseToml(rendered) ?? {}) as Record<string, unknown>;
  return JSON.parse(rendered) as Record<string, unknown>;
}

export type CompatStatus = 'ok' | 'divergent' | 'skipped';

export interface CompatResult {
  client: string;
  status: CompatStatus;
  /** Human-readable divergences (empty for ok/skipped). */
  divergence: string[];
  reason?: string;
}

/** Extract the structural shape of a rendered client config. */
export function shapeOf(
  rendered: string,
  serverContainer: string,
  format: CompatFormat = 'json',
): { rootKeys: string[]; entryKeys: string[] } {
  const json = parseConfig(rendered, format);
  const rootKeys = Object.keys(json).sort();
  const container = (json[serverContainer] ?? {}) as Record<string, unknown>;
  const entryKeys = new Set<string>();
  for (const entry of Object.values(container)) {
    if (entry && typeof entry === 'object') {
      for (const k of Object.keys(entry as Record<string, unknown>)) entryKeys.add(k);
    }
  }
  return { rootKeys, entryKeys: [...entryKeys].sort() };
}

/** Compare one adapter's rendered output against the client's accepted-format sample. */
export function checkAdapter(rendered: string, sample: CompatSample): CompatResult {
  const shape = shapeOf(rendered, sample.serverContainer, sample.format ?? 'json');
  const divergence: string[] = [];

  for (const k of shape.rootKeys.filter((x) => !sample.rootKeys.includes(x))) {
    divergence.push(`renders root key "${k}", not in ${sample.client}'s accepted keys`);
  }
  for (const k of sample.rootKeys.filter((x) => !shape.rootKeys.includes(x))) {
    divergence.push(`${sample.client} expects root key "${k}", but the adapter does not render it`);
  }
  for (const k of shape.entryKeys.filter((x) => !sample.entryKeys.includes(x))) {
    divergence.push(`renders server-entry key "${k}", not accepted by ${sample.client}`);
  }

  return {
    client: sample.client,
    status: divergence.length > 0 ? 'divergent' : 'ok',
    divergence,
  };
}

export type SchemaShape = Pick<CompatSample, 'rootKeys' | 'serverContainer' | 'entryKeys'>;

export async function runCompatCheck(
  rendered: Record<string, string>,
  samples: CompatSample[],
  opts: { fetchLatest?: (url: string) => Promise<SchemaShape | null> } = {},
): Promise<CompatResult[]> {
  const results: CompatResult[] = [];
  for (const sample of samples) {
    const out = rendered[sample.client];
    if (out === undefined) {
      results.push({
        client: sample.client,
        status: 'skipped',
        divergence: [],
        reason: 'no rendered output',
      });
      continue;
    }

    let effective = sample;
    if (sample.source.type === 'url' && sample.source.url) {
      // Pull the live accepted format; skip (never fail) if the source is unreachable.
      const latest = opts.fetchLatest ? await opts.fetchLatest(sample.source.url) : null;
      if (!latest) {
        results.push({
          client: sample.client,
          status: 'skipped',
          divergence: [],
          reason: 'upstream format source unavailable',
        });
        continue;
      }
      effective = { ...sample, ...latest };
    }

    results.push(checkAdapter(out, effective));
  }
  return results;
}
