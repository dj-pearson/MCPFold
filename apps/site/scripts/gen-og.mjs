/**
 * Per-page Open Graph image generation (S15.8).
 *
 * Instead of one static og.png shared by every page, each route gets a templated 1200×630 card that
 * shows its own title — generated deterministically from the route's <title> with no image
 * dependency (a self-contained SVG). gen-seo.mjs calls {@link renderOgSvg} inside its route loop,
 * writes dist/og/<route>.svg, and rewrites that route's og:image / twitter:image to point at it.
 *
 * Run standalone (`node scripts/gen-og.mjs`) to (re)generate every card from the SSR bundle.
 *
 * SVG keeps the pipeline dependency-free and crisp at any size; rasterizing to PNG at the edge (for
 * the few scrapers that reject SVG) is a documented deploy-time follow-up — see docs/seo-measurement.md.
 */
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const xml = (s) =>
  String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

/** Greedy word-wrap into at most `maxLines` lines of about `maxChars` characters. */
function wrap(text, maxChars, maxLines) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const w of words) {
    if (line && (line + ' ' + w).length > maxChars) {
      lines.push(line);
      line = w;
      if (lines.length === maxLines - 1) break;
    } else {
      line = line ? `${line} ${w}` : w;
    }
  }
  if (line && lines.length < maxLines) lines.push(line);
  // If we truncated, ellipsize the last line.
  const used = lines.join(' ').split(/\s+/).length;
  if (used < words.length && lines.length) lines[lines.length - 1] += '…';
  return lines;
}

/** Render a self-contained 1200×630 OG card SVG for a page title. */
export function renderOgSvg({ title, eyebrow = 'mcpfold', domain = 'mcpfold.com' }) {
  // Strip a trailing "· mcpfold" / "— mcpfold" so the card doesn't repeat the wordmark.
  const clean = title.replace(/\s*[·—-]\s*mcpfold.*$/i, '').trim() || title;
  const lines = wrap(clean, 24, 3);
  const startY = 300 - (lines.length - 1) * 38;
  const tspans = lines
    .map((l, i) => `<tspan x="80" y="${startY + i * 76}">${xml(l)}</tspan>`)
    .join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630" role="img" aria-label="${xml(clean)}">
  <rect width="1200" height="630" fill="#0b0b12"/>
  <rect width="1200" height="10" y="0" fill="#6d5efc"/>
  <text x="80" y="120" font-family="Inter, system-ui, sans-serif" font-size="34" font-weight="700" fill="#9b93ff">${xml(eyebrow)}</text>
  <text font-family="Inter, system-ui, sans-serif" font-size="64" font-weight="800" fill="#f5f5fa">${tspans}</text>
  <text x="80" y="560" font-family="Inter, system-ui, sans-serif" font-size="30" fill="#8a8aa0">${xml(domain)} · one MCP config for every client</text>
</svg>
`;
}

/** Map a route pathname to its OG file path under dist/og (mirrors the route tree). */
export function ogPathForRoute(route) {
  if (route === '/') return 'og/index.svg';
  return `og/${route.split('/').filter(Boolean).join('/')}.svg`;
}

// --- Standalone: regenerate every card from the SSR bundle ----------------------------------
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const here = dirname(fileURLToPath(import.meta.url));
  const dist = join(here, '..', 'dist');
  const ssrEntry = join(here, '..', 'dist-ssr', 'entry-server.js');
  if (!existsSync(ssrEntry)) {
    console.error('✗ dist-ssr/entry-server.js not found — run `vite build --ssr` first.');
    process.exit(1);
  }
  const { allRoutes, render } = await import(pathToFileURL(ssrEntry).href);
  let n = 0;
  for (const route of allRoutes()) {
    const svg = renderOgSvg({ title: render(route).meta.title });
    const out = join(dist, ogPathForRoute(route));
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, svg);
    n++;
  }
  console.log(`✓ generated ${n} per-page OG cards under dist/og/`);
}
