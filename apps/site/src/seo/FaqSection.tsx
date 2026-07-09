import { Container } from '../design/components';
import { faqsForPath } from './faq';

/**
 * A visible, extraction-friendly FAQ section (S15.2). Renders the same Q&A units that back the
 * FAQPage JSON-LD, so the answers exist in the real HTML for answer engines to lift and cite.
 * Uses semantic <dl>/<dt>/<dd> so the question→answer relationship is machine-legible.
 */
export function FaqSection({ path }: { path: string }) {
  const faqs = faqsForPath(path);
  if (faqs.length === 0) return null;
  return (
    <Container style={{ paddingBottom: 'var(--space-16)' }}>
      <section aria-labelledby="faq-heading" data-testid="faq-section">
        <h2 id="faq-heading">Frequently asked questions</h2>
        <dl>
          {faqs.map((f) => (
            <div
              key={f.question}
              style={{
                borderTop: '1px solid var(--border)',
                padding: 'var(--space-5) 0',
              }}
            >
              <dt style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>{f.question}</dt>
              <dd style={{ margin: 0, color: 'var(--fg-muted)' }}>{f.answer}</dd>
            </div>
          ))}
        </dl>
      </section>
    </Container>
  );
}
