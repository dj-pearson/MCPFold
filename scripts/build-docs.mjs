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
  ['coverage.md', 'Adapter coverage'],
  ['benchmark.md', 'Benchmark'],
  ['cli-contract.md', 'CLI contract'],
  ['completions.md', 'Shell completions'],
  ['team-config-as-code.md', 'Team config-as-code'],
  ['github-action.md', 'GitHub Action'],
  ['offline-contract.md', 'Offline contract'],
  ['self-hosting.md', 'Self-hosting'],
  ['site-hosting.md', 'Site hosting'],
  ['coolify-edge-service.md', 'Edge service'],
  ['security.md', 'Security'],
  ['security-posture.md', 'Security posture'],
  ['telemetry.md', 'Telemetry'],
  ['security-at-rest.md', 'At-rest hardening'],
  ['threat-model.md', 'Threat model'],
  ['pricing-model.md', 'Pricing model'],
  ['roadmap.md', 'Roadmap'],
  ['governance.md', 'Governance'],
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
  // Shared marketing-site shell (S13.4): same header, theme (mcpfold-theme localStorage key +
  // data-theme, so the toggle is consistent across mcpfold.com and /docs), and design tokens.
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${title} · mcpfold docs</title>
<script>try{var t=localStorage.getItem('mcpfold-theme');if(t)document.documentElement.setAttribute('data-theme',t);}catch(e){}</script>
<style>
  :root { color-scheme: light dark; --fg:#14161a; --bg:#fff; --bg-elevated:#f6f7f9; --muted:#5c6470; --border:#e4e7ec; --accent:#4c6ef5; --accent-fg:#fff; --code-bg:#f2f4f7; }
  @media (prefers-color-scheme: dark) { :root { --fg:#e8ebf0; --bg:#0b0d12; --bg-elevated:#14171f; --muted:#9aa3b2; --border:#262b36; --accent:#748ffc; --code-bg:#161a22; } }
  :root[data-theme='light'] { --fg:#14161a; --bg:#fff; --bg-elevated:#f6f7f9; --muted:#5c6470; --border:#e4e7ec; --accent:#4c6ef5; --code-bg:#f2f4f7; }
  :root[data-theme='dark'] { --fg:#e8ebf0; --bg:#0b0d12; --bg-elevated:#14171f; --muted:#9aa3b2; --border:#262b36; --accent:#748ffc; --code-bg:#161a22; }
  * { box-sizing: border-box; }
  body { margin:0; color:var(--fg); background:var(--bg); font:16px/1.6 ui-sans-serif,system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
  header.site { position:sticky; top:0; z-index:20; display:flex; align-items:center; gap:1.5rem; height:60px; padding:0 1.5rem; border-bottom:1px solid var(--border); background:color-mix(in srgb, var(--bg) 88%, transparent); backdrop-filter:blur(8px); }
  header.site .brand { font-weight:800; font-size:1.15rem; color:var(--fg); text-decoration:none; }
  header.site nav.top { display:flex; gap:1.5rem; align-items:center; margin-left:auto; }
  header.site nav.top a { color:var(--muted); text-decoration:none; }
  header.site nav.top a:hover { color:var(--fg); }
  .search { position:relative; }
  .search input { padding:6px 10px; border:1px solid var(--border); border-radius:8px; background:var(--bg-elevated); color:var(--fg); width:180px; }
  #docs-search-results { display:none; position:absolute; right:0; top:38px; width:320px; max-height:60vh; overflow:auto; background:var(--bg); border:1px solid var(--border); border-radius:8px; box-shadow:0 8px 24px rgba(0,0,0,.15); z-index:30; }
  #docs-search-results a.sr { display:block; padding:.5rem .7rem; text-decoration:none; color:var(--fg); border-bottom:1px solid var(--border); }
  #docs-search-results a.sr:hover { background:var(--bg-elevated); }
  #docs-search-results a.sr strong { display:block; color:var(--accent); }
  #docs-search-results a.sr span { font-size:.85rem; color:var(--muted); }
  #docs-search-results .sr-empty { padding:.6rem .7rem; color:var(--muted); }
  button.theme { background:transparent; border:1px solid var(--border); border-radius:8px; color:var(--fg); cursor:pointer; padding:4px 10px; }
  .wrap { display:grid; grid-template-columns:220px minmax(0,1fr); max-width:1080px; margin:0 auto; }
  nav.side { position:sticky; top:60px; align-self:start; padding:2rem 1rem; border-right:1px solid var(--border); height:calc(100vh - 60px); overflow:auto; }
  nav.side a { display:block; padding:.3rem .5rem; color:var(--muted); text-decoration:none; border-radius:6px; font-size:.95rem; }
  nav.side a:hover { background:var(--code-bg); color:var(--fg); }
  nav.side a.active { color:var(--accent); font-weight:600; }
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
  @media (max-width:720px){ .wrap{grid-template-columns:1fr;} nav.side{position:static;height:auto;border-right:none;border-bottom:1px solid var(--border);} .search input{width:120px;} }
</style>
</head>
<body>
<header class="site">
  <a class="brand" href="/">mcpfold</a>
  <nav class="top">
    <a href="/install">Install</a>
    <a href="/docs">Docs</a>
    <a href="https://github.com/dj-pearson/MCPFold" rel="noreferrer">GitHub</a>
    <div class="search">
      <input id="docs-search" type="search" placeholder="Search docs…" aria-label="Search docs" data-testid="docs-search" autocomplete="off" />
      <div id="docs-search-results" role="listbox"></div>
    </div>
    <button class="theme" type="button" aria-label="Toggle color theme" data-testid="theme-toggle"
      onclick="(function(){var d=document.documentElement;var n=(d.getAttribute('data-theme')||(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'))==='dark'?'light':'dark';d.setAttribute('data-theme',n);try{localStorage.setItem('mcpfold-theme',n);}catch(e){}})()">◐</button>
  </nav>
</header>
<div class="wrap">
<nav class="side">${navHtml}</nav>
<main>${bodyHtml}</main>
</div>
<script src="search-index.js"></script>
<script src="search.js"></script>
</body>
</html>
`;
}

rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });

/** Add id="<slug>" to every heading (S13.4) using the same slug() the link-checker validates
 * against, so `page.html#anchor` deep links resolve in the rendered HTML. */
function addHeadingIds(html) {
  return html.replace(/<(h[1-6])>([\s\S]*?)<\/\1>/g, (_m, tag, inner) => {
    const text = inner.replace(/<[^>]+>/g, '');
    return `<${tag} id="${slug(text)}">${inner}</${tag}>`;
  });
}

/** Strip markdown to plain text for the search index. */
function plainText(md) {
  return md
    .replace(/```[\s\S]*?```/g, ' ') // code fences
    .replace(/`[^`]*`/g, ' ') // inline code
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1') // links/images → label
    .replace(/[#>*_~|-]/g, ' ') // markdown punctuation
    .replace(/\s+/g, ' ')
    .trim();
}

const searchIndex = [];
for (const [file, label] of NAV) {
  const outName = file.replace(/\.md$/, '.html');
  const navHtml = NAV.map(([f, l]) => {
    const href = f.replace(/\.md$/, '.html');
    const active = f === file ? ' class="active"' : '';
    return `<a href="${href}"${active}>${l}</a>`;
  }).join('');
  const bodyHtml = addHeadingIds(marked.parse(rewriteLinks(source.get(file))));
  writeFileSync(join(OUT, outName), page(label, bodyHtml, navHtml));
  searchIndex.push({
    title: label,
    url: outName,
    text: plainText(source.get(file)).slice(0, 2000),
  });
}

// Home is also served at / — index.html already generated from index.md above.

// ---- Client-side search (S13.4): index as a global (no fetch → works from static/file://) ------
writeFileSync(
  join(OUT, 'search-index.js'),
  `window.__DOCS_INDEX__ = ${JSON.stringify(searchIndex)};\n`,
);
writeFileSync(
  join(OUT, 'search.js'),
  readFileSync(join(ROOT, 'apps', 'site', 'src', 'docs', 'search.js'), 'utf8'),
);

// ---- Stage the hosted JSON schemas at their stable paths ------------------------------
const schema = readFileSync(SCHEMA_SRC, 'utf8');
JSON.parse(schema); // fail if the committed schema isn't valid JSON
mkdirSync(join(OUT, 'schema'), { recursive: true });
// The current schema is v2 (S17.5). Serve it at /schema/v2.json; keep /schema/v1.json resolving so
// existing `$schema` pointers still work ($schema is advisory and v1 configs auto-migrate on load).
writeFileSync(join(OUT, 'schema', 'v2.json'), schema);
writeFileSync(join(OUT, 'schema', 'v1.json'), schema);

// The org-policy schema (S18.3), served at /schema/policy/v1.json.
const policySchema = readFileSync(
  join(ROOT, 'packages', 'schema', 'mcp.policy.schema.json'),
  'utf8',
);
JSON.parse(policySchema);
mkdirSync(join(OUT, 'schema', 'policy'), { recursive: true });
writeFileSync(join(OUT, 'schema', 'policy', 'v1.json'), policySchema);

// Pages plumbing: custom domain + skip Jekyll (we ship finished HTML).
writeFileSync(join(OUT, 'CNAME'), 'mcpfold.com\n');
writeFileSync(join(OUT, '.nojekyll'), '');

console.log(
  `✓ built ${NAV.length} pages + search index + /schema/v1.json → dist-docs/ (unified shell)`,
);
