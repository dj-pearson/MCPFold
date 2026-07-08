#!/usr/bin/env node
/**
 * check-deploy-env.mjs (S8.5) — keeps the deployment runbook's environment-variable matrix in sync
 * with the REAL sources it documents. Every env var a live surface actually reads must appear in
 * docs/deployment.md §4, so the runbook can never silently omit a variable an operator has to set.
 *
 * Sources scanned:
 *   - supabase/.env.example          (Supabase / Coolify stack)
 *   - apps/web/.env.example          (web console build-time env)
 *   - services/edge/**.ts            (Deno.env.get("…") the edge actually reads)
 *   - .github/workflows/*.yml        (secrets.* the CI/CD uses)
 *
 * The rule is one-directional: source ⊆ documented. Extra *optional* vars documented in the runbook
 * but absent from a template (e.g. VITE_API_URL, VITE_E2E) are fine — the runbook is allowed to
 * explain more than the minimal template. A NEW real var that nobody documented is drift → fail.
 *
 * Usage: node scripts/check-deploy-env.mjs        (exits 1 on drift)
 * Also exports pure helpers so the test can plant a mismatch without touching tracked files.
 */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** A backticked UPPER_SNAKE token in the runbook counts as "documented". */
const VAR_RE = /[A-Z][A-Z0-9_]{2,}/;

/** Collect every env-var name documented in the runbook (backticked tokens in the matrix + prose). */
export function collectDocumentedVars(mdText) {
  const out = new Set();
  for (const m of mdText.matchAll(/`([A-Z][A-Z0-9_]{2,})`/g)) out.add(m[1]);
  return out;
}

function readIfExists(path) {
  return existsSync(path) ? readFileSync(path, 'utf8') : '';
}

/** `KEY=` assignments in a dotenv-style file. */
function dotenvVars(text) {
  const out = [];
  for (const line of text.split(/\r?\n/)) {
    const m = /^\s*([A-Z][A-Z0-9_]{2,})=/.exec(line);
    if (m) out.push(m[1]);
  }
  return out;
}

/** Every *.ts under a dir (recursive), skipping node_modules / dist. */
function tsFiles(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

/**
 * Collect the real env vars each surface reads, as { name, source } records.
 * `roots` lets a test point a source at a planted fixture.
 */
export function collectSourceVars(roots = {}) {
  const repo = roots.repoRoot ?? REPO_ROOT;
  const supabaseEnv = roots.supabaseEnv ?? join(repo, 'supabase', '.env.example');
  const webEnv = roots.webEnv ?? join(repo, 'apps', 'web', '.env.example');
  const edgeDir = roots.edgeDir ?? join(repo, 'services', 'edge');
  const workflowsDir = roots.workflowsDir ?? join(repo, '.github', 'workflows');

  const records = [];
  for (const name of dotenvVars(readIfExists(supabaseEnv)))
    records.push({ name, source: 'supabase/.env.example' });
  for (const name of dotenvVars(readIfExists(webEnv)))
    records.push({ name, source: 'apps/web/.env.example' });

  for (const file of tsFiles(edgeDir)) {
    const text = readFileSync(file, 'utf8');
    for (const m of text.matchAll(/Deno\.env\.get\(\s*['"]([A-Z][A-Z0-9_]{2,})['"]/g))
      records.push({ name: m[1], source: 'services/edge' });
  }

  if (existsSync(workflowsDir)) {
    for (const name of readdirSync(workflowsDir).filter((f) => /\.ya?ml$/.test(f))) {
      const text = readFileSync(join(workflowsDir, name), 'utf8');
      for (const m of text.matchAll(/secrets\.([A-Z][A-Z0-9_]{2,})/g)) {
        // GITHUB_TOKEN is auto-provided by Actions; it's documented but never operator-set.
        if (m[1] === 'GITHUB_TOKEN') continue;
        records.push({ name: m[1], source: `.github/workflows/${name}` });
      }
    }
  }

  // De-dupe (name, source) pairs — a var read in several files is still one obligation per source.
  const seen = new Set();
  return records.filter((r) => {
    const k = `${r.name} ${r.source}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Source vars that are NOT documented in the runbook → drift. */
export function computeDrift({ docText, sourceVars }) {
  const documented = collectDocumentedVars(docText);
  return sourceVars.filter((r) => VAR_RE.test(r.name) && !documented.has(r.name));
}

function main() {
  // `--doc <path>` overrides the runbook location (used by the drift test to plant a mismatch).
  const docFlag = process.argv.indexOf('--doc');
  const docPath =
    docFlag !== -1 && process.argv[docFlag + 1]
      ? process.argv[docFlag + 1]
      : join(REPO_ROOT, 'docs', 'deployment.md');
  if (!existsSync(docPath)) {
    console.error('✗ docs/deployment.md not found');
    process.exit(1);
  }
  const docText = readFileSync(docPath, 'utf8');
  const sourceVars = collectSourceVars();
  const drift = computeDrift({ docText, sourceVars });

  if (drift.length) {
    console.error('✗ deployment runbook is out of sync with real env sources:');
    for (const { name, source } of drift)
      console.error(`  - ${name} (used by ${source}) is not documented in docs/deployment.md §4`);
    console.error('\nAdd it to the environment-variable matrix, or remove it from the source.');
    process.exit(1);
  }
  console.log(
    `✓ env matrix in sync — ${sourceVars.length} source vars all documented in deployment.md`,
  );
}

// Run main() only when invoked directly (not when imported by the test).
const invokedPath = process.argv[1] ? realpathSync(process.argv[1]) : '';
if (invokedPath && invokedPath === fileURLToPath(import.meta.url)) main();
