/**
 * Regenerate the mcpfold terminal demo (S11.4). Runs the golden path — init → import → sync →
 * diff(clean) — against committed fixtures using the BUILT CLI, captures the real output,
 * and writes a deterministic asciinema v2 cast (demo/mcpfold.cast). Because it drives the actual
 * CLI, the demo can never drift from real output; because timestamps are synthetic and volatile
 * paths are normalized, regeneration is byte-for-byte reproducible.
 *
 *   pnpm demo:record            # writes demo/mcpfold.cast
 *   node scripts/record-demo.mjs --out /tmp/x.cast   # for tests
 *
 * If `vhs` is on PATH, also renders demo/mcpfold.tape → docs/assets/demo.gif for the README.
 * The demo LEADS with the context-window number and states plainly that server names are examples
 * (no implied endorsement).
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const CLI = join(ROOT, 'packages/cli/dist/bin.js');
const outArg = process.argv.indexOf('--out');
const OUT = outArg !== -1 ? process.argv[outArg + 1] : join(ROOT, 'demo/mcpfold.cast');

// The headline number comes from the committed benchmark (docs/benchmark.md, S5.4).
const HEADLINE = 'MCP tool-schemas cost context. mcpfold cuts them ~80% (7476 → 1497 tokens).';
const DISCLAIMER = '# (server names below are examples — no endorsement implied)';

// --- Set up a sandboxed HOME seeded with a messy Cursor config to adopt ---------------------
const home = mkdtempSync(join(tmpdir(), 'mcpfold-demo-home-'));
const cwd = mkdtempSync(join(tmpdir(), 'mcpfold-demo-cwd-'));
mkdirSync(join(home, '.cursor'), { recursive: true });
cpSync(join(ROOT, 'demo/fixtures/cursor-mcp.json'), join(home, '.cursor/mcp.json'));

const env = {
  ...process.env,
  HOME: home,
  USERPROFILE: home,
  APPDATA: join(home, 'AppData/Roaming'),
  NO_COLOR: '1', // deterministic, un-styled output
};

/** Normalize volatile bits so the cast is byte-identical on every run. */
function normalize(text) {
  return text
    .split(home)
    .join('~')
    .split(cwd)
    .join('~/project')
    .replace(/\\/g, '/') // paths → forward slashes so the cast is platform-independent
    .replace(/\d{4}-\d{2}-\d{2}T[\d:.\-]+Z?/g, '<timestamp>')
    .replace(/\r\n/g, '\n');
}

function runCli(args) {
  const res = spawnSync(process.execPath, [CLI, ...args, '--cwd', cwd], { env, encoding: 'utf8' });
  return normalize((res.stdout ?? '') + (res.stderr ?? ''));
}

// --- Drive the golden path ------------------------------------------------------------------
const scenes = [
  { comment: HEADLINE },
  { comment: DISCLAIMER },
  { cmd: 'mcpfold init', run: () => runCli(['init', '--force']) },
  { cmd: 'mcpfold import', run: () => runCli(['import', '--force']) },
  { cmd: 'mcpfold sync', run: () => runCli(['sync']) },
  { cmd: 'mcpfold diff', run: () => runCli(['diff']) },
];

// --- Emit an asciinema v2 cast with synthetic (deterministic) timing ------------------------
const PROMPT = '$ ';
const lines = [];
// Header: fixed timestamp so the file never changes spuriously.
lines.push(
  JSON.stringify({
    version: 2,
    width: 90,
    height: 28,
    timestamp: 0,
    title: 'mcpfold — write once, fold out everywhere',
    env: { SHELL: '/bin/sh', TERM: 'xterm-256color' },
  }),
);

let t = 0;
const emit = (text) => {
  t = Math.round((t + 0.4) * 1000) / 1000;
  lines.push(JSON.stringify([t, 'o', text]));
};

// Collect plain lines in parallel for a static SVG (no external tooling needed).
const svgLines = [];
const pushLines = (text, kind) => {
  for (const l of text.replace(/\n$/, '').split('\n')) svgLines.push({ text: l, kind });
};

for (const scene of scenes) {
  if (scene.comment) {
    emit(`\x1b[36m${scene.comment}\x1b[0m\r\n`);
    pushLines(scene.comment, 'comment');
    continue;
  }
  emit(`\x1b[32m${PROMPT}\x1b[0m${scene.cmd}\r\n`);
  pushLines(`${PROMPT}${scene.cmd}`, 'prompt');
  const output = scene.run();
  emit((output + (output.endsWith('\n') ? '' : '\n')).replace(/\n/g, '\r\n'));
  pushLines(output || '', 'out');
}

const cast = lines.join('\n') + '\n';
mkdirSync(dirname(OUT), { recursive: true });
writeFileSync(OUT, cast);
console.log(`✓ wrote ${OUT} (${cast.length} bytes, ${scenes.length} scenes)`);

// --- Render a static terminal SVG (deterministic, no external tooling) ----------------------
function renderSvg(rows) {
  const pad = 20;
  const lineH = 21;
  const width = 900;
  const height = pad * 2 + 34 + rows.length * lineH;
  const esc = (s) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  const color = { comment: '#8be9fd', prompt: '#50fa7b', out: '#f8f8f2' };
  const texts = rows
    .map((r, i) => {
      const y = pad + 34 + i * lineH;
      return `<text x="${pad}" y="${y}" fill="${color[r.kind] ?? color.out}" xml:space="preserve">${esc(r.text)}</text>`;
    })
    .join('\n  ');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="ui-monospace, SFMono-Regular, Menlo, Consolas, monospace" font-size="14">
  <rect width="${width}" height="${height}" rx="10" fill="#282a36"/>
  <circle cx="20" cy="18" r="6" fill="#ff5f56"/><circle cx="40" cy="18" r="6" fill="#ffbd2e"/><circle cx="60" cy="18" r="6" fill="#27c93f"/>
  <text x="${width / 2}" y="22" fill="#6272a4" text-anchor="middle" font-size="12">mcpfold — write once, fold out everywhere</text>
  ${texts}
</svg>
`;
}
const svg = renderSvg(svgLines);
const svgOut = join(ROOT, 'docs/assets/demo.svg');
if (outArg === -1) {
  mkdirSync(dirname(svgOut), { recursive: true });
  writeFileSync(svgOut, svg);
  console.log(`✓ wrote ${svgOut} (${svgLines.length} lines)`);
}

// --- Optional: render the GIF for the README if vhs is available ----------------------------
const hasVhs = spawnSync('vhs', ['--version'], { encoding: 'utf8' }).status === 0;
if (hasVhs && outArg === -1) {
  mkdirSync(join(ROOT, 'docs/assets'), { recursive: true });
  execFileSync('vhs', [join(ROOT, 'demo/mcpfold.tape')], { stdio: 'inherit', cwd: ROOT });
  console.log('✓ rendered docs/assets/demo.gif via vhs');
} else if (outArg === -1) {
  console.log(
    'ℹ vhs not found — skipped GIF render (cast is up to date). Install charmbracelet/vhs to render docs/assets/demo.gif.',
  );
}

// Cleanup the sandbox.
rmSync(home, { recursive: true, force: true });
rmSync(cwd, { recursive: true, force: true });
