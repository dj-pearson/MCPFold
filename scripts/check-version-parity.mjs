/**
 * Version-parity gate (S11.1). Every install channel must resolve to the same version as the npm
 * package for a given tag. This asserts the `mcpfold` package version matches the version declared
 * in the Homebrew formula and the Scoop manifest — CI fails if a release step forgot to bump one.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const npmVersion = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf8'),
).version;

const brew = readFileSync(join(root, 'packaging/homebrew/mcpfold.rb'), 'utf8');
const brewVersion = /version\s+"([^"]+)"/.exec(brew)?.[1];

const scoop = JSON.parse(readFileSync(join(root, 'packaging/scoop/mcpfold.json'), 'utf8')).version;

const channels = { npm: npmVersion, homebrew: brewVersion, scoop };
const mismatched = Object.entries(channels).filter(([, v]) => v !== npmVersion);

if (mismatched.length > 0) {
  console.error('✗ install-channel version mismatch:');
  for (const [name, v] of Object.entries(channels)) {
    console.error(`  ${name.padEnd(9)} ${v}${v === npmVersion ? '' : '  ← differs from npm'}`);
  }
  process.exit(1);
}
console.log(`✓ all install channels at version ${npmVersion} (npm, homebrew, scoop)`);
