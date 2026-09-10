import { Link, useLocation } from 'react-router-dom';
import { Container } from '../design/components';
import { relatedFor } from './related';

/**
 * The cross-silo "Related" block (SEO-7), mounted once in Layout above the footer.
 *
 * Mounting it in the shell rather than in each page component means every current and future page
 * type gets its internal links from one place — the same single-choke-point rule the meta and
 * JSON-LD pipelines follow. relatedFor() returns [] for hubs and transactional pages, so those
 * render nothing at all.
 *
 * It is a <nav> with its own accessible name so screen-reader users can skip it, and it sits inside
 * the prerendered HTML (not behind an effect) so crawlers see the links without running JS.
 */
export function RelatedLinks() {
  const { pathname } = useLocation();
  const links = relatedFor(pathname);
  if (links.length === 0) return null;

  return (
    <nav aria-labelledby="related-heading" data-testid="related-links">
      <Container style={{ padding: 'var(--space-12) var(--space-6)' }}>
        <h2
          id="related-heading"
          style={{ fontSize: '1rem', color: 'var(--fg-muted)', margin: '0 0 var(--space-6)' }}
        >
          Related
        </h2>
        <ul
          style={{
            display: 'grid',
            gap: 'var(--space-4)',
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
            listStyle: 'none',
            margin: 0,
            padding: 0,
          }}
        >
          {links.map((link) => (
            <li key={link.href}>
              <Link
                to={link.href}
                style={{
                  display: 'block',
                  padding: 'var(--space-4)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)',
                  color: 'inherit',
                  textDecoration: 'none',
                  height: '100%',
                }}
              >
                <span style={{ display: 'block', fontWeight: 600 }}>{link.label}</span>
                <span
                  style={{
                    display: 'block',
                    marginTop: 'var(--space-1)',
                    fontSize: '0.875rem',
                    color: 'var(--fg-muted)',
                  }}
                >
                  {link.blurb}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Container>
    </nav>
  );
}
