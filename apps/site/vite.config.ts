import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The install page shows the current version sourced from the CLI package (never hardcoded);
// changesets bumps it on release, so the site always matches the published npm version.
const cliPkg = JSON.parse(
  readFileSync(fileURLToPath(new URL('../../packages/cli/package.json', import.meta.url)), 'utf8'),
);

// mcpfold.com marketing site — Vite + React, static output deployed to Cloudflare Pages at the
// root. Docs live under /docs (separate static build, S8.1); the app lives on its own subdomain.
export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(cliPkg.version) },
  build: { outDir: 'dist' },
  server: { port: 5174 },
  preview: { port: 4174 },
});
