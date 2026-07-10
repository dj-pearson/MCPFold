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
import { parse as parseYaml } from 'yaml';
import { parse as parseToml } from 'smol-toml';

/** On-disk config format of a client file — drives which parser the shape check uses. */
export type ConfigFormat = 'json' | 'yaml' | 'toml';

export interface CompatSample {
  client: string;
  /** Where the accepted-format sample comes from. `url` samples are pulled live; `captured` ones
   *  are a versioned snapshot refreshed by hand (see compat/README.md). */
  source: { type: 'captured' | 'url'; url?: string; capturedAt: string };
  /** The client's on-disk config format. Defaults to `json`; Goose is `yaml`, Codex CLI `toml`. */
  format?: ConfigFormat;
  /** Top-level keys the client's config accepts. */
  rootKeys: string[];
  /** The root key whose values are the per-server entries. */
  serverContainer: string;
  /** Keys a server entry may contain. */
  entryKeys: string[];
  /**
   * Keys a REMOTE entry uses (S19.5) — the deep signature that makes a value-position change
   * detectable: Windsurf renaming `url`→`serverUrl`, or Gemini keeping `httpUrl`, changes this set
   * even though the union of all `entryKeys` might not. A remote entry is one carrying a URL-shaped
   * field (`url`/`httpUrl`/`uri`/`serverUrl`). Undefined on legacy samples ⇒ not checked.
   */
  remoteEntryKeys?: string[];
  /**
   * The resolved config-path pattern per scope (S19.5), captured against a fixed OS context so a
   * silent path move (e.g. Windsurf → Devin docs migration) is flagged. Undefined ⇒ not checked.
   */
  paths?: { user?: string; project?: string };
  /**
   * A live upstream doc/schema URL (S19.5). The captured check always runs; when a fetcher is
   * available (the scheduled `--live` run), the harness ALSO confirms the client's primary docs
   * still document the keys this adapter renders — catching upstream drift, not just our own stale
   * samples. Unreachable or ambiguous ⇒ the live check degrades to `skipped`, never a false pass.
   */
  liveUrl?: string;
}

