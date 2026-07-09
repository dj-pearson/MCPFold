/**
 * Regenerate supabase/seed/directory.sql from the single source (packages/core DIRECTORY).
 * Run after changing DIRECTORY: `pnpm --filter @mcpfold/core gen:directory-seed`.
 * `directory.test.ts` fails if the committed SQL drifts from `directorySeedSql()`.
 */
import { writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { directorySeedSql } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', '..', '..', 'supabase', 'seed', 'directory.sql');
writeFileSync(out, directorySeedSql());
console.log(`✓ wrote ${out}`);
