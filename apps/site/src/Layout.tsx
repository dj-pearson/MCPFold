import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import { Container } from './design/components';
import { currentTheme, toggleTheme, type Theme } from './design/theme';

/** Site shell (S13.1): sticky header with nav + theme toggle, and a footer. Every E13 page renders
 * inside this via the router <Outlet />. Docs live at /docs (separate build); the app on its own
 * subdomain — so the marketing routes never collide with them. */
export function Layout() {
  const [theme, setTheme] = useState<Theme>(() => currentTheme());

  return (
    <>
      <header
        style={{
          position: 'sticky',
          top: 0,
          zIndex: 10,
          borderBottom: '1px solid var(--border)',
          background: 'color-mix(in srgb, var(--bg) 88%, transparent)',
          backdropFilter: 'blur(8px)',
        }}
      >
        <Container
          style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-6)', height: 60 }}
        >
          <a href="/" style={{ fontWeight: 800, fontSize: '1.15rem', color: 'var(--fg)' }}>
            mcpfold
          </a>
          <nav style={{ display: 'flex', gap: 'var(--space-6)', marginLeft: 'auto' }}>
            <a href="/install" style={{ color: 'var(--fg-muted)' }}>
              Install
            </a>
            <a href="/directory" style={{ color: 'var(--fg-muted)' }}>
              Directory
            </a>
            <a href="/docs" style={{ color: 'var(--fg-muted)' }}>
              Docs
            </a>
            <a
              href="https://github.com/dj-pearson/MCPFold"
              style={{ color: 'var(--fg-muted)' }}
              rel="noreferrer"
            >
              GitHub
            </a>
            <button
              type="button"
              aria-label="Toggle color theme"
              data-testid="theme-toggle"
              onClick={() => setTheme(toggleTheme())}
              style={{
                background: 'transparent',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius)',
                color: 'var(--fg)',
                cursor: 'pointer',
                padding: '4px 10px',
              }}
            >
              {theme === 'dark' ? '☀︎' : '☾'}
            </button>
          </nav>
        </Container>
      </header>

      <main>
        <Outlet />
      </main>

      <footer style={{ borderTop: '1px solid var(--border)', marginTop: 'var(--space-16)' }}>
        <Container
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-4)',
            justifyContent: 'space-between',
            padding: 'var(--space-8) var(--space-6)',
            color: 'var(--fg-muted)',
            fontSize: '0.9rem',
          }}
        >
          <span>© mcpfold — MIT licensed, open source.</span>
          <span style={{ display: 'flex', gap: 'var(--space-6)' }}>
            <a href="/docs">Docs</a>
            <a href="/docs/security.html">Security</a>
            <a href="https://github.com/sponsors/dj-pearson" rel="noreferrer">
              Sponsor
            </a>
            <a href="https://github.com/dj-pearson/MCPFold" rel="noreferrer">
              GitHub
            </a>
          </span>
        </Container>
      </footer>
    </>
  );
}
