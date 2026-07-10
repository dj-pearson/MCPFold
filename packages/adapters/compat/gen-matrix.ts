/**
 * Generate the public compat matrix (S19.5) — `npx tsx packages/adapters/compat/gen-matrix.ts`.
 * Reads every adapter + its captured sample and writes two artifacts:
 *   - docs/compat-matrix.md          — the dated docs page (also served on the site under /docs)
 *   - apps/site/public/compat-matrix.json — the same rows as data for the site to render
 * The "as of" date is the newest sample capture date, so the output is deterministic and only moves
 * when the harness re-captures — no spurious churn on every run.
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ALL_ADAPTERS } from '../src/all.js';
import type { CompatSample } from './check.js';
import { buildCompatMatrix, renderMatrixMarkdown } from './matrix.js';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..', '..');
const samplesDir = join(here, 'samples');

const samplesByClient: Record<string, CompatSample> = {};
for (const file of readdirSync(samplesDir).filter((f) => f.endsWith('.json'))) {
  const sample = JSON.parse(readFileSync(join(samplesDir, file), 'utf8')) as CompatSample;
  samplesByClient[sample.client] = sample;
}

const rows = buildCompatMatrix(ALL_ADAPTERS, samplesByClient);
const asOf =
  rows
    .map((r) => r.lastVerified)
    .sort()
    .at(-1) ?? '—';

const markdown = renderMatrixMarkdown(rows, asOf);
writeFileSync(join(root, 'docs', 'compat-matrix.md'), markdown);

const json = `${JSON.stringify({ generatedAsOf: asOf, clients: rows }, null, 2)}\n`;
writeFileSync(join(root, 'apps', 'site', 'public', 'compat-matrix.json'), json);

console.log(
  `✓ wrote docs/compat-matrix.md + apps/site/public/compat-matrix.json (${rows.length} clients, as of ${asOf})`,
);
