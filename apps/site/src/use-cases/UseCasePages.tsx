import { Link, useParams } from 'react-router-dom';
import { Button, Container } from '../design/components';
import { USE_CASES, useCaseById } from './use-cases';

/**
 * Use-case / persona pages (S13.11): /use-cases (index) and /use-cases/<persona>. The same product,
 * reframed around a visitor's situation, routing to the right CTA (solo → install, teams → pricing,
 * power users → directory). Structured data (BreadcrumbList + a hub ItemList) is injected centrally
 * via seo/jsonld.ts. Copy stays within the PRD non-goals — mcpfold is local-first, not a gateway.
 */

/** The /use-cases index. */
export function UseCasesIndex() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>Who mcpfold is for</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        The same product, framed around your situation — whether you’re wrangling MCP config across
        your own clients, standardizing a team’s setup from a repo, or curating tools to cut the
        context-window tax.
      </p>

      <div
        data-testid="use-cases-index"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          margin: 'var(--space-8) 0 var(--space-10)',
        }}
      >
        {USE_CASES.map((u) => (
          <Link
            key={u.id}
            to={`/use-cases/${u.id}`}
            data-testid={`use-case-${u.id}`}
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
            <strong>{u.h1}</strong>
            <p
              style={{ color: 'var(--fg-muted)', margin: 'var(--space-2) 0 0', fontSize: '0.9rem' }}
            >
              {u.tagline}
            </p>
          </Link>
        ))}
      </div>
    </Container>
  );
}

/** A single persona page. */
export function UseCasePage() {
  const { id } = useParams<{ id: string }>();
  const uc = id ? useCaseById(id) : undefined;

  if (!uc) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Use case not found</h1>
        <p>
          No such use case. <Link to="/use-cases">See who mcpfold is for</Link>.
        </p>
      </Container>
    );
  }

  const related = uc.related.map(useCaseById).filter((u): u is NonNullable<typeof u> => !!u);

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/use-cases">← Who mcpfold is for</Link>
      </p>
      <h1>{uc.h1}</h1>
      <p
        data-testid="use-case-tagline"
        style={{ fontSize: '1.15rem', lineHeight: 1.5, maxWidth: 720, color: 'var(--fg)' }}
      >
        {uc.tagline}
      </p>

      <div style={{ maxWidth: 720, lineHeight: 1.7, margin: 'var(--space-6) 0' }}>
        {uc.body.map((para, i) => (
          <p key={i} style={{ marginBottom: 'var(--space-4)' }}>
            {para}
          </p>
        ))}
      </div>

      <ul
        data-testid="use-case-highlights"
        style={{ maxWidth: 720, listStyle: 'none', padding: 0, margin: '0 0 var(--space-8)' }}
      >
        {uc.highlights.map((h) => (
          <li key={h.title} style={{ marginBottom: 'var(--space-3)' }}>
            <strong>{h.title}.</strong> <span style={{ color: 'var(--fg-muted)' }}>{h.text}</span>
          </li>
        ))}
      </ul>

      <div
        data-testid="use-case-cta"
        style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}
      >
        <Button href={uc.primaryCta.href}>{uc.primaryCta.text}</Button>
        {uc.secondaryCta && (
          <Button href={uc.secondaryCta.href} variant="ghost">
            {uc.secondaryCta.text}
          </Button>
        )}
      </div>

      {related.length > 0 && (
        <>
          <h2 style={{ marginTop: 'var(--space-10)' }}>Other use cases</h2>
          <ul data-testid="use-case-related">
            {related.map((u) => (
              <li key={u.id} style={{ marginBottom: 'var(--space-2)' }}>
                <Link to={`/use-cases/${u.id}`}>{u.h1}</Link>
              </li>
            ))}
          </ul>
        </>
      )}
    </Container>
  );
}
