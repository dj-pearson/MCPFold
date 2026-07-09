import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { DIRECTORY, categoriesWithPages, searchDirectory } from '@mcpfold/core';
import { FaqSection } from '../seo/FaqSection';
import { Container } from '../design/components';

/**
 * Public MCP server directory (S13.5) — browsable + searchable, each entry with its own indexable
 * page. A neutral, community-maintained list; mcpfold is not affiliated with or endorsed by these
 * projects. Shares its data with the app via @mcpfold/core (single source).
 */
export function DirectoryList() {
  const [query, setQuery] = useState('');
  const results = useMemo(() => searchDirectory(query), [query]);
  const categories = useMemo(() => categoriesWithPages(), []);

  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Best MCP servers — the directory</h1>
        <p style={{ color: 'var(--fg-muted)', maxWidth: 640 }}>
          Browse {DIRECTORY.length}+ MCP servers, curated and grouped by category. A neutral,
          community-maintained list — mcpfold is not affiliated with or endorsed by these projects.
          Add any to your config in one command.
        </p>

        <h2 style={{ marginTop: 'var(--space-8)' }}>Browse by category</h2>
        <nav
          data-testid="category-nav"
          style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-2)' }}
        >
          {categories.map((c) => (
            <Link
              key={c.id}
              to={`/directory/category/${c.id}`}
              data-testid={`category-${c.id}`}
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

        <input
          type="search"
          placeholder="Search servers…"
          aria-label="Search servers"
          data-testid="directory-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          style={{
            width: '100%',
            maxWidth: 420,
            padding: 'var(--space-3) var(--space-4)',
            margin: 'var(--space-6) 0',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-elevated)',
            color: 'var(--fg)',
          }}
        />

        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          }}
        >
          {results.map((entry) => (
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
          {results.length === 0 && <p className="muted">No servers match “{query}”.</p>}
        </div>
      </Container>

      <FaqSection path="/directory" />
    </>
  );
}
