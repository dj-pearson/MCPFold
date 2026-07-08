import { Badge, Button, Container } from '../design/components';
import { Seo } from '../seo/Seo';

/** Homepage (S13.1 shell). The interactive context-window benchmark and richer hero land in S13.2;
 * this establishes the above-the-fold value prop, the design language, and the CTA. */
export function Home() {
  return (
    <>
      <Seo
        title="mcpfold — one config for every MCP client"
        description="Connect every MCP server without paying the context-window tax. One canonical config, folded out to every client, with secret references instead of hardcoded values."
        path="/"
      />

      <Container style={{ padding: 'var(--space-16) var(--space-6)', textAlign: 'center' }}>
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
          style={{
            fontSize: '1.2rem',
            color: 'var(--fg-muted)',
            maxWidth: 640,
            margin: '0 auto var(--space-8)',
          }}
        >
          One canonical <code>mcp.config.jsonc</code>, folded out to every client — loading only the
          tools each agent needs and resolving secret <em>references</em> instead of hardcoded
          values.
        </p>

        <p
          data-testid="benchmark-headline"
          style={{ fontSize: '1.1rem', marginBottom: 'var(--space-8)' }}
        >
          Curating the toolset cuts tool-schema tokens by <strong>~80%</strong>{' '}
          <span style={{ color: 'var(--fg-muted)' }}>(7,476 → 1,497)</span>.
        </p>

        <div
          style={{
            display: 'flex',
            gap: 'var(--space-4)',
            justifyContent: 'center',
            flexWrap: 'wrap',
          }}
        >
          <Button href="/docs/install.html">Install</Button>
          <Button href="/docs" variant="ghost">
            Read the docs
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
      </Container>

      <Container style={{ paddingBottom: 'var(--space-16)' }}>
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-6)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {FEATURES.map((f) => (
            <div
              key={f.title}
              style={{
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                background: 'var(--bg-elevated)',
                padding: 'var(--space-6)',
              }}
            >
              <h3 style={{ marginTop: 0 }}>{f.title}</h3>
              <p style={{ color: 'var(--fg-muted)', margin: 0 }}>{f.body}</p>
            </div>
          ))}
        </div>
      </Container>
    </>
  );
}

const FEATURES = [
  {
    title: 'One source of truth',
    body: 'Write your servers once. Fold out to Claude, Cursor, VS Code, Windsurf, Zed — each in its own format.',
  },
  {
    title: 'Secrets as references',
    body: 'Configs carry ${env:…} / ${op:…} references, never values. Nothing sensitive is written to disk.',
  },
  {
    title: 'Drift-gated in CI',
    body: 'Commit the config to your repo and fail CI when a checkout drifts — standardize your team, no backend.',
  },
];
