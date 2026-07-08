import type { CSSProperties, ReactNode } from 'react';

/**
 * mcpfold design-system primitives (S13.1). Deliberately small — a shared vocabulary
 * (Container, Button, Badge) that every E13 page reuses so the site reads as one product.
 */

export function Container({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      style={{ maxWidth: 'var(--maxw)', margin: '0 auto', padding: '0 var(--space-6)', ...style }}
    >
      {children}
    </div>
  );
}

export function Button({
  children,
  href,
  variant = 'primary',
  ...rest
}: {
  children: ReactNode;
  href?: string;
  variant?: 'primary' | 'ghost';
} & React.AnchorHTMLAttributes<HTMLAnchorElement>) {
  const base: CSSProperties = {
    display: 'inline-block',
    padding: 'var(--space-3) var(--space-6)',
    borderRadius: 'var(--radius)',
    fontWeight: 600,
    textDecoration: 'none',
    border: '1px solid transparent',
    transition: 'opacity 0.15s ease',
  };
  const variants: Record<string, CSSProperties> = {
    primary: { background: 'var(--accent)', color: 'var(--accent-fg)' },
    ghost: { background: 'transparent', color: 'var(--fg)', borderColor: 'var(--border)' },
  };
  return (
    <a href={href} style={{ ...base, ...variants[variant] }} {...rest}>
      {children}
    </a>
  );
}

export function Badge({ children }: { children: ReactNode }) {
  return (
    <span
      style={{
        display: 'inline-block',
        padding: '2px 10px',
        borderRadius: 999,
        background: 'var(--bg-elevated)',
        border: '1px solid var(--border)',
        color: 'var(--fg-muted)',
        fontSize: '0.8rem',
        fontWeight: 600,
      }}
    >
      {children}
    </span>
  );
}
