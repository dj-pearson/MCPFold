import { Button, Container } from '../design/components';

/**
 * Closing CTA (S13.8): repeats the primary install action and the secondary cloud action so a
 * visitor who read the whole page converts without scrolling back up.
 */
export function FinalCta() {
  return (
    <Container style={{ paddingBottom: 'var(--space-16)' }}>
      <section
        data-testid="final-cta"
        aria-labelledby="cta-heading"
        style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto' }}
      >
        <h2 id="cta-heading">One config for every MCP client</h2>
        <p style={{ color: 'var(--fg-muted)' }}>
          Install the free, MIT-licensed CLI and fold your MCP servers out to every client — or add
          the hosted cloud when your team needs shared configs and an audit trail.
        </p>
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            justifyContent: 'center',
            flexWrap: 'wrap',
            marginTop: 'var(--space-6)',
          }}
        >
          <Button href="/install" data-testid="cta-install">
            Install mcpfold
          </Button>
          <Button href="/pricing" variant="ghost" data-testid="cta-cloud">
            Explore team cloud
          </Button>
        </div>
      </section>
    </Container>
  );
}
