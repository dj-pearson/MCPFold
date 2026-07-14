/**
 * Compat harness entry (S14.2) — run in a scheduled CI job (npx tsx compat/run.ts). Renders each
 * adapter's canonical fixture, compares its shape to the captured/pulled samples, prints a report,
 * and exits nonzero on divergence so CI can open a tracking issue. `--capture` (re)writes the
 * samples from the current adapter output (the documented refresh step).
 */
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfigOrThrow, resolveProfile, type ResolvedServer } from '@mcpfold/core';
import { ALL_ADAPTERS } from '../src/all.js';
import type { OsContext } from '../src/types.js';
import {
  checkLive,
  type CompatSample,
  type ConfigFormat,
  type DocFetcher,
  parseByFormat,
  runCompatCheck,
  shapeOf,
} from './check.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, 'samples');
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

/** Non-JSON client config formats (S19.2). Everything else renders JSON. */
const FORMAT_BY_CLIENT: Record<string, ConfigFormat> = { goose: 'yaml', 'codex-cli': 'toml' };
const formatOf = (client: string): ConfigFormat => FORMAT_BY_CLIENT[client] ?? 'json';

/**
 * Clients whose primary docs are fetchable for a live upstream-drift check (S19.5). The captured
 * check always runs; the `--live` run additionally confirms these docs still document our keys.
 */
const LIVE_URL_BY_CLIENT: Record<string, string> = {
  vscode: 'https://code.visualstudio.com/docs/copilot/chat/mcp-servers',
  cursor: 'https://cursor.com/docs/mcp',
  'claude-code': 'https://docs.claude.com/en/docs/claude-code/mcp',
  'gemini-cli': 'https://google-gemini.github.io/gemini-cli/docs/tools/mcp-server.html',
};

/**
 * A stable config-doc token per live client (S19.5) — the config filename. When a client's docs
 * move or add anti-bot pages, the old URL can 200 with a body missing our root key; the anchor lets
 * the live check tell "doc moved" (→ skipped) from real format drift (→ divergent). See checkLive.
 */
const LIVE_ANCHOR_BY_CLIENT: Record<string, string> = {
  vscode: 'mcp.json',
  cursor: 'mcp.json',
  'claude-code': '.mcp.json',
  'gemini-cli': 'settings.json',
};

/** Real doc fetcher for `--live`: best-effort GET, returns null on any failure (→ skipped, never fail). */
const httpFetchDoc: DocFetcher = async (url) => {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    return res.ok ? await res.text() : null;
  } catch {
    return null;
  }
};

const config = loadConfigOrThrow(
  readFileSync(join(here, '..', 'test', 'fixtures', 'canonical.jsonc'), 'utf8'),
);
const serversFor = (client: string): ResolvedServer[] =>
  resolveProfile(config, 'everywhere').map((s) => ({
    ...s,
    client: client as ResolvedServer['client'],
  }));

/** The root key whose values are the per-server entries (mcpServers / servers / context_servers). */
function containerOf(rendered: string, format: ConfigFormat = 'json'): string {
  const json = parseByFormat(rendered, format);
  for (const [k, v] of Object.entries(json)) {
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      const vals = Object.values(v as Record<string, unknown>);
      if (vals.length > 0 && vals.every((e) => e && typeof e === 'object' && !Array.isArray(e))) {
        return k;
      }
    }
  }
  return Object.keys(json)[0] ?? '';
}

/** The resolved config-path pattern per scope (S19.5), against the fixed linux context. */
function pathsFor(adapter: (typeof ALL_ADAPTERS)[number]): { user?: string; project?: string } {
  const out: { user?: string; project?: string } = {};
  try {
    out.user = adapter.resolvePath('user', undefined, linux);
  } catch {
    /* no user-scope path */
  }
  try {
    out.project = adapter.resolvePath('project', '/home/dev/repo', linux);
  } catch {
    /* no project-scope path */
  }
  return out;
}

const rendered: Record<string, string> = {};
const currentPaths: Record<string, { user?: string; project?: string }> = {};
for (const adapter of ALL_ADAPTERS) {
  rendered[adapter.id] = adapter.render(serversFor(adapter.id), linux).contents;
  currentPaths[adapter.id] = pathsFor(adapter);
}

if (process.argv.includes('--capture')) {
  mkdirSync(samplesDir, { recursive: true });
  for (const adapter of ALL_ADAPTERS) {
    const contents = rendered[adapter.id]!;
    const format = formatOf(adapter.id);
    const container = containerOf(contents, format);
    const shape = shapeOf(contents, container, format);
    const sample: CompatSample = {
      client: adapter.id,
      source: { type: 'captured', capturedAt: process.env.CAPTURE_DATE ?? '2026-07-08' },
      ...(format === 'json' ? {} : { format }),
      rootKeys: shape.rootKeys,
      serverContainer: container,
      entryKeys: shape.entryKeys,
      remoteEntryKeys: shape.remoteEntryKeys,
      paths: currentPaths[adapter.id],
      ...(LIVE_URL_BY_CLIENT[adapter.id] ? { liveUrl: LIVE_URL_BY_CLIENT[adapter.id] } : {}),
      ...(LIVE_ANCHOR_BY_CLIENT[adapter.id]
        ? { liveAnchor: LIVE_ANCHOR_BY_CLIENT[adapter.id] }
        : {}),
    };
    writeFileSync(join(samplesDir, `${adapter.id}.json`), `${JSON.stringify(sample, null, 2)}\n`);
  }
  console.log(`✓ captured ${ALL_ADAPTERS.length} client samples`);
  process.exit(0);
}

const samples: CompatSample[] = readdirSync(samplesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(samplesDir, f), 'utf8')) as CompatSample);

const results = await runCompatCheck(rendered, samples, { currentPaths });

// S19.5: the scheduled `--live` run also checks upstream docs still document our keys. Best-effort:
// an unreachable doc degrades to `skipped` and never fails the run.
if (process.argv.includes('--live')) {
  for (const sample of samples) {
    if (!sample.liveUrl) continue;
    const out = rendered[sample.client];
    if (out === undefined) continue;
    results.push(await checkLive(out, sample, httpFetchDoc));
  }
}

let divergent = 0;
for (const r of results) {
  if (r.status === 'ok') console.log(`✓ ${r.client}: matches the captured client format`);
  else if (r.status === 'skipped') console.log(`⚠ ${r.client}: skipped (${r.reason})`);
  else {
    divergent++;
    console.error(`✗ ${r.client}: DIVERGENT`);
    for (const d of r.divergence) console.error(`    - ${d}`);
  }
}
if (divergent > 0) {
  console.error(`\n${divergent} client(s) diverged from mcpfold's rendered format.`);
  process.exit(1);
}
console.log(`\nAll ${results.length} clients compatible.`);
