#!/usr/bin/env node
/**
 * Evidence-link guard for the security-posture page (S18.5).
 *
 * The docs build already fails on any broken repo-relative link, but this check is purpose-built:
 * it parses the claims table in docs/security-posture.md and asserts that EVERY claim row carries a
 * resolvable evidence link. That keeps the page honest — a claim can never be added (or its evidence
 * deleted/renamed) without CI catching it — so "every public claim is one click from the code" is an
 * enforced invariant, not a hope.
 *
 * Exit 0 when every claim has a live evidence link; exit 1 (with a report) otherwise.
 */
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const PAGE = join(DOCS, 'security-posture.md');

const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;

/** Extract the rows of the Markdown table that lives under the "## Claims → evidence" heading. */
function claimRows(md) {
  const lines = md.split('\n');
  const start = lines.findIndex((l) => /^##\s+Claims/i.test(l));
  if (start === -1) return [];
  const rows = [];
  for (let i = start + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^##\s+/.test(line)) break; // next section ends the table
    if (!line.trim().startsWith('|')) continue;
    // Skip the header row and the |---|---| separator.
    if (/^\|[\s|:-]+\|$/.test(line.trim())) continue;
    if (/^\|\s*Property\s*\|/i.test(line)) continue;
    rows.push(line);
  }
  return rows;
}

/** All repo-relative link targets in a row (external URLs and same-page anchors excluded). */
function localLinkTargets(row) {
  const targets = [];
  let m;
  while ((m = LINK_RE.exec(row))) {
    const raw = m[1].trim();
    if (/^(https?:|mailto:|#)/.test(raw)) continue;
    targets.push(raw.split('#')[0]);
  }
  return targets;
}

function main() {
  if (!existsSync(PAGE)) {
    console.error(`✗ security-posture page is missing: ${PAGE}`);
    process.exit(1);
  }
  const md = readFileSync(PAGE, 'utf8');
  const rows = claimRows(md);
  const problems = [];

  if (rows.length === 0) {
    problems.push('No claim rows found under a "## Claims → evidence" heading.');
  }

  let checkedLinks = 0;
  for (const row of rows) {
    const property = row.split('|')[1]?.trim() ?? '(unknown)';
    const targets = localLinkTargets(row);
    if (targets.length === 0) {
      problems.push(`Claim "${property}" has no evidence link.`);
      continue;
    }
    for (const target of targets) {
      // Links are written relative to the docs/ directory (e.g. ../packages/...).
      const abs = resolve(DOCS, target);
      if (!existsSync(abs)) {
        problems.push(`Claim "${property}" → evidence "${target}" does not exist.`);
      } else {
        checkedLinks++;
      }
    }
  }

  if (problems.length) {
    console.error(`✗ security-posture evidence check failed with ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  - ${p}`);
    process.exit(1);
  }
  console.log(
    `✓ security posture: ${rows.length} claims, ${checkedLinks} evidence link(s) verified`,
  );
}

main();
