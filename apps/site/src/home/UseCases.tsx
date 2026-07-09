import { Container } from '../design/components';
import { PERSONAS } from './personas';

/**
 * Use-cases teaser (S13.8): three persona cards that link out to the relevant surface today, and
 * become dedicated persona pages in S13.11.
 */
export function UseCases() {
  return (
    <Container style={{ paddingBottom: 'var(--space-16)' }}>
      <section data-testid="use-cases" aria-labelledby="usecases-heading">
        <h2 id="usecases-heading">Who mcpfold is for</h2>
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            marginTop: 'var(--space-6)',
          }}
        >
          {PERSONAS.map((p) => (
            <div
              key={p.id}
              data-testid={`persona-${p.id}`}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-elevated)',
                padding: 'var(--space-5)',
                display: 'flex',
                flexDirection: 'column',
              }}
            >
              <h3 style={{ margin: '0 0 var(--space-2)' }}>{p.title}</h3>
              <p style={{ color: 'var(--fg-muted)', margin: '0 0 var(--space-4)', flex: 1 }}>
                {p.blurb}
              </p>
              <a href={p.href}>{p.cta} →</a>
            </div>
          ))}
        </div>
      </section>
    </Container>
  );
}
