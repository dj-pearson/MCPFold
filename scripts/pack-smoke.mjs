/**
 * Post-install smoke test (S8.4). Proves the packages users will actually `npm install` work
 * end to end — not just the workspace source. It packs every publishable package with
 * `pnpm pack` (which rewrites `workspace:*` to concrete versions, exactly as a real publish
 * would), installs the resulting tarballs together into a throwaway project, and drives the
 * published `mcpfold` binary through its core loop (`--version` → `init` → `doctor` →
 * `sync --dry-run`). A broken bin path, missing `files` entry, or bad dependency version
 * surfaces here before it reaches npm.
 *
 * Assumes `pnpm -r build` has already run. Cross-platform (invokes the bin via `node`).
 */
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// Publishable packages. `cli` (the `mcpfold` bin) must come last so its deps resolve locally.
const DEP_PKGS = ['core', 'secrets', 'proxy', 'adapters', 'schema'];
const ALL_PKGS = [...DEP_PKGS, 'cli'];

const root = process.cwd();
const stage = mkdtempSync(join(tmpdir(), 'mcpfold-pack-'));
const project = mkdtempSync(join(tmpdir(), 'mcpfold-smoke-'));

// External CLIs (pnpm, corepack, npm) are shims that need a shell to resolve on Windows.
function run(cmd, args, opts = {}) {
  return execFileSync(cmd, args, { encoding: 'utf8', stdio: 'pipe', shell: true, ...opts });
}

// Pack with pnpm (it rewrites workspace:* to concrete versions). Prefer pnpm on PATH (CI),
// else fall back to corepack, which ships with Node — so this runs on a bare dev machine too.
function packerPrefix() {
  try {
    execFileSync('pnpm', ['--version'], { shell: true, stdio: 'ignore' });
    return ['pnpm'];
  } catch {
    return ['corepack', 'pnpm@10.33.0'];
  }
}

try {
  const [packer, ...packerArgs] = packerPrefix();
  console.log(
    `▶ packing ${ALL_PKGS.length} packages via ${[packer, ...packerArgs].join(' ')} → ${stage}`,
  );
  for (const p of ALL_PKGS) {
    run(packer, [...packerArgs, 'pack', '--pack-destination', stage], {
      cwd: join(root, 'packages', p),
    });
  }
  const tgzs = readdirSync(stage).filter((f) => f.endsWith('.tgz'));
  if (tgzs.length !== ALL_PKGS.length) {
    throw new Error(`expected ${ALL_PKGS.length} tarballs, packed ${tgzs.length}: ${tgzs}`);
  }

  console.log(`▶ installing tarballs into a clean project → ${project}`);
  writeFileSync(
    join(project, 'package.json'),
    JSON.stringify({ name: 'smoke', private: true }, null, 2),
  );
  run('npm', ['install', '--no-audit', '--no-fund', ...tgzs.map((f) => join(stage, f))], {
    cwd: project,
  });

  // Drive the PUBLISHED binary (resolved through node_modules) — invoke via the current node
  // executable directly (no shell / .cmd shim needed), cross-platform.
  const bin = join(project, 'node_modules', 'mcpfold', 'dist', 'bin.js');
  const mcpfold = (args) =>
    execFileSync(process.execPath, [bin, ...args], {
      cwd: project,
      encoding: 'utf8',
      stdio: 'pipe',
    });

  const version = mcpfold(['--version']).trim();
  if (!/^\d+\.\d+\.\d+/.test(version)) throw new Error(`--version returned "${version}"`);
  console.log(`✓ mcpfold --version → ${version}`);

  mcpfold(['init']);
  console.log('✓ mcpfold init scaffolded a config');

  mcpfold(['doctor']); // exits 0 on a clean scaffold; throws here if nonzero
  console.log('✓ mcpfold doctor passed');

  mcpfold(['sync', '--dry-run']);
  console.log('✓ mcpfold sync --dry-run planned a fold');

  console.log('\n✓ post-install smoke passed: the published packages install and run.');
} finally {
  rmSync(stage, { recursive: true, force: true });
  rmSync(project, { recursive: true, force: true });
}
