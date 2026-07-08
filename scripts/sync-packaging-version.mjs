/**
 * Keep the Homebrew formula + Scoop manifest `version` in sync with the CLI's npm version (S11.1),
 * so the version-parity gate (scripts/check-version-parity.mjs) stays green after a version bump.
 * Wired into the Changesets `version` step, so the "Version Packages" PR bumps these templates too.
 * Only the version string changes here — the real URLs/hashes are filled at publish time by
 * scripts/render-packaging.mjs. Run: node scripts/sync-packaging-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version;

const brewPath = join(root, 'packaging/homebrew/mcpfold.rb');
writeFileSync(
  brewPath,
  readFileSync(brewPath, 'utf8').replace(/version\s+"[^"]+"/, `version "${version}"`),
);

const scoopPath = join(root, 'packaging/scoop/mcpfold.json');
const scoop = JSON.parse(readFileSync(scoopPath, 'utf8'));
scoop.version = version;
writeFileSync(scoopPath, JSON.stringify(scoop, null, 2) + '\n');

console.log(`✓ synced homebrew + scoop version to ${version}`);
