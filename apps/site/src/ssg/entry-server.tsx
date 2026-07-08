import { StrictMode } from 'react';
import { renderToString } from 'react-dom/server';
import { StaticRouter } from 'react-router-dom/server';
import { App } from '../App';
import { resolveMeta } from '../seo/meta';
import { jsonLdScriptTags } from '../seo/jsonld';

/**
 * SSG entry (S15.1). Built as a separate Vite SSR bundle and driven by scripts/prerender.mjs to
 * render each route's real HTML at build time. The client (main.tsx) hydrates the same tree, so
 * crawlers/LLMs get full content in the initial HTML while the SPA still works.
 */
export { allRoutes } from '../seo/meta';

export interface RenderResult {
  /** Rendered app HTML to drop into <div id="root">. */
  appHtml: string;
  /** Canonical per-route meta (title/description/canonical), for reconciling <head> tags. */
  meta: { title: string; description: string; canonical: string };
  /** JSON-LD <script> tags (already escaped) to inject before </head>. */
  jsonLd: string;
}

/** Render one route to HTML + the head data the prerender script injects. `url` is a pathname. */
export function render(url: string): RenderResult {
  const appHtml = renderToString(
    <StrictMode>
      <StaticRouter location={url}>
        <App />
      </StaticRouter>
    </StrictMode>,
  );

  return { appHtml, meta: resolveMeta(url), jsonLd: jsonLdScriptTags(url) };
}
