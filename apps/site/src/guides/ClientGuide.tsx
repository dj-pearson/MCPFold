import type { CSSProperties, ReactNode } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container } from '../design/components';
import { GUIDE_CLIENTS, guideById } from './guides.data';
import { exampleConfigPath, guideSteps, remoteNote, secretStrategyNote } from './steps';

/**
 * Per-client setup guides (S15.5): /guides (hub) and /guides/<client>. Each page answers the
 * high-intent query "add MCP servers to <client>" with a copy-paste walkthrough whose config truth
 * (path per OS, secret handling, restart, remote) is derived from the real adapter — never
 * hand-duplicated — plus HowTo structured data (injected centrally via seo/jsonld.ts). The copy is
 * deliberately neutral: mcpfold is an independent project and names each client factually.
 */

const codeBlock: CSSProperties = {
  display: 'block',
  background: 'var(--bg-elevated)',
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  padding: 'var(--space-3) var(--space-4)',
  margin: 'var(--space-2) 0 0',
  fontFamily: 'var(--font-mono, monospace)',
  fontSize: '0.9rem',
  overflowX: 'auto',
  whiteSpace: 'pre',
};

/** The /guides hub: an indexable index of every client mcpfold folds config out to. */
export function GuidesIndex() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>Add MCP servers to any client</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        Pick your client for a copy-paste guide to adding MCP servers with mcpfold — one canonical
        config, folded out to the client&rsquo;s own native format. Each guide&rsquo;s config paths
        and secret handling come straight from mcpfold&rsquo;s adapter for that client, so they
        match exactly what <code>mcpfold sync</code> writes.
      </p>

      <div
        data-testid="guides-index"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
          margin: 'var(--space-8) 0 var(--space-10)',
        }}
      >
        {GUIDE_CLIENTS.map((c) => (
          <Link
            key={c.id}
            to={`/guides/${c.id}`}
            data-testid={`guide-${c.id}`}
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
            <strong>{c.label}</strong>
            <p
              style={{ color: 'var(--fg-muted)', margin: 'var(--space-2) 0 0', fontSize: '0.9rem' }}
            >
              Add MCP servers to {c.label}
            </p>
          </Link>
        ))}
      </div>

      <p>
        New to mcpfold? <Link to="/install">Install it</Link>, then browse the{' '}
        <Link to="/directory">MCP server directory</Link> for servers to add.
      </p>
    </Container>
  );
}

/** Fact row in the "what mcpfold writes" panel. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: 'flex', gap: 'var(--space-3)', padding: 'var(--space-2) 0' }}>
      <div style={{ minWidth: 140, color: 'var(--fg-muted)', fontWeight: 600 }}>{label}</div>
      <div style={{ minWidth: 0 }}>{children}</div>
    </div>
  );
}

/** A single client's setup guide. */
export function GuidePage() {
  const { client } = useParams<{ client: string }>();
  const guide = client ? guideById(client) : undefined;

  if (!guide) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Guide not found</h1>
        <p>
          No setup guide for that client. <Link to="/guides">Browse all client guides</Link>.
        </p>
      </Container>
    );
  }

  const steps = guideSteps(guide);
  const path = exampleConfigPath(guide);

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/guides">← All client guides</Link>
      </p>
      <h1>Add MCP servers to {guide.label}</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        Manage {guide.label}&rsquo;s MCP servers from one canonical config with mcpfold — the free,
        open-source CLI. Write your servers once and fold them out to {guide.label}&rsquo;s own{' '}
        <code>{guide.configRoot}</code> config, with secrets kept as references, not hardcoded
        values.
      </p>

      <h2 style={{ marginTop: 'var(--space-10)' }}>
        Set up {guide.label} in {steps.length} steps
      </h2>
      <ol data-testid="guide-steps" style={{ maxWidth: 720, lineHeight: 1.6 }}>
        {steps.map((step) => (
          <li key={step.name} style={{ marginBottom: 'var(--space-5)' }}>
            <strong>{step.name}.</strong> {step.text}
            {step.command && (
              <code data-testid="guide-command" style={codeBlock}>
                {step.command}
              </code>
            )}
          </li>
        ))}
      </ol>

      <h2 style={{ marginTop: 'var(--space-10)' }}>What mcpfold writes for {guide.label}</h2>
      <div
        data-testid="guide-facts"
        style={{
          maxWidth: 720,
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          padding: 'var(--space-4) var(--space-5)',
          margin: 'var(--space-4) 0',
        }}
      >
        <Fact label="Config file">
          {path ? <code>{path}</code> : <span>Managed in {guide.label}&rsquo;s own settings.</span>}
          <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 4 }}>
            Windows: <code>{guide.paths.windows ?? '—'}</code>
          </div>
        </Fact>
        <Fact label="Config key">
          <code>{guide.configRoot}</code>
        </Fact>
        <Fact label="Secrets">{secretStrategyNote(guide)}</Fact>
        <Fact label="Remote servers">{remoteNote(guide)}</Fact>
        <Fact label="After sync">
          {guide.needsRestart
            ? `Restart ${guide.label} to load new or changed servers.`
            : `Changes are picked up without restarting ${guide.label}.`}
        </Fact>
      </div>

      <p>
        Looking for servers to add? Browse the <Link to="/directory">MCP server directory</Link> —
        every entry adds in one <code>mcpfold add</code>. Or see the{' '}
        <Link to="/install">install options</Link>.
      </p>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project and is not affiliated with or endorsed by{' '}
        {guide.label}. Names are used only to describe compatibility.
      </p>
    </Container>
  );
}
