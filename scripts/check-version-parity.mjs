/**
 * Version-parity gate (S11.1 + S16.1). Every install channel must resolve to the same version as
 * the npm package for a given tag. This asserts the `mcpfold` package version matches the version
 * declared in the Homebrew formula and the Scoop manifest, AND the version the binary embeds and
 * reports (`CLI_VERSION`) — CI fails if a release step forgot to bump one, or if the generated
 * version.ts drifted from package.json (which would make `--version`, telemetry, and the update
 * notifier misreport). Checks the built dist when present, else the generated source.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const npmVersion = JSON.parse(
  readFileSync(join(root, 'packages/cli/package.json'), 'utf8'),
).version;

const brew = readFileSync(join(root, 'packaging/homebrew/mcpfold.rb'), 'utf8');
const brewVersion = /version\s+"([^"]+)"/.exec(brew)?.[1];

const scoop = JSON.parse(readFileSync(join(root, 'packaging/scoop/mcpfold.json'), 'utf8')).version;

// The version the shipped binary actually reports. Prefer the built dist (what users run); fall
// back to the generated source when dist hasn't been built yet (e.g. release.yml runs this first).
const distVersionPath = join(root, 'packages/cli/dist/version.js');
const srcVersionPath = join(root, 'packages/cli/src/version.ts');
const embeddedSource = existsSync(distVersionPath) ? distVersionPath : srcVersionPath;
const embeddedVersion = /CLI_VERSION\s*=\s*['"]([^'"]+)['"]/.exec(
  readFileSync(embeddedSource, 'utf8'),
)?.[1];

const channels = {
  npm: npmVersion,
  homebrew: brewVersion,
  scoop,
  'cli-binary': embeddedVersion,
};
const mismatched = Object.entries(channels).filter(([, v]) => v !== npmVersion);

if (mismatched.length > 0) {
  console.error('✗ install-channel version mismatch:');
  for (const [name, v] of Object.entries(channels)) {
    console.error(
      `  ${name.padEnd(10)} ${v ?? '(missing)'}${v === npmVersion ? '' : '  ← differs from npm'}`,
    );
  }
  if (mismatched.some(([name]) => name === 'cli-binary')) {
    console.error(`  → fix: run \`node scripts/gen-cli-version.mjs\` to regenerate version.ts`);
  }
  process.exit(1);
}
console.log(
  `✓ all install channels at version ${npmVersion} (npm, homebrew, scoop, cli-binary from ${
    embeddedSource === distVersionPath ? 'dist' : 'src'
  })`,
);
