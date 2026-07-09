import { Container } from '../design/components';
import { liveFooterGroups } from '../site-structure';

/** Site footer (S13.9): the complete link map grouped by area, plus the license + no-endorsement
 * note. Driven by the same site-structure source as the header. */
export function Footer() {
  const groups = liveFooterGroups();
  return (
    <footer style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--space-16)' }}>
      <Container style={{ padding: 'var(--space-12) var(--space-6) var(--space-8)' }}>
        <div
          style={{
            display: 'grid',
            gap: 'var(--space-8)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          }}
        >
          <div>
            <a
              href="/"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                fontWeight: 800,
                color: 'var(--fg)',
              }}
            >
              <img
                src="/logo-mark.png"
                alt="mcpfold logo"
                width={24}
                height={24}
                style={{ borderRadius: 6 }}
              />
              mcpfold
            </a>
            <p
              style={{ color: 'var(--fg-muted)', fontSize: '0.9rem', marginTop: 'var(--space-3)' }}
            >
              One config for every MCP client.
            </p>
          </div>

          {groups.map((g) => (
            <nav key={g.title} aria-label={g.title}>
              <h2
                style={{
                  fontSize: '0.8rem',
                  textTransform: 'uppercase',
                  letterSpacing: '0.05em',
                  color: 'var(--fg-muted)',
                  margin: '0 0 var(--space-3)',
                }}
              >
                {g.title}
              </h2>
              <ul
                style={{
                  listStyle: 'none',
                  padding: 0,
                  margin: 0,
                  display: 'grid',
                  gap: 'var(--space-2)',
                }}
              >
                {g.links.map((l) => (
                  <li key={l.href}>
                    <a
                      href={l.href}
                      data-testid={`footer-link-${l.href}`}
                      rel={l.external ? 'noreferrer' : undefined}
                      style={{ color: 'var(--fg-muted)', fontSize: '0.92rem' }}
                    >
                      {l.label}
                    </a>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
        </div>

        <p
          style={{
            borderTop: '1px solid var(--border)',
            marginTop: 'var(--space-8)',
            paddingTop: 'var(--space-6)',
            color: 'var(--fg-muted)',
            fontSize: '0.85rem',
          }}
        >
          © mcpfold — free and open source under the MIT license. A neutral project: mcpfold is not
          affiliated with or endorsed by the MCP project or the clients and servers it supports.
        </p>
      </Container>
    </footer>
  );
}
