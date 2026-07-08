import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// mcpfold.com marketing site — Vite + React, static output deployed to Cloudflare Pages at the
// root. Docs live under /docs (separate static build, S8.1); the app lives on its own subdomain.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { port: 5174 },
  preview: { port: 4174 },
});
