import { Badge, Button, Container } from '../design/components';
import { compute, FIXTURE_SERVERS } from '../benchmark/model';
import { TheFold } from './TheFold';

/** Homepage hero (S13.2, on-page SEO S15.3) — H1 leads with the focus keyword "MCP config" + the
 * brand; the first ~100 words name MCP config/servers, the supported clients, and the token savings,
 * while keeping the context-window tax brand line and the committed benchmark proof. */
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
        mcpfold — one <span style={{ color: 'var(--accent)' }}>MCP config</span> for every client
      </h1>

      <p
        data-testid="hero-intro"
        style={{ fontSize: '1.25rem', maxWidth: 720, margin: '0 auto var(--space-6)' }}
      >
        mcpfold is a free, open-source CLI that manages your MCP servers from one canonical config
        and folds it out to every MCP client — Claude Code, Claude Desktop, Cursor, VS Code,
        Windsurf, and Zed — each in its own format.
      </p>

      <p
        data-testid="benchmark-headline"
        style={{ fontSize: '1.05rem', maxWidth: 720, margin: '0 auto var(--space-8)' }}
      >
        Curate each server’s tools to skip the{' '}
        <span style={{ color: 'var(--accent)' }}>context-window tax</span> — every server dumps its
        full tool schema into context, used or not. Curating the toolset cuts tool-schema tokens by{' '}
        <strong style={{ color: 'var(--accent)' }}>~{headline.reductionPct}%</strong>{' '}
        <span style={{ color: 'var(--fg-muted)' }}>
          ({headline.tokensBefore.toLocaleString()} → {headline.tokensAfter.toLocaleString()})
        </span>
        , with secrets kept as ${'{env:…}'} references, never hardcoded values.
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

      {/* The animated hero centerpiece: one config unfolds into every client on scroll. */}
      <TheFold result={headline} />

      <div style={{ marginTop: 'var(--space-12)' }} data-reveal>
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
