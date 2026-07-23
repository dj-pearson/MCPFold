import { Link } from 'react-router-dom';
import { Container } from '../design/components';
import { legalDocById } from './legal-content';

/**
 * Legal & policy pages (S13.14): /privacy, /terms, /analytics, /accessibility. Each renders one doc from the single
 * typed content source (legal-content.ts), dated and versioned, so the pages stay consistent with the
 * real data practices and are easy to update together. Prerendered and left indexable (documented
 * choice — see legal-content.ts). Cross-linked to each other in the footer.
 */
export function LegalPage({ id }: { id: string }) {
  const doc = legalDocById(id);

  if (!doc) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Page not found</h1>
        <p>
          No such policy. <Link to="/">Back home</Link>.
        </p>
      </Container>
    );
  }

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 760 }}>
      <h1>{doc.title}</h1>
      <p data-testid="legal-effective" style={{ color: 'var(--fg-muted)', fontSize: '0.9rem' }}>
        Version {doc.version} · Effective {doc.effectiveDate}
      </p>

      <p style={{ fontSize: '1.05rem', lineHeight: 1.6 }}>{doc.intro}</p>

      {doc.sections.map((section) => (
        <section key={section.heading} style={{ marginTop: 'var(--space-6)' }}>
          <h2>{section.heading}</h2>
          {section.paragraphs.map((para, i) => (
            <p key={i} style={{ lineHeight: 1.7 }}>
              {para}
            </p>
          ))}
        </section>
      ))}

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.9rem', marginTop: 'var(--space-10)' }}>
        See also: <Link to="/privacy">Privacy</Link> · <Link to="/terms">Terms</Link> ·{' '}
        <Link to="/analytics">Analytics &amp; cookies</Link> ·{' '}
        <Link to="/accessibility">Accessibility</Link> · <Link to="/security">Security</Link>
      </p>
    </Container>
  );
}
