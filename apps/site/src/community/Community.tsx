import { Link } from 'react-router-dom';
import { Container } from '../design/components';

/**
 * Community & support page (S13.15). One hub that routes every kind of engagement to the right
 * channel — get help (GitHub Discussions), report a bug (the redaction-safe `mcpfold diagnose`
 * bundle + the bug-report template), request or contribute a client adapter, and stay in the loop.
 * Reduces support friction and channels contributions. Neutral: mcpfold is independent, not endorsed
 * by the MCP project.
 */
const GITHUB = 'https://github.com/dj-pearson/MCPFold';

const cardStyle: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  padding: 'var(--space-5)',
};

function Ext({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} rel="noreferrer" target="_blank">
      {children}
    </a>
  );
}

export function Community() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 820 }}>
      <h1>Community &amp; support</h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.55, color: 'var(--fg)' }}>
        mcpfold is built in the open. Whether you’re stuck, found a bug, or want to add support for
        a client you use, here’s the fastest way to the right place.
      </p>

      <div
        data-testid="community-channels"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          margin: 'var(--space-8) 0',
        }}
      >
        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Get help</h2>
          <p style={{ color: 'var(--fg-muted)' }}>
            Questions and how-tos are best in{' '}
            <Ext href={`${GITHUB}/discussions`}>GitHub Discussions</Ext> — the project’s community
            forum. Search <Ext href={`${GITHUB}/issues`}>existing issues</Ext> first in case it’s
            already known.
          </p>
        </section>

        <section style={cardStyle}>
          <h2 style={{ marginTop: 0 }}>Request or add a client</h2>
          <p style={{ color: 'var(--fg-muted)' }}>
            Want a client mcpfold doesn’t support yet? Open an{' '}
            <Ext href={`${GITHUB}/issues/new?template=adapter_request.yml`}>adapter request</Ext>.
            Adding one is a one-PR job — see the <a href="/docs/adapters.html">adapter guide</a> and{' '}
            <Ext href={`${GITHUB}/blob/main/CONTRIBUTING.md`}>CONTRIBUTING</Ext>.
          </p>
        </section>
      </div>

      <section data-testid="bug-guidance" style={{ ...cardStyle, margin: 'var(--space-4) 0' }}>
        <h2 style={{ marginTop: 0 }}>Report a bug</h2>
        <p style={{ color: 'var(--fg-muted)' }}>
          The best bug reports come with a diagnostics bundle. Run <code>mcpfold diagnose</code> —
          it collects your environment and the shape of your config with{' '}
          <strong>secrets and personal paths redacted</strong>, so it’s safe to attach. Then open a{' '}
          <Ext href={`${GITHUB}/issues/new?template=bug_report.yml`}>bug report</Ext> and include
          it, plus what you expected versus what happened.
        </p>
        <p style={{ color: 'var(--fg-muted)', margin: 0 }}>
          The bundle never contains secret values — see how redaction works on the{' '}
          <Link to="/security">security page</Link>, and the full command contract in the{' '}
          <a href="/docs/cli-contract.html">CLI docs</a>.
        </p>
      </section>

      <h2>Stay in the loop &amp; support the project</h2>
      <ul data-testid="community-links">
        <li>
          <Link to="/blog">Blog</Link> — launches and deep-dives.
        </li>
        <li>
          <Link to="/changelog">Changelog</Link> — what shipped.
        </li>
        <li>
          <a href="/docs/governance.html">Project governance</a> — how decisions get made.
        </li>
        <li>
          <Ext href="https://github.com/sponsors/dj-pearson">Sponsor</Ext> — support the work.
        </li>
      </ul>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project and is not affiliated with or endorsed by the
        MCP project. To report a security vulnerability privately, see the{' '}
        <Link to="/security">security page</Link>.
      </p>
    </Container>
  );
}
