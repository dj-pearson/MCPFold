import { Link } from 'react-router-dom';
import { Container } from '../design/components';

/**
 * Branded 404 page (S13.17). Rendered for any unmatched route (client-side via the catch-all route,
 * and served statically by Cloudflare Pages as dist/404.html with a real 404 status — gen-seo.mjs
 * writes that file). Recovers the visitor with the top destinations plus a jump to the two search-y
 * surfaces (the server directory and the searchable docs).
 */
const TOP_LINKS: Array<{ href: string; label: string; internal?: boolean }> = [
  { href: '/', label: 'Home', internal: true },
  { href: '/install', label: 'Install', internal: true },
  { href: '/directory', label: 'MCP server directory', internal: true },
  { href: '/docs', label: 'Documentation' },
  { href: '/pricing', label: 'Pricing', internal: true },
  { href: '/community', label: 'Community & support', internal: true },
];

export function NotFound() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 640 }}>
      <p style={{ color: 'var(--fg-muted)', fontWeight: 700, letterSpacing: '0.08em' }}>404</p>
      <h1 data-testid="notfound-heading">This page folded away</h1>
      <p style={{ color: 'var(--fg-muted)', fontSize: '1.05rem', lineHeight: 1.6 }}>
        The URL you followed doesn’t exist (or moved). Here’s the way back — or search the server
        directory and the docs for what you need.
      </p>

      <nav
        aria-label="Helpful links"
        data-testid="notfound-links"
        style={{ margin: 'var(--space-6) 0' }}
      >
        <ul style={{ display: 'grid', gap: 'var(--space-2)', listStyle: 'none', padding: 0 }}>
          {TOP_LINKS.map((l) => (
            <li key={l.href}>
              {l.internal ? <Link to={l.href}>{l.label}</Link> : <a href={l.href}>{l.label}</a>}
            </li>
          ))}
        </ul>
      </nav>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.9rem' }}>
        Looking for a specific MCP server? <Link to="/directory">Browse the directory</Link>. Need a
        setup step? The <a href="/docs">docs</a> have search built in.
      </p>
    </Container>
  );
}
