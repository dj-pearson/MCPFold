import type { CSSProperties } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Container } from '../design/components';
import { COMPARISONS, comparisonById } from './comparisons';

/**
 * Comparison / alternatives pages (S15.7): /compare (hub) and /compare/<id>. Fair, factual
 * consideration-stage pages that state trade-offs honestly (mcpfold is a local-first CLI + curation,
 * not a hosted enterprise gateway). Each page carries a comparison table plus TechArticle structured
 * data (injected centrally via seo/jsonld.ts) and links into install/directory. Framing is neutral
 * and defensible — no disparaging or unverifiable claims about other tools.
 */

const cell: CSSProperties = {
  border: '1px solid var(--border)',
  padding: 'var(--space-3)',
  textAlign: 'left',
  verticalAlign: 'top',
};

/** The /compare hub: an index of the comparison pages. */
export function CompareIndex() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>How mcpfold compares</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 680 }}>
        Honest, factual comparisons of the ways to manage MCP servers across clients — by hand, with
        a hosted gateway, or with mcpfold — so you can see where each one fits. mcpfold is a
        local-first, open-source CLI; these pages are clear about what it is and is not.
      </p>

      <ul data-testid="compare-index" style={{ maxWidth: 720, margin: 'var(--space-8) 0' }}>
        {COMPARISONS.map((c) => (
          <li key={c.id} style={{ marginBottom: 'var(--space-4)' }}>
            <Link to={`/compare/${c.id}`} data-testid={`compare-${c.id}`}>
              <strong>{c.h1}</strong>
            </Link>
            <p style={{ color: 'var(--fg-muted)', margin: 'var(--space-1) 0 0' }}>{c.intro}</p>
          </li>
        ))}
      </ul>

      <p>
        Ready to try it? <Link to="/install">Install mcpfold</Link> or browse the{' '}
        <Link to="/directory">MCP server directory</Link>.
      </p>
    </Container>
  );
}

/** A single comparison page. */
export function ComparePage() {
  const { id } = useParams<{ id: string }>();
  const entry = id ? comparisonById(id) : undefined;

  if (!entry) {
    return (
      <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
        <h1>Comparison not found</h1>
        <p>
          No such comparison. <Link to="/compare">See all comparisons</Link>.
        </p>
      </Container>
    );
  }

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <p style={{ marginBottom: 'var(--space-4)' }}>
        <Link to="/compare">← All comparisons</Link>
      </p>
      <h1>{entry.h1}</h1>
      <p
        data-testid="compare-intro"
        style={{ fontSize: '1.1rem', lineHeight: 1.55, maxWidth: 720, color: 'var(--fg)' }}
      >
        {entry.intro}
      </p>

      <div style={{ overflowX: 'auto', margin: 'var(--space-8) 0' }}>
        <table
          data-testid="compare-table"
          style={{ borderCollapse: 'collapse', width: '100%', minWidth: 520 }}
        >
          <thead>
            <tr>
              <th style={{ ...cell, background: 'var(--bg-elevated)' }}></th>
              {entry.table.columns.map((col) => (
                <th
                  key={col}
                  style={{ ...cell, background: 'var(--bg-elevated)', fontWeight: 700 }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {entry.table.rows.map((row) => (
              <tr key={row.dimension}>
                <th scope="row" style={{ ...cell, fontWeight: 600 }}>
                  {row.dimension}
                </th>
                {row.cells.map((c, i) => (
                  <td key={i} style={cell}>
                    {c}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ maxWidth: 720, lineHeight: 1.7 }}>
        {entry.body.map((para, i) => (
          <p key={i} style={{ marginBottom: 'var(--space-4)' }}>
            {para}
          </p>
        ))}
      </div>

      <h2 style={{ marginTop: 'var(--space-8)' }}>Related</h2>
      <ul data-testid="compare-related">
        {entry.related.map((l) => (
          <li key={l.href} style={{ marginBottom: 'var(--space-2)' }}>
            {l.href.startsWith('/docs/') || l.href.startsWith('http') ? (
              <a href={l.href}>{l.text}</a>
            ) : (
              <Link to={l.href}>{l.text}</Link>
            )}
          </li>
        ))}
      </ul>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project and is not affiliated with or endorsed by the
        MCP project or any other tool named here. Comparisons describe categories factually.
      </p>
    </Container>
  );
}
