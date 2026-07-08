import { useMemo, useState } from 'react';
import { compute, FIXTURE_SERVERS } from './model';

/**
 * Interactive context-window benchmark (S13.2). Client-side only — pick servers and how many tools
 * to keep, and watch the token/context savings using the committed S5.4 methodology. Server names
 * are examples from the published benchmark; no endorsement implied. Keyboard- and screen-reader-
 * friendly (native inputs + an aria-live results region).
 */
export function Calculator() {
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(FIXTURE_SERVERS.map((s) => s.name)),
  );
  const [keep, setKeep] = useState(3);

  const servers = FIXTURE_SERVERS.filter((s) => selected.has(s.name));
  const result = useMemo(() => compute(servers, keep), [servers, keep]);

  const toggle = (name: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  const cell: React.CSSProperties = {
    border: '1px solid var(--border)',
    borderRadius: 'var(--radius)',
    background: 'var(--bg-elevated)',
    padding: 'var(--space-4)',
  };

  return (
    <section
      aria-labelledby="calc-heading"
      style={{
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius)',
        padding: 'var(--space-6)',
        background: 'var(--bg)',
      }}
    >
      <h2 id="calc-heading" style={{ marginTop: 0 }}>
        Feel the tax — and the savings
      </h2>
      <p style={{ color: 'var(--fg-muted)', marginTop: 0 }}>
        Pick your servers and how many tools each agent actually needs.{' '}
        <span style={{ whiteSpace: 'nowrap' }}>Example servers</span> from the published benchmark —
        no endorsement implied.
      </p>

      <fieldset style={{ border: 'none', padding: 0, margin: 0 }}>
        <legend style={{ fontWeight: 600, marginBottom: 'var(--space-2)' }}>Servers</legend>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
          {FIXTURE_SERVERS.map((s) => (
            <label
              key={s.name}
              style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}
            >
              <input
                type="checkbox"
                checked={selected.has(s.name)}
                onChange={() => toggle(s.name)}
                data-testid={`server-${s.name}`}
              />
              <code>{s.name}</code>
              <span style={{ color: 'var(--fg-muted)' }}>({s.toolCount} tools)</span>
            </label>
          ))}
        </div>
      </fieldset>

      <p style={{ marginBottom: 'var(--space-2)', marginTop: 'var(--space-6)' }}>
        <label htmlFor="keep" style={{ fontWeight: 600 }}>
          Tools kept per server: <span data-testid="keep-value">{keep}</span>
        </label>
      </p>
      <input
        id="keep"
        type="range"
        min={0}
        max={20}
        value={keep}
        onChange={(e) => setKeep(Number(e.target.value))}
        data-testid="keep-slider"
        style={{ width: '100%' }}
      />

      <div
        aria-live="polite"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))',
          marginTop: 'var(--space-6)',
        }}
      >
        <div style={cell}>
          <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>Tools</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }} data-testid="tools-out">
            {result.toolsBefore} → {result.toolsAfter}
          </div>
        </div>
        <div style={cell}>
          <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>Tool-schema tokens</div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }} data-testid="tokens-out">
            {result.tokensBefore.toLocaleString()} → {result.tokensAfter.toLocaleString()}
          </div>
        </div>
        <div style={{ ...cell, background: 'var(--accent)', color: 'var(--accent-fg)' }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Context cut</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }} data-testid="reduction-out">
            {result.reductionPct}%
          </div>
        </div>
      </div>
    </section>
  );
}
