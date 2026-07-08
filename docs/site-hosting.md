# Site hosting & routing

How the three public surfaces coexist under `mcpfold.com` (S13.1).

## Surfaces & routes

| Surface           | Path / host           | Build                       |
| ----------------- | --------------------- | --------------------------- |
| Marketing site    | `mcpfold.com/` (root) | `apps/site` (Vite + React)  |
| Docs              | `mcpfold.com/docs/`   | `dist-docs/` (static, S8.1) |
| Web app / console | `app.mcpfold.com`     | `apps/web` (E7)             |

The **site owns the root** and deploys to Cloudflare Pages. The **docs** are mounted at `/docs`
(the docs static build is placed at `dist/docs` in the same Pages deployment, or served by a Pages
route). The **app** lives on its own `app.` subdomain so authenticated routes never collide with
marketing or docs paths. Cloudflare serves static files (including `/docs/*`) before the SPA
fallback in [`_redirects`](../apps/site/public/_redirects), so `/*  /index.html  200` only catches
unmatched marketing routes.

> Note: the docs currently deploy to GitHub Pages (S8.1). Moving them under `mcpfold.com/docs` on
> Cloudflare Pages (or fronting both with a Cloudflare route) is the one-time hosting cutover; the
> `CNAME` and deploy target move from GitHub Pages to Cloudflare.

## Deploy pipeline

[`.github/workflows/site.yml`](../.github/workflows/site.yml) builds `apps/site`, runs the
Playwright checks and a Lighthouse budget on every PR, and deploys to Cloudflare Pages —
production on `main`, a preview URL per PR.

**NEEDS (user, one-time):** `CLOUDFLARE_API_TOKEN` + `CLOUDFLARE_ACCOUNT_ID` repo secrets and a
`mcpfold-site` Pages project. Until set, the deploy step is skipped (the build + budget still run).

## Performance & accessibility budget

CI runs Lighthouse against the built site with thresholds in
[`apps/site/lighthouserc.json`](../apps/site/lighthouserc.json): performance ≥ 0.90, accessibility
≥ 0.95, SEO ≥ 0.95. A regression fails the PR.

## Analytics

Privacy-friendly by design: **cookieless, no PII, no cross-site tracking, no consent wall.** The
loader in [`apps/site/src/analytics.ts`](../apps/site/src/analytics.ts) is **off by default** and
only injects the script when the site is built with both env vars set — so local dev and PR
previews never phone home:

```
VITE_ANALYTICS_SRC=https://plausible.io/js/script.js
VITE_ANALYTICS_DOMAIN=mcpfold.com
```

Any Plausible/Umami-compatible endpoint works. We collect aggregate page views only — never
identifiers, never fingerprints.
