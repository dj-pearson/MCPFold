/**
 * Minimal static server for the prerender e2e (S15.1). Serves dist/ the way Cloudflare Pages does —
 * clean URLs resolved to prerendered files (`/directory` → dist/directory/index.html) — with NO SPA
 * fallback, so a hydration mismatch or a missing prerender surfaces as a test failure instead of
 * being masked by an index.html rewrite. Not used in production; Cloudflare Pages serves dist/.
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const dist = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist');
const port = Number(process.env.PORT ?? 4174);

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.xml': 'application/xml; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
  '.ico': 'image/x-icon',
};

/** Resolve a request path to a concrete file under dist (no traversal, no SPA fallback). */
function resolve(urlPath) {
  const clean = decodeURIComponent(urlPath.split('?')[0]);
  // normalize() collapses ../ ; then confine to dist.
  const rel = normalize(clean).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, rel);
  if (!file.startsWith(dist)) return null;
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  else if (!existsSync(file) && existsSync(`${file}/index.html`)) file = `${file}/index.html`;
  else if (!existsSync(file) && existsSync(`${file}.html`)) file = `${file}.html`;
  return existsSync(file) && statSync(file).isFile() ? file : null;
}

createServer((req, res) => {
  const file = resolve(req.url ?? '/');
  if (!file) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('404');
    return;
  }
  res.writeHead(200, { 'content-type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).pipe(res);
}).listen(port, () => console.log(`static server on http://localhost:${port} (dist/)`));
