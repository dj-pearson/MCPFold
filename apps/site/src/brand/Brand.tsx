import { Container } from '../design/components';

/**
 * Brand / press kit (S13.17). Downloadable logo + wordmark assets, the color tokens, the product
 * one-liner, and clear usage + no-endorsement notes so people can represent mcpfold correctly.
 * Indexable and prerendered.
 */
const ONE_LINER =
  'One source of truth for your MCP servers — write it once, fold it out to every client.';

const COLORS: Array<{ name: string; hex: string; note: string }> = [
  { name: 'Accent', hex: '#4c6ef5', note: 'Primary brand blue (light theme)' },
  { name: 'Accent (dark)', hex: '#748ffc', note: 'Brand blue on dark backgrounds' },
  { name: 'Foreground', hex: '#14161a', note: 'Near-black text' },
  { name: 'Background', hex: '#ffffff', note: 'Light surface' },
  { name: 'Background (dark)', hex: '#0b0d12', note: 'Dark surface' },
];

const ASSETS: Array<{ href: string; label: string; note: string }> = [
  { href: '/brand/mcpfold-logomark.svg', label: 'Logomark (SVG)', note: 'The folded-sheet mark' },
  { href: '/brand/mcpfold-wordmark.svg', label: 'Wordmark (SVG)', note: 'Mark + “mcpfold” lockup' },
  { href: '/logo-mark.png', label: 'Logomark (PNG)', note: 'Raster fallback' },
  { href: '/og.svg', label: 'Social card (SVG)', note: 'Open Graph / share image' },
];

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  padding: 'var(--space-4)',
};

export function Brand() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 820 }}>
      <h1>Brand &amp; press kit</h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.55 }}>
        Assets and guidelines for writing about or linking to mcpfold. Everything here is free to
        use within the notes below.
      </p>

      <h2>The one-liner</h2>
      <blockquote
        data-testid="brand-oneliner"
        style={{
          borderLeft: '3px solid var(--accent)',
          paddingLeft: 'var(--space-4)',
          margin: 'var(--space-4) 0',
          fontSize: '1.15rem',
        }}
      >
        {ONE_LINER}
      </blockquote>

      <h2>Logo &amp; wordmark</h2>
      <div
        data-testid="brand-assets"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          margin: 'var(--space-4) 0',
        }}
      >
        {ASSETS.map((a) => (
          <div key={a.href} style={card}>
            <img
              src={a.href}
              alt={a.label}
              style={{ maxWidth: '100%', height: 64, objectFit: 'contain' }}
            />
            <p style={{ margin: 'var(--space-2) 0 0', fontWeight: 600 }}>{a.label}</p>
            <p
              style={{
                margin: '2px 0 var(--space-2)',
                color: 'var(--fg-muted)',
                fontSize: '0.85rem',
              }}
            >
              {a.note}
            </p>
            <a href={a.href} download data-testid="brand-download">
              Download
            </a>
          </div>
        ))}
      </div>

      <h2>Colors</h2>
      <div
        data-testid="brand-colors"
        style={{
          display: 'grid',
          gap: 'var(--space-3)',
          gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
          margin: 'var(--space-4) 0',
        }}
      >
        {COLORS.map((c) => (
          <div
            key={c.name}
            style={{ ...card, display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}
          >
            <span
              aria-hidden="true"
              style={{
                width: 36,
                height: 36,
                borderRadius: 8,
                background: c.hex,
                border: '1px solid var(--border)',
                flex: '0 0 auto',
              }}
            />
            <div>
              <strong>{c.name}</strong>
              <div style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: '0.85rem' }}>
                {c.hex}
              </div>
              <div style={{ color: 'var(--fg-muted)', fontSize: '0.8rem' }}>{c.note}</div>
            </div>
          </div>
        ))}
      </div>

      <h2>Usage</h2>
      <ul style={{ lineHeight: 1.7 }}>
        <li>Use the wordmark or logomark as provided; don’t stretch, recolor, or add effects.</li>
        <li>Keep clear space around the mark and don’t place it on low-contrast backgrounds.</li>
        <li>Write the name as “mcpfold” (all lowercase).</li>
        <li>
          Link to <a href="https://mcpfold.com">mcpfold.com</a> where practical.
        </li>
      </ul>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project. The Model Context Protocol is an open
        standard; mcpfold is not affiliated with or endorsed by the MCP project. Don’t use these
        assets in a way that implies such an affiliation, or to endorse another product.
      </p>
    </Container>
  );
}
