/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  /** Base URL of the mcpfold edge API (push/pull). Defaults to https://functions.mcpfold.com. */
  readonly VITE_API_URL?: string;
  /** "1" swaps the real Supabase auth + cloud API for in-memory mocks (Playwright e2e). */
  readonly VITE_E2E?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
