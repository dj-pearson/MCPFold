/**
 * Render the concrete Homebrew formula + Scoop manifest for a release (S11.1), filling in the real
 * version, download URLs, and SHA-256 hashes, then writing them to `dist-packaging/`. The release
 * pipeline pushes those to the `dj-pearson/homebrew-tap` and `dj-pearson/scoop-bucket` repos so
 * `brew upgrade` / `scoop update` track every release. The in-repo templates keep placeholder
 * URLs/hashes (only their `version` is kept in sync, for the version-parity gate).
 *
 * Usage: node scripts/render-packaging.mjs <tag> [checksumsDir=build] [outDir=dist-packaging]
 *   e.g. node scripts/render-packaging.mjs v1.0.0
 * Each `<asset>.sha256` in checksumsDir must contain `<hash>  <asset>` (as build-binary.mjs writes).
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const tag = process.argv[2];
if (!tag) {
  console.error('usage: node scripts/render-packaging.mjs <tag> [checksumsDir] [outDir]');
  process.exit(1);
}
const version = tag.replace(/^v/, '');
const checksumsDir = process.argv[3] ?? 'build';
const outDir = process.argv[4] ?? 'dist-packaging';
mkdirSync(join(root, outDir), { recursive: true });

// asset name → sha256, read from the .sha256 sidecars the binaries build produced.
const shas = {};
for (const f of readdirSync(join(root, checksumsDir)).filter((n) => n.endsWith('.sha256'))) {
  const [hash] = readFileSync(join(root, checksumsDir, f), 'utf8').trim().split(/\s+/);
  shas[basename(f, '.sha256')] = hash;
}
const shaFor = (asset) => {
  const h = shas[asset];
  if (!h) throw new Error(`no checksum for ${asset} (have: ${Object.keys(shas).join(', ')})`);
  return h;
};

// --- Homebrew formula: bump version, point URLs at <tag>, fill each sha256 by its preceding URL ---
const brewOut = readFileSync(join(root, 'packaging/homebrew/mcpfold.rb'), 'utf8')
  .replace(/version\s+"[^"]+"/, `version "${version}"`)
  .split('\n')
  .reduce(
    (acc, line) => {
      const urlMatch = /url\s+"[^"]*\/(mcpfold-[^"/]+)"/.exec(line);
      if (urlMatch) {
        acc.lastAsset = urlMatch[1];
        acc.lines.push(line.replace(/\/download\/v[^/]+\//, `/download/${tag}/`));
      } else if (/sha256\s+"/.test(line) && acc.lastAsset) {
        acc.lines.push(line.replace(/sha256\s+"[^"]*"/, `sha256 "${shaFor(acc.lastAsset)}"`));
      } else {
        acc.lines.push(line);
      }
      return acc;
    },
    { lines: [], lastAsset: null },
  )
  .lines.join('\n');
writeFileSync(join(root, outDir, 'mcpfold.rb'), brewOut);

// --- Scoop manifest: version, concrete 64-bit URL + hash for the Windows binary ---
const scoop = JSON.parse(readFileSync(join(root, 'packaging/scoop/mcpfold.json'), 'utf8'));
scoop.version = version;
scoop.architecture['64bit'].url = `https://github.com/dj-pearson/MCPFold/releases/download/${tag}/mcpfold-windows-x64.exe#/mcpfold.exe`;
scoop.architecture['64bit'].hash = shaFor('mcpfold-windows-x64.exe');
writeFileSync(join(root, outDir, 'mcpfold.json'), JSON.stringify(scoop, null, 2) + '\n');

console.log(`✓ rendered ${outDir}/mcpfold.rb + mcpfold.json for ${tag}`);
