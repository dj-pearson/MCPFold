/**
 * Build standalone `mcpfold` binaries (S11.1) — no Node needed at runtime. Bundles the built CLI
 * (packages/cli/dist/bin.js) into a single CJS file with esbuild, then packages it into native
 * binaries with @yao-pkg/pkg, which cross-compiles ALL targets from one machine. Emits
 * `build/mcpfold-<os>-<arch>[.exe]` plus a `.sha256` for each.
 *
 * Assumes `pnpm -r build` has run. `pnpm build:binaries` builds every target; pass a single
 * pkg target (e.g. `node20-linux-x64`) as argv[2] to build just one. Both tools are devDeps.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from 'node:fs';
import { join } from 'node:path';

const isWin = process.platform === 'win32';
const outDir = 'build';
mkdirSync(outDir, { recursive: true });

const entry = 'packages/cli/dist/bin.js';
if (!existsSync(entry)) {
  console.error(`✗ ${entry} not found — run \`pnpm -r build\` first.`);
  process.exit(1);
}

const bundle = join(outDir, 'mcpfold.cjs');
const bin = (name) => join('node_modules', '.bin', isWin ? `${name}.cmd` : name);
const run = (cmd, args) => execFileSync(cmd, args, { stdio: 'inherit', shell: isWin });

// pkg target → our release asset name.
const TARGETS = {
  'node20-macos-arm64': 'mcpfold-macos-arm64',
  'node20-macos-x64': 'mcpfold-macos-x64',
  'node20-linux-x64': 'mcpfold-linux-x64',
  'node20-linux-arm64': 'mcpfold-linux-arm64',
  'node20-win-x64': 'mcpfold-windows-x64.exe',
};
const only = process.argv[2];
// Support a single target or a comma-separated list (e.g. from CI matrix)
const targets = only
  ? Object.fromEntries(
      only.split(',').map(t => t.trim()).filter(t => TARGETS[t]).map(t => [t, TARGETS[t]])
    )
  : TARGETS;

// 1. Bundle the built CLI into one CommonJS file (pkg packages a single static entry cleanly).
run(bin('esbuild'), [
  entry,
  '--bundle',
  '--platform=node',
  '--format=cjs',
  '--target=node20',
  `--outfile=${bundle}`,
]);

// 2. Package each target with pkg.
run(bin('pkg'), [bundle, '--targets', Object.keys(targets).join(','), '--out-path', outDir]);

// 3. Rename pkg's outputs to our asset names and write a checksum for each.
for (const [target, asset] of Object.entries(targets)) {
  const suffix = target.includes('win') ? '.exe' : '';
  const produced = join(outDir, `mcpfold-${target.replace('node20-', '')}${suffix}`);
  const finalPath = join(outDir, asset);
  if (existsSync(produced) && produced !== finalPath) renameSync(produced, finalPath);
}
// Fallback: checksum every asset present.
for (const asset of Object.values(targets)) {
  const p = join(outDir, asset);
  if (!existsSync(p)) continue;
  const sha = createHash('sha256').update(readFileSync(p)).digest('hex');
  writeFileSync(`${p}.sha256`, `${sha}  ${asset}\n`);
  console.log(`✓ ${asset}  ${sha.slice(0, 16)}…`);
}

console.log(
  'built:',
  readdirSync(outDir)
    .filter((f) => f.startsWith('mcpfold-'))
    .join(', '),
);
