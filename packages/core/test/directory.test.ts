import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import {
  DIRECTORY,
  MIN_CATEGORY_ENTRIES,
  CATEGORY_META,
  categoriesWithPages,
  categoryHasPage,
  entriesForCategory,
  directorySeedSql,
} from '../src/directory.js';

const here = dirname(fileURLToPath(import.meta.url));
const seedPath = join(here, '..', '..', '..', 'supabase', 'seed', 'directory.sql');
const norm = (s: string) => s.replace(/\r\n/g, '\n');

describe('directory (S15.4)', () => {
  it('is a large, deduplicated set of valid entries', () => {
    // Curated floor — grows toward 150+ as more servers are verified (documented follow-up).
    expect(DIRECTORY.length).toBeGreaterThanOrEqual(60);
    const ids = new Set(DIRECTORY.map((e) => e.id));
    expect(ids.size, 'ids are unique').toBe(DIRECTORY.length);
    for (const e of DIRECTORY) {
      expect(e.id, `id: ${e.id}`).toMatch(/^[a-z0-9-]+$/);
      expect(e.name.length, `name: ${e.id}`).toBeGreaterThan(0);
      expect(e.description.length, `description: ${e.id}`).toBeGreaterThan(10);
      expect(e.suggestedTags.length, `tags: ${e.id}`).toBeGreaterThan(0);
      if (e.transport === 'stdio') {
        expect(e.command, `command: ${e.id}`).toBeTruthy();
        expect(e.args?.length, `args: ${e.id}`).toBeGreaterThan(0);
      } else {
        expect(e.url, `url: ${e.id}`).toBeTruthy();
      }
    }
  });

  it('lists tokens only as ${scheme:path} references, never values', () => {
    for (const e of DIRECTORY) {
      if (e.tokenRef) expect(e.tokenRef, e.id).toMatch(/^\$\{[a-z]+:[^}]+\}$/);
    }
  });

  it('every tag used has a label in CATEGORY_META', () => {
    for (const e of DIRECTORY) {
      for (const t of e.suggestedTags) {
        expect(CATEGORY_META[t], `tag "${t}" (on ${e.id}) needs CATEGORY_META`).toBeTruthy();
      }
    }
  });

  it('thin-page guard: a category page renders only with >= MIN_CATEGORY_ENTRIES entries', () => {
    const paged = categoriesWithPages();
    expect(paged.length).toBeGreaterThan(0);
    for (const c of paged) {
      expect(entriesForCategory(c.id).length).toBeGreaterThanOrEqual(MIN_CATEGORY_ENTRIES);
    }
    // A tag below the threshold labels its servers but gets no standalone page.
    const thin = Object.keys(CATEGORY_META).filter(
      (t) =>
        entriesForCategory(t).length > 0 && entriesForCategory(t).length < MIN_CATEGORY_ENTRIES,
    );
    expect(thin.length, 'the fixture exercises the thin-page guard').toBeGreaterThan(0);
    for (const t of thin) {
      expect(categoryHasPage(t)).toBe(false);
      expect(paged.find((c) => c.id === t)).toBeUndefined();
    }
  });

  it('the SQL seed mirrors DIRECTORY exactly (no drift)', () => {
    const committed = norm(readFileSync(seedPath, 'utf8'));
    expect(
      committed,
      'run `pnpm --filter @mcpfold/core gen:directory-seed` to refresh the seed',
    ).toBe(norm(directorySeedSql()));
    // Every entry id appears in the seed.
    for (const e of DIRECTORY) expect(committed).toContain(`('${e.id}',`);
  });
});
