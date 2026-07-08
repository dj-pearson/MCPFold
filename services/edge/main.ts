// Standalone entry for the side Docker service (S6.5). The container runs this; the managed
// Supabase runtime can instead mount `functions/*` directly. All logic lives in src/server.ts.

export { createRouter, loadConfig, runServer } from "./src/server.ts";

import { runServer } from "./src/server.ts";

if (import.meta.main) {
  await runServer();
}
