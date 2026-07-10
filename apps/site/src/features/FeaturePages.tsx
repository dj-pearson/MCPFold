import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container } from '../design/components';
import { FEATURES, featureById } from './features';

/**
 * Feature deep-dive pages (S13.10): /features (index) and /features/<pillar>. One page per pillar with
 * benefit-led copy, a concrete config/CLI example, and links to the deep docs. All numbers come from
 * committed sources (see features.ts) so nothing can drift. Structured data (TechArticle) is injected
 * centrally via seo/jsonld.ts. Copy is neutral: mcpfold is an independent, open-source project.
 */

const codeBlock: CSSProperties = {
  display: 'block',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-4)',
  margin: 'var(--space-2) 0 0',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.86rem',
  lineHeight: 1.55,
  overflowX: 'auto',
  whiteSpace: 'pre',
};

/** The /features index: the four pillars. */
export function FeaturesIndex() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>What mcpfold does</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        Four capabilities, one CLI: keep one config for every client, curate tools to cut the
        context-window tax, keep secrets as references, and preview and guard every change. Go deep
        on the one that matters to you.
      </p>

      <div
        data-testid="features-index"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          margin: 'var(--space-8) 0 var(--space-10)',
        }}
      >
        {FEATURES.map((f) => (
          <Link
            key={f.id}
            to={`/features/${f.id}`}
            data-testid={`feature-${f.id}`}
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
            <strong>{f.h1}</strong>
            <p
              style={{ color: 'var(--fg-muted)', margin: 'var(--space-2) 0 0', fontSize: '0.9rem' }}
            >
              {f.tagline}
            </p>
          </Link>
        ))}
      </div>

      <p>
        New here? <Link to="/install">Install mcpfold</Link> or browse the{' '}
        <Link to="/directory">MCP server directory</Link>.
      </p>
    </Container>
  );
}

/** A single feature deep-dive. */
export function FeaturePage() {
  const { id } = useParams<{ id: string }>();
  const feature = id ? featureById(id) : undefined;

  if (!feature) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Feature not found</h1>
        <p>
          No such feature. <Link to="/features">See all features</Link>.
        </p>
      </Container>
    );
  }

  const related = feature.related.map(featureById).filter((f): f is NonNullable<typeof f> => !!f);

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/features">← All features</Link>
      </p>
      <h1>{feature.h1}</h1>
      <p
        data-testid="feature-tagline"
        style={{ fontSize: '1.15rem', lineHeight: 1.5, maxWidth: 720, color: 'var(--fg)' }}
      >
        {feature.tagline}
      </p>

      <div style={{ maxWidth: 720, lineHeight: 1.7, margin: 'var(--space-6) 0' }}>
        {feature.body.map((para, i) => (
          <p key={i} style={{ marginBottom: 'var(--space-4)' }}>
            {para}
          </p>
        ))}
      </div>

      <h2>{feature.example.label}</h2>
      <code data-testid="feature-example" style={codeBlock}>
        {feature.example.code}
      </code>

      <h2 style={{ marginTop: 'var(--space-8)' }}>Go deeper</h2>
      <ul data-testid="feature-docs">
        {feature.docs.map((d) => (
          <li key={d.href} style={{ marginBottom: 'var(--space-2)' }}>
            {d.href.startsWith('/docs/') || d.href.startsWith('http') ? (
              <a href={d.href}>{d.text}</a>
            ) : (
              <Link to={d.href}>{d.text}</Link>
            )}
          </li>
        ))}
      </ul>

      {related.length > 0 && (
        <>
          <h2 style={{ marginTop: 'var(--space-8)' }}>Related features</h2>
          <ul data-testid="feature-related">
            {related.map((f) => (
              <li key={f.id} style={{ marginBottom: 'var(--space-2)' }}>
                <Link to={`/features/${f.id}`}>{f.h1}</Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <p style={{ marginTop: 'var(--space-8)' }}>
        Ready to try it? <Link to="/install">Install mcpfold</Link> — the CLI is free and
        MIT-licensed. Or head <Link to="/">back to the overview</Link>.
      </p>
    </Container>
  );
}
