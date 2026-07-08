import { Badge, Button, Container } from '../design/components';
import { compute, FIXTURE_SERVERS } from '../benchmark/model';

/** Homepage hero (S13.2) — leads with the context-window tax + the benchmark number, a primary
 * install CTA and a secondary cloud CTA, and the recorded demo one glance down. */
export function Hero() {
  const headline = compute(FIXTURE_SERVERS, 3); // the committed benchmark result

  return (
    <Container
      style={{ padding: 'var(--space-16) var(--space-6) var(--space-8)', textAlign: 'center' }}
    >
      <Badge>Open source · local-first</Badge>
      <h1
        style={{
          fontSize: 'clamp(2rem, 5vw, 3.4rem)',
          lineHeight: 1.1,
          margin: 'var(--space-6) 0',
        }}
      >
        Connect every MCP server without paying the
        <span style={{ color: 'var(--accent)' }}> context-window tax</span>.
      </h1>

      <p
        data-testid="benchmark-headline"
        style={{ fontSize: '1.25rem', maxWidth: 680, margin: '0 auto var(--space-8)' }}
      >
        Every server you connect dumps its full tool schema into context — used or not. Curating the
        toolset cuts tool-schema tokens by{' '}
        <strong style={{ color: 'var(--accent)' }}>~{headline.reductionPct}%</strong>{' '}
        <span style={{ color: 'var(--fg-muted)' }}>
          ({headline.tokensBefore.toLocaleString()} → {headline.tokensAfter.toLocaleString()})
        </span>
        .
      </p>

      <div
        style={{
          display: 'flex',
          gap: 'var(--space-4)',
          justifyContent: 'center',
          flexWrap: 'wrap',
        }}
      >
        <Button href="/install">Install</Button>
        <Button href="https://app.mcpfold.com" variant="ghost">
          Try the cloud
        </Button>
      </div>
      <p
        style={{
          marginTop: 'var(--space-4)',
          color: 'var(--fg-muted)',
          fontFamily: 'var(--font-mono)',
        }}
      >
        <code>npx mcpfold init</code>
      </p>

      <div style={{ marginTop: 'var(--space-12)' }}>
        <img
          src="/demo.svg"
          alt="mcpfold in the terminal: init, import, sync, and diff show one config folding out to every client"
          data-testid="demo-image"
          style={{
            width: '100%',
            maxWidth: 760,
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
          }}
        />
      </div>
    </Container>
  );
}
