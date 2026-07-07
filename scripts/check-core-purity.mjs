#!/usr/bin/env node
/**
 * Core-purity CI gate.
 *
 * `packages/core` is the pure, I/O-free engine. It must never import Node I/O
 * modules (fs/os/path/net/http) or network/process libraries. All side effects
 * flow through injected ClientAdapter / SecretProvider implementations, which
 * live in other packages.
 *
 * This is a fast, dependency-free static check that CI runs as a dedicated job,
 * complementing the ESLint `no-restricted-imports` rule (defense in depth: the
 * lint rule protects editors, this protects CI even if lint config drifts).
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const CORE_SRC = join(ROOT, 'packages', 'core', 'src');

const FORBIDDEN = [
  'node:fs',
  'node:os',
  'node:path',
  'node:net',
  'node:http',
  'node:https',
  'node:child_process',
  'node:dns',
  'node:tls',
  'execa',
  'undici',
  'node-fetch',
];

// Bare specifiers that are forbidden only as exact module names (avoid matching
// e.g. a local './path' import). We check the quoted specifier exactly.
const FORBIDDEN_BARE = ['fs', 'os', 'path', 'net', 'http', 'https', 'child_process', 'dns', 'tls'];

/** @param {string} dir */
function* walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return; // core/src may not exist yet on the empty scaffold — that's fine.
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.(ts|mts|cts|js|mjs|cjs)$/.test(name) && !/\.(test|spec)\./.test(name)) {
      yield full;
    }
  }
}

const importRe = /(?:import|export)[^'"]*?from\s*['"]([^'"]+)['"]/g;
const requireRe = /require\(\s*['"]([^'"]+)['"]\s*\)/g;
const dynImportRe = /import\(\s*['"]([^'"]+)['"]\s*\)/g;

const violations = [];

for (const file of walk(CORE_SRC)) {
  const contents = readFileSync(file, 'utf8');
  const specifiers = new Set();
  for (const re of [importRe, requireRe, dynImportRe]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(contents)) !== null) specifiers.add(m[1]);
  }
  for (const spec of specifiers) {
    if (FORBIDDEN.includes(spec) || FORBIDDEN_BARE.includes(spec)) {
      violations.push({ file: relative(ROOT, file), spec });
    }
  }
}

if (violations.length > 0) {
  console.error('\n✖ Core-purity violation: packages/core must be I/O-free.\n');
  for (const v of violations) {
    console.error(`  ${v.file} imports "${v.spec}"`);
  }
  console.error('\nMove the I/O into an adapter/provider and inject it into core.\n');
  process.exit(1);
}

console.log('✓ Core purity check passed (no forbidden imports in packages/core).');
