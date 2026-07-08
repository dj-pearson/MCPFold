/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_ANALYTICS_SRC?: string;
  readonly VITE_ANALYTICS_DOMAIN?: string;
}
interface ImportMeta {
  readonly env: ImportMetaEnv;
}

/** Injected at build time from packages/cli/package.json (see vite.config.ts). */
declare const __APP_VERSION__: string;
