import { Container } from '../design/components';
import { TIERS } from './tiers';
import { FaqSection } from '../seo/FaqSection';

/**
 * Pricing page (S13.6) — contrasts the free OSS/local CLI with the paid team cloud, renders the
 * tiers from the S14.3 single source (tiers.ts, never ad-hoc copy), and funnels signups into the
 * app. Pure marketing — no secret handling.
 */
export function PricingPage() {
  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1 style={{ textAlign: 'center' }}>Pricing</h1>
        <p
          style={{
            textAlign: 'center',
            color: 'var(--fg-muted)',
            maxWidth: 620,
            margin: '0 auto var(--space-8)',
          }}
        >
          The CLI and everything local are <strong>free forever</strong> and MIT-licensed. The
          hosted cloud is the paid surface — or self-host the whole thing yourself for free.
        </p>

        <div
          style={{
            display: 'grid',
            gap: 'var(--space-6)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            alignItems: 'start',
          }}
        >
          {TIERS.map((tier) => (
            <section
              key={tier.id}
              data-testid={`tier-${tier.id}`}
              aria-labelledby={`tier-${tier.id}-name`}
              style={{
                border: `1px solid ${tier.featured ? 'var(--accent)' : 'var(--border)'}`,
                borderRadius: 'var(--radius)',
                background: 'var(--bg-elevated)',
                padding: 'var(--space-6)',
                display: 'flex',
                flexDirection: 'column',
                gap: 'var(--space-3)',
                boxShadow: tier.featured
                  ? '0 8px 30px color-mix(in srgb, var(--accent) 20%, transparent)'
                  : 'none',
              }}
            >
              <h2 id={`tier-${tier.id}-name`} style={{ margin: 0, fontSize: '1.2rem' }}>
                {tier.name}
                {tier.featured && (
                  <span
                    style={{
                      marginLeft: 'var(--space-2)',
                      fontSize: '0.7rem',
                      color: 'var(--accent)',
                    }}
                  >
                    POPULAR
                  </span>
                )}
              </h2>
              <div style={{ fontSize: '1.5rem', fontWeight: 800 }} data-testid={`price-${tier.id}`}>
                {tier.price}
              </div>
              <p style={{ color: 'var(--fg-muted)', margin: 0, minHeight: '3em' }}>
                {tier.tagline}
              </p>
              <ul style={{ paddingLeft: '1.1rem', margin: 0, color: 'var(--fg-muted)', flex: 1 }}>
                {tier.features.map((f) => (
                  <li key={f} style={{ marginBottom: 'var(--space-2)' }}>
                    {f}
                  </li>
                ))}
              </ul>
              <a
                href={tier.cta.href}
                data-testid={`cta-${tier.id}`}
                style={{
                  display: 'block',
                  textAlign: 'center',
                  padding: 'var(--space-3)',
                  borderRadius: 'var(--radius)',
                  fontWeight: 600,
                  textDecoration: 'none',
                  background: tier.featured ? 'var(--accent)' : 'transparent',
                  color: tier.featured ? 'var(--accent-fg)' : 'var(--fg)',
                  border: tier.featured ? 'none' : '1px solid var(--border)',
                }}
              >
                {tier.cta.label}
              </a>
            </section>
          ))}
        </div>
      </Container>

      <FaqSection
        path="/pricing"
        moreLink={{ href: '/security', text: 'How we handle secrets — Security & trust' }}
      />
    </>
  );
}
