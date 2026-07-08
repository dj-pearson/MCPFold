/**
 * Sync the CLI's embedded version string with packages/cli/package.json (S0.4). The `--version`
 * flag and the update-notice read `CLI_VERSION` from packages/cli/src/version.ts; without this it
 * ships as the placeholder "0.0.0". Wired into the Changesets `version` step (so the bump lands in
 * the "Version Packages" PR) and run as the CLI package's `prebuild` (a safety net — idempotent, so
 * it's a no-op when already in sync and never dirties the tree). Run: node scripts/gen-cli-version.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const version = JSON.parse(readFileSync(join(root, 'packages/cli/package.json'), 'utf8')).version;

const target = join(root, 'packages/cli/src/version.ts');
const next = `/**
 * CLI version — generated from packages/cli/package.json by scripts/gen-cli-version.mjs.
 * Do not edit by hand; it is regenerated on version bump (Changesets) and on prebuild.
 */
export const CLI_VERSION = '${version}';
`;

if (readFileSync(target, 'utf8') !== next) {
  writeFileSync(target, next);
  console.log(`✓ set CLI_VERSION to ${version}`);
} else {
  console.log(`✓ CLI_VERSION already ${version}`);
}
