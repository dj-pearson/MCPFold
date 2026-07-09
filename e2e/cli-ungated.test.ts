import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * S20.2 regression guard: the OSS CLI is NEVER gated by entitlements. Billing lives only in the
 * commercial cloud surface (services/edge + apps/web); the local-first CLI (init/import/sync/diff/
 * doctor/run/team-config-as-code) must keep working regardless of any subscription state. This test
 * asserts that structurally — the CLI source imports no entitlement/billing/edge code — so a future
 * change can't quietly leak a paywall into the free tool. Runtime coverage of the ungated CLI paths
 * lives in packages/cli/test + e2e/team-config.test.ts.
 */

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const cliSrc = join(repoRoot, 'packages', 'cli', 'src');

function tsFiles(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    if (name === 'node_modules' || name === 'dist') continue;
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...tsFiles(full));
    else if (name.endsWith('.ts')) out.push(full);
  }
  return out;
}

// Patterns that would indicate the CLI reaching into the commercial gating surface — actual
// imports and gating calls, not prose (a doc comment may mention services/edge without depending
// on it).
const FORBIDDEN = [
  /import[^;]*['"]@mcpfold\/edge['"]/, // importing the closed-source edge package
  /import[^;]*from\s+['"][^'"]*entitlement/i, // importing an entitlements module
  /\b(requireEntitlement|hasEntitlement|EntitlementChecker|tierFor)\b/, // calling a gate
];

describe('OSS CLI stays ungated by billing (S20.2)', () => {
  it('no CLI source file imports or references entitlement/billing gating', () => {
    const offenders: string[] = [];
    for (const file of tsFiles(cliSrc)) {
      const text = readFileSync(file, 'utf8');
      if (FORBIDDEN.some((re) => re.test(text))) {
        offenders.push(relative(repoRoot, file));
      }
    }
    expect(
      offenders,
      `these CLI files reference the commercial gating surface:\n${offenders.join('\n')}`,
    ).toEqual([]);
  });
});
