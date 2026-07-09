import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Container } from '../design/components';
import { currentTheme, toggleTheme, type Theme } from '../design/theme';
import { liveNav, PRIMARY_CTA, SECONDARY_CTA, type NavLink } from '../site-structure';

/** Docs live in a separate build, so link to them with a real anchor (not client routing). */
function isHardLink(l: NavLink): boolean {
  return Boolean(l.external) || l.href.startsWith('/docs');
}

function useActive() {
  const { pathname } = useLocation();
  return (href: string) =>
    href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`);
}

function NavAnchor({
  link,
  active,
  onClick,
}: {
  link: NavLink;
  active: boolean;
  onClick?: () => void;
}) {
  const style = { color: active ? 'var(--fg)' : 'var(--fg-muted)', fontWeight: active ? 700 : 400 };
  const props = {
    'data-testid': `nav-${link.label.toLowerCase()}`,
    'aria-current': active ? ('page' as const) : undefined,
    style,
    onClick,
  };
  if (isHardLink(link)) {
    return (
      <a href={link.href} rel={link.external ? 'noreferrer' : undefined} {...props}>
        {link.label}
      </a>
    );
  }
  return (
    <Link to={link.href} {...props}>
      {link.label}
    </Link>
  );
}

export function Header() {
  const [theme, setTheme] = useState<Theme>('light');
  const [open, setOpen] = useState(false);
  useEffect(() => setTheme(currentTheme()), []);
  const isActive = useActive();
  const nav = liveNav();

  // Close the mobile menu on Escape.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const themeButton = (
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
  );

  return (
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
        style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)', height: 60 }}
      >
        <a
          href="/"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-2)',
            fontWeight: 800,
            fontSize: '1.15rem',
            color: 'var(--fg)',
          }}
        >
          <img
            src="/logo-mark.png"
            alt="mcpfold logo"
            width={28}
            height={28}
            style={{ borderRadius: 6, display: 'block' }}
          />
          mcpfold
        </a>

        {/* Flexible spacer pushes the right-hand cluster right at every width. */}
        <div style={{ flex: 1 }} />

        {/* Desktop nav — hidden below the mobile breakpoint (see tokens.css). */}
        <nav
          className="nav-desktop"
          aria-label="Primary"
          style={{ gap: 'var(--space-6)', alignItems: 'center' }}
        >
          {nav.map((l) => (
            <NavAnchor key={l.href} link={l} active={isActive(l.href)} />
          ))}
        </nav>

        <div className="nav-desktop" style={{ gap: 'var(--space-3)', alignItems: 'center' }}>
          <a href={SECONDARY_CTA.href} rel="noreferrer" style={{ color: 'var(--fg-muted)' }}>
            {SECONDARY_CTA.label}
          </a>
          <Link
            to={PRIMARY_CTA.href}
            data-testid="cta-install"
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              padding: '6px 14px',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
            }}
          >
            {PRIMARY_CTA.label}
          </Link>
        </div>

        {/* Theme toggle is a single, always-visible control. */}
        {themeButton}

        {/* Hamburger — visible only below the breakpoint (see tokens.css). */}
        <button
          type="button"
          className="nav-toggle"
          data-testid="menu-button"
          aria-label="Menu"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen((v) => !v)}
          style={{
            background: 'transparent',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            color: 'var(--fg)',
            cursor: 'pointer',
            padding: '4px 12px',
            fontSize: '1.1rem',
          }}
        >
          {open ? '✕' : '☰'}
        </button>
      </Container>

      {open && (
        <nav
          id="mobile-menu"
          aria-label="Mobile"
          data-testid="mobile-menu"
          style={{
            borderTop: '1px solid var(--border)',
            background: 'var(--bg)',
            padding: 'var(--space-4) var(--space-6)',
            display: 'flex',
            flexDirection: 'column',
            gap: 'var(--space-4)',
          }}
        >
          {nav.map((l) => (
            <NavAnchor
              key={l.href}
              link={l}
              active={isActive(l.href)}
              onClick={() => setOpen(false)}
            />
          ))}
          <a href={SECONDARY_CTA.href} rel="noreferrer" style={{ color: 'var(--fg-muted)' }}>
            {SECONDARY_CTA.label}
          </a>
          <Link
            to={PRIMARY_CTA.href}
            data-testid="cta-install-mobile"
            onClick={() => setOpen(false)}
            style={{
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              padding: '8px 14px',
              borderRadius: 'var(--radius)',
              fontWeight: 600,
              textAlign: 'center',
            }}
          >
            {PRIMARY_CTA.label}
          </Link>
        </nav>
      )}
    </header>
  );
}
