import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// mcpfold web console — Vite + React, deployed to Cloudflare Pages (static output in dist/).
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist' },
  server: { port: 5173 },
  preview: { port: 4173 },
});
