# SEO & GEO measurement (S15.8)

Once the programmatic pages multiply (directory, categories, guides, glossary, compare), technical
hygiene and measurement become the gate on results. This is the operating manual: what the build
enforces automatically, what is submitted to engines on deploy, and the lightweight cadence for
tracking rank and AI-answer (GEO) citations.

## Source of truth: the keyword → page map

`apps/site/src/seo/keyword-map.ts` lists every target query against the **one** canonical page meant
to rank for it, with rough monthly volume and intent. It is the single source for rank tracking and
the GEO prompt checklist. The build **fails** if any mapped page is not a real prerendered route (so a
renamed or deleted page can never leave a tracked keyword pointing at a 404) — see
`apps/site/scripts/seo-audit.mjs`.

Add a keyword row when a new page is meant to rank for a term; remove it when the intent changes.

## What the build enforces (index-bloat + hygiene)

`apps/site/scripts/gen-seo.mjs` runs on every build (`pnpm --filter @mcpfold/site build`) and fails on:

- **Missing meta** — any route without a page-specific `<title>`, a meta description, and a canonical
  that matches its own URL. A route that falls back to the generic `mcpfold` title is treated as
  missing meta, so a new route added without meta breaks the build instead of shipping thin.
- **Duplicate canonicals** — two routes resolving to the same canonical (duplicate-content guard).
- **Dead keyword targets** — any `keyword-map.ts` page that is not a prerendered route.

Thin/under-populated pages are kept out of the index by **construction**: `allRoutes()` only includes
pages that clear their threshold (e.g. a directory category needs `MIN_CATEGORY_ENTRIES`), so they are
never prerendered, linked, or in the sitemap. Run the guard logic standalone with
`pnpm --filter @mcpfold/site seo:audit`.

## Sitemap at scale

`gen-seo.mjs` emits a **sitemap index** (`/sitemap.xml`) that references typed child sitemaps —
`sitemap-core.xml`, `sitemap-directory.xml`, `sitemap-categories.xml`, `sitemap-blog.xml`, and
`sitemap-guides.xml` / `sitemap-glossary.xml` / `sitemap-compare.xml` as those page types land — each
with `<lastmod>`. New page types slot in automatically by their route prefix; nothing to hand-edit.
`robots.txt` (shipped from `apps/site/public/`) points crawlers at the index.

## Per-page Open Graph images

Each route gets a templated 1200×630 card generated from its own `<title>`
(`apps/site/scripts/gen-og.mjs`), written to `dist/og/<route>.svg` and wired into that page's
`og:image` / `twitter:image` — no more single shared baseline. SVG keeps the pipeline
dependency-free and crisp; a small number of social scrapers prefer PNG, so rasterizing the cards to
PNG at the edge (Cloudflare Image Resizing / a build-time rasterizer) is the one open follow-up.

## Instant indexing: IndexNow on deploy

`apps/site/scripts/indexnow.mjs` writes the key-ownership file (`<key>.txt`) into `dist/` and POSTs the
current sitemap URLs to the IndexNow endpoint, which notifies Bing/Yandex (and, via Cloudflare's
crawler-hints integration, is forwarded further) near-instantly instead of waiting for a crawl.

Wire-up (Cloudflare Pages):

1. Generate a key (a 32+ char hex string) and set it as `INDEXNOW_KEY` in the Pages project env.
2. After the publish step, run `node apps/site/scripts/indexnow.mjs` (no `--dry-run`).

Without `INDEXNOW_KEY` the script is a safe no-op; run it with `--dry-run` to preview the exact payload.

## Search Console + Bing Webmaster verification (one-time)

1. **Google Search Console** — add `https://mcpfold.com` as a domain property; verify by the DNS TXT
   record (Cloudflare DNS). Submit `https://mcpfold.com/sitemap.xml` under Sitemaps.
2. **Bing Webmaster Tools** — add the site; verify by DNS TXT (or import from Search Console). Submit
   the same sitemap index. Bing also consumes the IndexNow pings above.

Record the verification date and property owner in the deploy runbook.

## Rank + GEO tracking cadence

- **Rank (weekly).** For each `keyword-map.ts` row, record the ranking URL + position from Search
  Console's Performance report (or a rank tracker). Watch that the ranking URL matches the intended
  `page` — a mismatch means two pages are competing and one should be consolidated or re-canonicalized.
- **GEO / AI citations (weekly).** Run the prompt checklist from the GEO playbook
  ([geo-playbook.md](./geo-playbook.md)) against the major assistants for the `geo: true` head terms
  (e.g. "what is an MCP config manager", "best MCP servers"), and log whether mcpfold is mentioned and
  whether the cited facts are accurate. File a docs/site fix when an assistant gets a fact wrong.

Keep results in a simple append-only log (a dated table in the deploy runbook or a tracking sheet) so
trends — not just snapshots — are visible.
