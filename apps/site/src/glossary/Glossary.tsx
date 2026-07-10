import { Link, useParams } from 'react-router-dom';
import { Container } from '../design/components';
import { GLOSSARY, termById } from './terms';

/**
 * Glossary / concept hub (S15.6): /glossary and /glossary/<term>. Concise, authoritative definitional
 * pages for the informational head terms (MCP server, Model Context Protocol, MCP client, …) that
 * assistants answer from. Each term page leads with an extractable one-liner, expands, and links down
 * into the product/directory/docs. Structured data (DefinedTerm/Article) is injected centrally via
 * seo/jsonld.ts. Copy is neutral: mcpfold is independent and describes the protocol factually.
 */

/** The /glossary hub: an indexable index of every concept page. */
export function GlossaryIndex() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>MCP glossary</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        Plain, accurate definitions of the core Model Context Protocol concepts — what an MCP server
        is, what a client is, how tools and the context window relate, and how mcpfold fits in. Each
        page links down to the product, the directory, and the docs.
      </p>

      <dl
        data-testid="glossary-index"
        style={{ maxWidth: 760, margin: 'var(--space-8) 0 var(--space-10)' }}
      >
        {GLOSSARY.map((t) => (
          <div key={t.id} style={{ marginBottom: 'var(--space-6)' }}>
            <dt style={{ fontWeight: 700, fontSize: '1.05rem' }}>
              <Link to={`/glossary/${t.id}`} data-testid={`term-${t.id}`}>
                {t.term}
              </Link>
            </dt>
            <dd style={{ margin: 'var(--space-1) 0 0', color: 'var(--fg-muted)' }}>{t.short}</dd>
          </div>
        ))}
      </dl>

      <p>
        Ready to use it? <Link to="/install">Install mcpfold</Link> or browse the{' '}
        <Link to="/directory">MCP server directory</Link>.
      </p>
    </Container>
  );
}

/** A single concept page. */
export function TermPage() {
  const { term } = useParams<{ term: string }>();
  const entry = term ? termById(term) : undefined;

  if (!entry) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Term not found</h1>
        <p>
          No such glossary entry. <Link to="/glossary">Back to the glossary</Link>.
        </p>
      </Container>
    );
  }

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/glossary">← MCP glossary</Link>
      </p>
      <h1>{entry.heading}</h1>
      {entry.aka && entry.aka.length > 0 && (
        <p style={{ color: 'var(--fg-muted)', fontSize: '0.9rem', marginTop: 0 }}>
          Also: {entry.aka.join(', ')}
        </p>
      )}

      {/* The extractable definition, visually lifted so both readers and crawlers find it first. */}
      <p
        data-testid="definition"
        style={{
          fontSize: '1.15rem',
          lineHeight: 1.5,
          maxWidth: 720,
          borderLeft: '3px solid var(--accent)',
          paddingLeft: 'var(--space-4)',
          margin: 'var(--space-4) 0 var(--space-8)',
        }}
      >
        {entry.short}
      </p>

      <div style={{ maxWidth: 720, lineHeight: 1.7 }}>
        {entry.body.map((para, i) => (
          <p key={i} style={{ marginBottom: 'var(--space-4)' }}>
            {para}
          </p>
        ))}
      </div>

      <h2 style={{ marginTop: 'var(--space-8)' }}>Related</h2>
      <ul data-testid="term-related">
        {entry.related.map((l) => (
          <li key={l.href} style={{ marginBottom: 'var(--space-2)' }}>
            {l.href.startsWith('/docs/') || l.href.startsWith('http') ? (
              <a href={l.href}>{l.text}</a>
            ) : (
              <Link to={l.href}>{l.text}</Link>
            )}
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project. The Model Context Protocol is an open
        standard; mcpfold is not affiliated with or endorsed by the MCP project.
      </p>
    </Container>
  );
}
