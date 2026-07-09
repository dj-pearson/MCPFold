import { useEffect, useState } from 'react';
import { Container } from '../design/components';
import { CopyBlock } from './CopyBlock';
import { FaqSection } from '../seo/FaqSection';
import { detectOS, OS_LABEL, type OS } from './os';

/**
 * Install + get-started page (S13.3). Surfaces every channel from S11.1 with one-click copy,
 * auto-highlights the visitor's OS, sources the version from the CLI package (never hardcoded),
 * carries checksum guidance for the curl|sh + binary paths, and funnels into the quickstart.
 */

interface Channel {
  id: string;
  title: string;
  os: OS[] | 'all';
  command: string;
  note?: string;
  recommendedFor?: OS;
}

const CHANNELS: Channel[] = [
  {
    id: 'npx',
    title: 'npx (no install)',
    os: 'all',
    command: 'npx mcpfold init',
    recommendedFor: 'linux',
  },
  { id: 'npm', title: 'npm (global)', os: 'all', command: 'npm install -g mcpfold' },
  {
    id: 'brew',
    title: 'Homebrew',
    os: ['mac', 'linux'],
    command: 'brew install dj-pearson/tap/mcpfold',
    recommendedFor: 'mac',
  },
  {
    id: 'curl',
    title: 'curl | sh',
    os: ['mac', 'linux'],
    command: 'curl -fsSL https://mcpfold.com/install.sh | sh',
    note: 'The installer verifies a SHA-256 checksum before installing and fails closed on any mismatch. Pin a version with MCPFOLD_VERSION=x.y.z.',
  },
  {
    id: 'scoop',
    title: 'Scoop',
    os: ['windows'],
    command: 'scoop install dj-pearson/mcpfold',
    recommendedFor: 'windows',
  },
  { id: 'winget', title: 'winget', os: ['windows'], command: 'winget install mcpfold' },
  {
    id: 'binary',
    title: 'Standalone binary',
    os: 'all',
    command:
      'curl -fsSLO https://github.com/dj-pearson/MCPFold/releases/latest/download/mcpfold-macos-arm64',
    note: 'Download the binary for your platform plus its .sha256, verify it (shasum -a 256 -c), then put it on your PATH. Binaries: macOS (arm64/x64), Linux (x64/arm64), Windows (x64).',
  },
];

function forOS(c: Channel, os: OS): boolean {
  return c.os === 'all' || c.os.includes(os);
}

export function InstallPage() {
  // Start from a deterministic default so the prerendered HTML matches the first client render; the
  // real OS (which reads navigator/location, unavailable at build time) is resolved after mount so
  // hydration never mismatches (S15.1).
  const [os, setOs] = useState<OS>('mac');
  useEffect(() => setOs(detectOS()), []);

  const channels = CHANNELS.filter((c) => forOS(c, os)).sort((a, b) => {
    const ra = a.recommendedFor === os ? 0 : 1;
    const rb = b.recommendedFor === os ? 0 : 1;
    return ra - rb;
  });

  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1 style={{ fontSize: 'clamp(1.8rem, 4vw, 2.6rem)' }}>Install mcpfold</h1>
        <p style={{ color: 'var(--fg-muted)', fontSize: '1.1rem' }}>
          Pick your channel — every one resolves to the same release.{' '}
          <span data-testid="version-badge">
            Latest: <strong>v{__APP_VERSION__}</strong>
          </span>
        </p>

        <div
          role="tablist"
          aria-label="Operating system"
          style={{ display: 'flex', gap: 'var(--space-2)', margin: 'var(--space-6) 0' }}
        >
          {(['mac', 'windows', 'linux'] as OS[]).map((o) => (
            <button
              key={o}
              role="tab"
              type="button"
              aria-selected={o === os}
              data-testid={`os-${o}`}
              onClick={() => setOs(o)}
              style={{
                padding: 'var(--space-2) var(--space-4)',
                borderRadius: 'var(--radius)',
                cursor: 'pointer',
                border: '1px solid var(--border)',
                background: o === os ? 'var(--accent)' : 'transparent',
                color: o === os ? 'var(--accent-fg)' : 'var(--fg)',
                fontWeight: 600,
              }}
            >
              {OS_LABEL[o]}
            </button>
          ))}
        </div>

        <div style={{ display: 'grid', gap: 'var(--space-6)' }}>
          {channels.map((c) => (
            <section key={c.id} data-testid={`channel-${c.id}`}>
              <h3 style={{ marginBottom: 'var(--space-2)' }}>
                {c.title}
                {c.recommendedFor === os && (
                  <span
                    style={{
                      marginLeft: 'var(--space-3)',
                      fontSize: '0.75rem',
                      color: 'var(--accent)',
                      fontWeight: 700,
                    }}
                  >
                    RECOMMENDED
                  </span>
                )}
              </h3>
              <CopyBlock command={c.command} label={c.title} />
              {c.note && (
                <p
                  style={{
                    color: 'var(--fg-muted)',
                    fontSize: '0.9rem',
                    marginTop: 'var(--space-2)',
                  }}
                >
                  {c.note}
                </p>
              )}
            </section>
          ))}
        </div>

        <section style={{ marginTop: 'var(--space-16)' }}>
          <h2>Then, get started</h2>
          <ol style={{ color: 'var(--fg-muted)', lineHeight: 2 }}>
            <li>
              <code>mcpfold init</code> — scaffold your canonical config.
            </li>
            <li>
              <code>mcpfold import</code> — adopt configs you already have.
            </li>
            <li>
              <code>mcpfold sync</code> — fold it out to every client.
            </li>
          </ol>
          <p>
            New to it? Try the <a href="/docs/quickstart.html">quickstart</a> or the guided flow:{' '}
            <code>mcpfold init --guided</code>.
          </p>
        </section>
      </Container>

      <FaqSection path="/install" />
    </>
  );
}
