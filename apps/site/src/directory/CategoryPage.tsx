import { Link, useParams } from 'react-router-dom';
import {
  categoriesWithPages,
  categoryHasPage,
  categoryMeta,
  entriesForCategory,
} from '@mcpfold/core';
import { Container } from '../design/components';

/**
 * Programmatic collection page (S15.4): /directory/category/<tag>. Renders the servers in a
 * category as an indexable, ItemList-backed listicle ("Best <category> MCP servers"). Only
 * categories that clear MIN_CATEGORY_ENTRIES get here (see meta.allRoutes → categoriesWithPages);
 * an under-populated or unknown category renders a not-found stub and is never linked or prerendered
 * (thin-page / index-bloat guard).
 */
export function CategoryPage() {
  const { cat } = useParams<{ cat: string }>();
  // Thin-page guard: only categories that clear MIN_CATEGORY_ENTRIES get a real page. A tag below
  // the threshold (or an unknown one) renders the not-found stub — it is never prerendered, linked,
  // or in the sitemap either.
  const entries = cat && categoryHasPage(cat) ? entriesForCategory(cat) : [];

  if (!cat || !categoryHasPage(cat)) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Category not found</h1>
        <p>
          No such category. <Link to="/directory">Back to the directory</Link>.
        </p>
      </Container>
    );
  }

  const m = categoryMeta(cat);
  const others = categoriesWithPages().filter((c) => c.id !== cat);

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/directory">← All MCP servers</Link>
      </p>
      <h1>Best {m.label} MCP servers</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 640 }}>
        {m.description} A neutral, community-maintained list — add any to your config in one
        command.
      </p>

      <div
        data-testid="category-entries"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          margin: 'var(--space-6) 0 var(--space-10)',
        }}
      >
        {entries.map((entry) => (
          <Link
            key={entry.id}
            to={`/directory/${entry.id}`}
            data-testid={`entry-${entry.id}`}
            style={{
              display: 'block',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              background: 'var(--bg-elevated)',
              padding: 'var(--space-4)',
              color: 'var(--fg)',
              textDecoration: 'none',
            }}
          >
            <strong>{entry.name}</strong>
            <p
              style={{
                color: 'var(--fg-muted)',
                margin: 'var(--space-2) 0 0',
                fontSize: '0.92rem',
              }}
            >
              {entry.description}
            </p>
          </Link>
        ))}
      </div>

      <h2>Browse other categories</h2>
      <nav
        data-testid="category-nav"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
      >
        {others.map((c) => (
          <Link
            key={c.id}
            to={`/directory/category/${c.id}`}
            style={{
              fontSize: '0.9rem',
              padding: '4px 12px',
              borderRadius: 999,
              border: '1px solid var(--border)',
              color: 'var(--fg-muted)',
              textDecoration: 'none',
            }}
          >
            {c.label}
          </Link>
        ))}
      </nav>
    </Container>
  );
}
