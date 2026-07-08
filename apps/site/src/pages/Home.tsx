import { Container } from '../design/components';
import { Seo } from '../seo/Seo';
import { Hero } from '../home/Hero';
import { Calculator } from '../benchmark/Calculator';

/** Homepage (S13.2): hero + recorded demo, an interactive benchmark calculator, and the feature
 * grid. Numbers come from the committed benchmark so the site and docs never disagree. */
export function Home() {
  return (
    <>
      <Seo
        title="mcpfold — one config for every MCP client"
        description="Connect every MCP server without paying the context-window tax. One canonical config, folded out to every client, with secret references instead of hardcoded values."
        path="/"
      />

      <Hero />

      <Container style={{ padding: 'var(--space-8) var(--space-6)' }}>
        <Calculator />
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
