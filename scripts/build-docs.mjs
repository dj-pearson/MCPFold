#!/usr/bin/env node
/**
 * Docs site build (S8.1). Renders docs/*.md into a self-contained static site under
 * dist-docs/, stages the generated JSON schema at a stable path, and — the point of
 * running it in CI — fails on any broken internal link or missing required page. No
 * network, no framework; just marked + a template so the cross-OS matrix stays fast.
 *
 * Usage: node scripts/build-docs.mjs   (add --check to validate without writing output)
 */
import { readFileSync, writeFileSync, readdirSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { join, dirname, basename, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { marked } from 'marked';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DOCS = join(ROOT, 'docs');
const OUT = join(ROOT, 'dist-docs');
const REPO_BLOB = 'https://github.com/dj-pearson/MCPFold/blob/main';
const SCHEMA_SRC = join(ROOT, 'packages', 'schema', 'mcp.config.schema.json');
const checkOnly = process.argv.includes('--check');

/** Pages must exist and appear in the nav, in this order. Guards the acceptance criteria. */
const NAV = [
  ['index.md', 'Home'],
  ['install.md', 'Install'],
  ['quickstart.md', 'Quickstart'],
  ['config-format.md', 'Config format'],
  ['secrets.md', 'Secrets'],
  ['adapters.md', 'Adapters'],
  ['benchmark.md', 'Benchmark'],
  ['cli-contract.md', 'CLI contract'],
  ['team-config-as-code.md', 'Team config-as-code'],
  ['offline-contract.md', 'Offline contract'],
  ['self-hosting.md', 'Self-hosting'],
  ['site-hosting.md', 'Site hosting'],
  ['coolify-edge-service.md', 'Edge service'],
  ['security.md', 'Security'],
  ['security-at-rest.md', 'At-rest hardening'],
  ['threat-model.md', 'Threat model'],
  ['ci.md', 'CI'],
];

const errors = [];

/** GitHub-flavored heading slug, so in-doc `#anchor` links can be validated. */
function slug(text) {
  return text
    .trim()
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-');
}

function headingSlugs(md) {
  const set = new Set();
  for (const line of md.split('\n')) {
    const m = /^#{1,6}\s+(.*)$/.exec(line);
    if (m) set.add(slug(m[1].replace(/`/g, '')));
  }
  return set;
}

// ---- Load every doc, index its anchors ------------------------------------------------
const mdFiles = readdirSync(DOCS).filter((f) => f.endsWith('.md'));
const anchors = new Map(); // file -> Set<slug>
const source = new Map(); // file -> markdown
for (const f of mdFiles) {
  const md = readFileSync(join(DOCS, f), 'utf8');
  source.set(f, md);
  anchors.set(f, headingSlugs(md));
}

for (const [file] of NAV) {
  if (!source.has(file)) errors.push(`Required doc page is missing: docs/${file}`);
}

// ---- Validate every relative link -----------------------------------------------------
const LINK_RE = /\[[^\]]*\]\(([^)]+)\)/g;
for (const [file, md] of source) {
  let m;
  while ((m = LINK_RE.exec(md))) {
    const raw = m[1].trim();
    if (/^(https?:|mailto:)/.test(raw)) continue; // external — not our job to verify
    const [target, anchor] = raw.split('#');
    if (target === '') {
      // Same-page anchor.
      if (anchor && !anchors.get(file).has(anchor))
        errors.push(`docs/${file}: broken anchor #${anchor}`);
      continue;
    }
    if (target.endsWith('.md')) {
      const name = basename(target);
      if (!source.has(name)) {
        errors.push(`docs/${file}: link to missing doc "${target}"`);
      } else if (anchor && !anchors.get(name).has(anchor)) {
        errors.push(`docs/${file}: link to missing anchor "${target}#${anchor}"`);
      }
      continue;
    }
    // Repo-relative link (e.g. ../packages/...); must exist on disk.
    const abs = join(DOCS, target);
    if (!existsSync(abs)) errors.push(`docs/${file}: repo link to missing path "${target}"`);
  }
}

if (errors.length) {
  console.error(`✗ docs build failed with ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(`✓ ${mdFiles.length} docs, links + anchors valid`);

if (checkOnly) {
  console.log('✓ --check passed (no output written)');
  process.exit(0);
}

// ---- Render to a static site ----------------------------------------------------------
/** Rewrite relative links for the flat rendered site. */
function rewriteLinks(md) {
  return md.replace(LINK_RE, (whole, href) => {
    const label = whole.slice(1, whole.indexOf(']'));
    const h = href.trim();
    if (/^(https?:|mailto:)/.test(h)) return whole;
    const [target, anchor] = h.split('#');
    const frag = anchor ? `#${anchor}` : '';
    if (target === '') return whole; // same-page anchor
    if (target.endsWith('.md'))
      return `[${label}](${basename(target).replace(/\.md$/, '.html')}${frag})`;
    // Repo file → GitHub blob URL.
    const rel = relative(ROOT, join(DOCS, target)).split('\\').join('/');
    return `[${label}](${REPO_BLOB}/${rel}${frag})`;
  });
}

function page(title, bodyHtml, navHtml) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · mcpfold</title>
<style>
  :root { color-scheme: light dark; --fg:#1a1a1a; --bg:#fff; --muted:#666; --border:#e2e2e2; --accent:#3b5bdb; --code-bg:#f5f5f5; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8e8e8; --bg:#161616; --muted:#9aa0a6; --border:#333; --accent:#8ea2ff; --code-bg:#1e1e1e; } }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--fg); background:var(--bg); font:16px/1.6 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  .wrap { display:grid; grid-template-columns:220px minmax(0,1fr); max-width:1080px; margin:0 auto; }
  nav { position:sticky; top:0; align-self:start; padding:2rem 1rem; border-right:1px solid var(--border); height:100vh; overflow:auto; }
  nav a { display:block; padding:.3rem .5rem; color:var(--muted); text-decoration:none; border-radius:6px; font-size:.95rem; }
  nav a:hover { background:var(--code-bg); color:var(--fg); }
  nav a.active { color:var(--accent); font-weight:600; }
  nav .brand { font-weight:700; color:var(--fg); font-size:1.1rem; margin-bottom:1rem; }
  main { padding:2rem 2.5rem; min-width:0; }
  main a { color:var(--accent); }
  h1,h2,h3 { line-height:1.25; }
  h2 { margin-top:2.2rem; padding-top:.6rem; border-top:1px solid var(--border); }
  code { background:var(--code-bg); padding:.15em .4em; border-radius:4px; font-size:.9em; }
  pre { background:var(--code-bg); padding:1rem; border-radius:8px; overflow:auto; }
  pre code { background:none; padding:0; }
  table { border-collapse:collapse; width:100%; overflow:auto; display:block; }
  th,td { border:1px solid var(--border); padding:.4rem .6rem; text-align:left; }
  blockquote { margin:1rem 0; padding:.4rem 1rem; border-left:3px solid var(--accent); color:var(--muted); }
  @media (max-width:720px){ .wrap{grid-template-columns:1fr;} nav{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border);} }
</style>
</head>
<body>
<div class="wrap">
<nav>${navHtml}</nav>
<main>${bodyHtml}</main>
</div>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

for (const [file, label] of NAV) {
  const outName = file.replace(/\.md$/, '.html');
  const navHtml =
    `<div class="brand">mcpfold</div>` +
    NAV.map(([f, l]) => {
      const href = f.replace(/\.md$/, '.html');
      const active = f === file ? ' class="active"' : '';
      return `<a href="${href}"${active}>${l}</a>`;
    }).join('');
  const bodyHtml = marked.parse(rewriteLinks(source.get(file)));
  writeFileSync(join(OUT, outName), page(label, bodyHtml, navHtml));
}

// Home is also served at / — index.html already generated from index.md above.

// ---- Stage the hosted JSON schema at a stable path ------------------------------------
const schema = readFileSync(SCHEMA_SRC, 'utf8');
JSON.parse(schema); // fail if the committed schema isn't valid JSON
mkdirSync(join(OUT, 'schema'), { recursive: true });
writeFileSync(join(OUT, 'schema', 'v1.json'), schema);

// Pages plumbing: custom domain + skip Jekyll (we ship finished HTML).
writeFileSync(join(OUT, 'CNAME'), 'mcpfold.com\n');
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(`✓ built ${NAV.length} pages + /schema/v1.json → dist-docs/`);