/** Parse rendered client config text by its on-disk format (JSON / YAML / TOML). */
export function parseByFormat(
  rendered: string,
  format: ConfigFormat = 'json',
): Record<string, unknown> {
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

/** URL-shaped fields that mark a server entry as a REMOTE entry (S19.5). */
const REMOTE_MARKERS = ['url', 'httpUrl', 'uri', 'serverUrl'];

/** Extract the structural shape of a rendered client config, incl. remote-entry keys (S19.5). */
export function shapeOf(
  rendered: string,
  serverContainer: string,
  format: ConfigFormat = 'json',
): { rootKeys: string[]; entryKeys: string[]; remoteEntryKeys: string[] } {
  const json = parseByFormat(rendered, format);
  const rootKeys = Object.keys(json).sort();
  const container = (json[serverContainer] ?? {}) as Record<string, unknown>;
  const entryKeys = new Set<string>();
  const remoteEntryKeys = new Set<string>();
  for (const entry of Object.values(container)) {
    if (entry && typeof entry === 'object') {
      const keys = Object.keys(entry as Record<string, unknown>);
      for (const k of keys) entryKeys.add(k);
      // A remote entry carries a URL-shaped field; collect its keys separately so a value-position
      // change (e.g. url→serverUrl, or keeping httpUrl) is visible even if the overall union isn't.
      if (keys.some((k) => REMOTE_MARKERS.includes(k))) {
        for (const k of keys) remoteEntryKeys.add(k);
      }
    }
  }
  return {
    rootKeys,
    entryKeys: [...entryKeys].sort(),
    remoteEntryKeys: [...remoteEntryKeys].sort(),
  };
}

/** A two-way set diff, formatted as human divergence lines (S19.5). */
function diffKeys(
  label: string,
  client: string,
  rendered: string[],
  accepted: string[],
  lines: string[],
): void {
  for (const k of rendered.filter((x) => !accepted.includes(x))) {
    lines.push(`renders ${label} key "${k}", not accepted by ${client}`);
  }
  for (const k of accepted.filter((x) => !rendered.includes(x))) {
    lines.push(`${client} expects ${label} key "${k}", but the adapter does not render it`);
  }
}

/**
 * Compare one adapter's rendered output against the client's accepted-format sample. `currentPaths`
 * (S19.5) is the adapter's freshly-resolved path pattern per scope, compared against the sample's so
 * a silent path move is flagged.
 */
export function checkAdapter(
  rendered: string,
  sample: CompatSample,
  currentPaths?: { user?: string; project?: string },
): CompatResult {
  const shape = shapeOf(rendered, sample.serverContainer, sample.format);
  const divergence: string[] = [];

  diffKeys('root', sample.client, shape.rootKeys, sample.rootKeys, divergence);
  // Only flag entry keys the adapter renders that the client rejects (the client may accept more).
  for (const k of shape.entryKeys.filter((x) => !sample.entryKeys.includes(x))) {
    divergence.push(`renders server-entry key "${k}", not accepted by ${sample.client}`);
  }
  // S19.5: remote-entry field shape (both directions — a missing `httpUrl`/`serverUrl` matters).
  if (sample.remoteEntryKeys) {
    diffKeys(
      'remote-entry',
      sample.client,
      shape.remoteEntryKeys,
      sample.remoteEntryKeys,
      divergence,
    );
  }
  // S19.5: resolved path pattern per scope.
  if (sample.paths && currentPaths) {
    for (const scope of ['user', 'project'] as const) {
      const want = sample.paths[scope];
      const got = currentPaths[scope];
      if (want !== undefined && got !== undefined && want !== got) {
        divergence.push(`${scope}-scope path moved: "${want}" → "${got}"`);
      }
    }
  }

  return {
    client: sample.client,
    status: divergence.length > 0 ? 'divergent' : 'ok',
    divergence,
  };
}

export type SchemaShape = Pick<
  CompatSample,
  'rootKeys' | 'serverContainer' | 'entryKeys' | 'remoteEntryKeys'
>;

/** Fetch a client's primary doc/schema text, or `null` if unreachable (S19.5). Injectable for tests. */
export type DocFetcher = (url: string) => Promise<string | null>;

/**
 * Live upstream check (S19.5): confirm the client's primary docs still document every root key and
 * server-container name this adapter renders. A coarse but safe upstream-drift signal —
 *   - fetch fails / no URL      → `skipped` (never a false pass)
 *   - a rendered key is absent  → `divergent` (the doc no longer mentions it — likely a rename/move)
 *   - all present               → `ok`
 * It intentionally does NOT try to parse HTML into a schema (brittle); token presence is the signal.
 */
export async function checkLive(
  rendered: string,
  sample: CompatSample,
  fetchDoc: DocFetcher,
): Promise<CompatResult> {
  if (!sample.liveUrl) {
    return { client: sample.client, status: 'skipped', divergence: [], reason: 'no live source' };
  }
  const text = await fetchDoc(sample.liveUrl);
  if (text === null) {
    return {
      client: sample.client,
      status: 'skipped',
      divergence: [],
      reason: 'upstream doc unreachable',
    };
  }
  const shape = shapeOf(rendered, sample.serverContainer, sample.format);
  const tokens = [...new Set([...shape.rootKeys, sample.serverContainer])].filter(Boolean);
  const divergence = tokens
    .filter((t) => !text.includes(t))
    .map(
      (t) => `${sample.client}'s upstream docs no longer mention "${t}" — possible format drift`,
    );
  return {
    client: sample.client,
    status: divergence.length > 0 ? 'divergent' : 'ok',
    divergence,
  };
}

export async function runCompatCheck(
  rendered: Record<string, string>,
  samples: CompatSample[],
  opts: {
    fetchLatest?: (url: string) => Promise<SchemaShape | null>;
    /** Freshly-resolved path pattern per client (S19.5) — compared against the sample's paths. */
    currentPaths?: Record<string, { user?: string; project?: string }>;
  } = {},
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

    results.push(checkAdapter(out, effective, opts.currentPaths?.[sample.client]));
  }
  return results;
}
