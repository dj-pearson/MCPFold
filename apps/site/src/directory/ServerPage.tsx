import { Link, useParams } from 'react-router-dom';
import { DIRECTORY, categoryHasPage, categoryMeta } from '@mcpfold/core';
import { Container } from '../design/components';
import { cliSnippet, editorUrl } from './addToConfig';

/** Per-server directory page (S13.5): its own indexable route, OG card, and an add-to-config link. */
export function ServerPage() {
  const { id } = useParams<{ id: string }>();
  const entry = DIRECTORY.find((e) => e.id === id);

  if (!entry) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Not found</h1>
        <p>
          No server “{id}”. <Link to="/directory">Back to the directory</Link>.
        </p>
      </Container>
    );
  }

  const launch =
    entry.transport === 'stdio'
      ? `${entry.command ?? ''} ${(entry.args ?? []).join(' ')}`.trim()
      : (entry.url ?? '');

  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 720 }}>
        <p style={{ marginBottom: 'var(--space-4)' }}>
          <Link to="/directory">← Directory</Link>
        </p>
        <h1 style={{ marginBottom: 'var(--space-2)' }}>{entry.name} MCP server</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: '1.1rem' }}>{entry.description}</p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            flexWrap: 'wrap',
            margin: 'var(--space-4) 0',
          }}
        >
          {entry.suggestedTags.map((t) =>
            categoryHasPage(t) ? (
              <Link
                key={t}
                to={`/directory/category/${t}`}
                data-testid={`tag-${t}`}
                style={{
                  fontSize: '0.8rem',
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  color: 'var(--fg-muted)',
                  textDecoration: 'none',
                }}
              >
                {categoryMeta(t).label}
              </Link>
            ) : (
              <span
                key={t}
                style={{
                  fontSize: '0.8rem',
                  padding: '2px 10px',
                  borderRadius: 999,
                  border: '1px solid var(--border)',
                  color: 'var(--fg-muted)',
                }}
              >
                {t}
              </span>
            ),
          )}
        </div>

        <h2>How it runs</h2>
        <p style={{ color: 'var(--fg-muted)' }}>
          {entry.name} is a <strong>{entry.transport}</strong> MCP server. mcpfold launches it with:
        </p>
        <pre
          data-testid="launch"
          style={{
            background: 'var(--code-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-4)',
            overflowX: 'auto',
          }}
        >
          <code>{launch}</code>
        </pre>

        <h2>Add to your config</h2>
        <pre
          data-testid="add-snippet"
          style={{
            background: 'var(--code-bg)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: 'var(--space-4)',
            overflowX: 'auto',
          }}
        >
          <code>{cliSnippet(entry)}</code>
        </pre>
        {entry.tokenRef && (
          <p style={{ color: 'var(--fg-muted)', fontSize: '0.9rem' }}>
            Needs a token — mcpfold stores it as a reference (<code>{entry.tokenRef}</code>), never
            a value.
          </p>
        )}
        <p>
          <a href={editorUrl(entry)} data-testid="editor-link">
            Or add it in the web editor →
          </a>
        </p>
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
          Listed for convenience; mcpfold is not affiliated with or endorsed by this project.
        </p>
      </Container>
    </>
  );
}
