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
import { type CompatSample, runCompatCheck, shapeOf } from './check.js';

const here = dirname(fileURLToPath(import.meta.url));
const samplesDir = join(here, 'samples');
const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

const config = loadConfigOrThrow(
  readFileSync(join(here, '..', 'test', 'fixtures', 'canonical.jsonc'), 'utf8'),
);
const serversFor = (client: string): ResolvedServer[] =>
  resolveProfile(config, 'everywhere').map((s) => ({
    ...s,
    client: client as ResolvedServer['client'],
  }));

/** The root key whose values are the per-server entries (mcpServers / servers / context_servers). */
function containerOf(rendered: string): string {
  const json = JSON.parse(rendered) as Record<string, unknown>;
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

const rendered: Record<string, string> = {};
for (const adapter of ALL_ADAPTERS) {
  rendered[adapter.id] = adapter.render(serversFor(adapter.id), linux).contents;
}

if (process.argv.includes('--capture')) {
  mkdirSync(samplesDir, { recursive: true });
  for (const adapter of ALL_ADAPTERS) {
    const contents = rendered[adapter.id]!;
    const container = containerOf(contents);
    const shape = shapeOf(contents, container);
    const sample: CompatSample = {
      client: adapter.id,
      source: { type: 'captured', capturedAt: process.env.CAPTURE_DATE ?? '2026-07-08' },
      rootKeys: shape.rootKeys,
      serverContainer: container,
      entryKeys: shape.entryKeys,
    };
    writeFileSync(join(samplesDir, `${adapter.id}.json`), `${JSON.stringify(sample, null, 2)}\n`);
  }
  console.log(`✓ captured ${ALL_ADAPTERS.length} client samples`);
  process.exit(0);
}

const samples: CompatSample[] = readdirSync(samplesDir)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(readFileSync(join(samplesDir, f), 'utf8')) as CompatSample);

const results = await runCompatCheck(rendered, samples);
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
