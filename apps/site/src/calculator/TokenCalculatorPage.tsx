import { useMemo, useState, type CSSProperties } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../design/components';
import { compute, type BenchServer } from '../benchmark/model';
import { faqsForPath } from '../seo/faq';

/**
 * Standalone MCP token calculator (/mcp-token-calculator) — a free, utility-first tool that estimates
 * how many tokens a set of MCP servers spends on tool definitions every turn, and how much per-client
 * curation saves. Client-side only (nothing is uploaded), so it doubles as a private way to size your
 * own setup. Uses the committed S5.4 methodology (benchmark/model.ts), so its numbers agree with the
 * published benchmark. Server tool counts are editable estimates — real cost depends on each tool's
 * schema.
 */

/** A typical, editable tool count for a few well-known servers (approximate — edit to match yours). */
const PRESETS: readonly BenchServer[] = [
  { name: 'filesystem', toolCount: 11 },
  { name: 'github', toolCount: 20 },
  { name: 'supabase', toolCount: 15 },
  { name: 'playwright', toolCount: 10 },
  { name: 'slack', toolCount: 8 },
  { name: 'notion', toolCount: 15 },
  { name: 'postgres', toolCount: 6 },
  { name: 'puppeteer', toolCount: 7 },
];

/** Root keys different clients store MCP servers under — used to read servers out of a pasted config. */
const CONFIG_ROOTS = [
  'mcpServers',
  'servers',
  'context_servers',
  'mcp_servers',
  'extensions',
  'mcp',
] as const;

const CONTEXT_WINDOW = 200_000;

/** Strip // line and /* *\/ block comments so a pasted JSONC config parses. */
function parseConfigServers(text: string): BenchServer[] | { error: string } {
  const stripped = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  let data: unknown;
  try {
    data = JSON.parse(stripped);
  } catch {
    return { error: 'Could not parse that as JSON. Paste a client MCP config (JSON or JSONC).' };
  }
  if (!data || typeof data !== 'object') return { error: 'No MCP servers found in that config.' };
  const obj = data as Record<string, unknown>;
  for (const root of CONFIG_ROOTS) {
    const section = obj[root];
    if (section && typeof section === 'object' && !Array.isArray(section)) {
      const names = Object.keys(section as Record<string, unknown>);
      if (names.length > 0) return names.map((name) => ({ name, toolCount: 15 }));
    }
  }
  return {
    error: 'No MCP servers found — expected a "mcpServers" (or servers/context_servers) block.',
  };
}

const cell: CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  padding: 'var(--space-4)',
};

export function TokenCalculatorPage() {
  const [servers, setServers] = useState<BenchServer[]>(() => PRESETS.slice(0, 4));
  const [keep, setKeep] = useState(4);
  const [paste, setPaste] = useState('');
  const [pasteMsg, setPasteMsg] = useState<string | null>(null);

  const result = useMemo(() => compute(servers, keep), [servers, keep]);
  const savedPerTurn = result.tokensBefore - result.tokensAfter;
  const shareBefore = ((result.tokensBefore / CONTEXT_WINDOW) * 100).toFixed(1);
  const shareAfter = ((result.tokensAfter / CONTEXT_WINDOW) * 100).toFixed(1);

  const setCount = (i: number, toolCount: number) =>
    setServers((prev) => prev.map((s, j) => (j === i ? { ...s, toolCount } : s)));
  const setName = (i: number, name: string) =>
    setServers((prev) => prev.map((s, j) => (j === i ? { ...s, name } : s)));
  const remove = (i: number) => setServers((prev) => prev.filter((_, j) => j !== i));
  const addServer = (s: BenchServer) =>
    setServers((prev) => (prev.some((p) => p.name === s.name) ? prev : [...prev, { ...s }]));

  const loadPaste = () => {
    const parsed = parseConfigServers(paste);
    if ('error' in parsed) {
      setPasteMsg(parsed.error);
      return;
    }
    setServers(parsed);
    setPasteMsg(
      `Loaded ${parsed.length} server${parsed.length === 1 ? '' : 's'}. Tool counts are estimates — edit them to match yours.`,
    );
  };

  const faqs = faqsForPath('/mcp-token-calculator');

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>MCP token calculator</h1>
      <p style={{ fontSize: '1.1rem', lineHeight: 1.55, maxWidth: 720, color: 'var(--fg)' }}>
        The MCP token calculator estimates how many tokens your connected MCP servers spend on tool
        definitions every turn — and how much per-client curation with <strong>mcpfold</strong>
        &nbsp;saves. Every server you connect loads its full tool schema into the model’s context on
        each turn, whether the agent uses those tools or not. Everything runs in your browser;
        nothing is uploaded.
      </p>

      {/* Paste-your-config loader */}
      <section
        aria-labelledby="paste-heading"
        style={{ ...cell, marginTop: 'var(--space-8)', background: 'var(--bg)' }}
      >
        <h2 id="paste-heading" style={{ marginTop: 0, fontSize: '1.1rem' }}>
          Load your own config (optional)
        </h2>
        <p style={{ color: 'var(--fg-muted)', marginTop: 0 }}>
          Paste a client’s MCP config (the <code>mcpServers</code> block from Claude, Cursor, VS
          Code, …). It’s parsed locally to read your server names; set each tool count below.
        </p>
        <textarea
          value={paste}
          onChange={(e) => setPaste(e.target.value)}
          data-testid="config-paste"
          aria-label="Paste MCP config JSON"
          spellCheck={false}
          rows={5}
          placeholder={
            '{\n  "mcpServers": {\n    "github": { "command": "npx", "args": ["…"] }\n  }\n}'
          }
          style={{
            width: '100%',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: '0.85rem',
            padding: 'var(--space-3)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            background: 'var(--bg-elevated)',
            color: 'var(--fg)',
            resize: 'vertical',
          }}
        />
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-3)',
            alignItems: 'center',
            marginTop: 'var(--space-2)',
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            onClick={loadPaste}
            disabled={paste.trim().length === 0}
            data-testid="config-load"
            style={{
              padding: 'var(--space-2) var(--space-4)',
              borderRadius: 'var(--radius)',
              border: '1px solid var(--border)',
              background: 'var(--accent)',
              color: 'var(--accent-fg)',
              cursor: paste.trim().length === 0 ? 'not-allowed' : 'pointer',
              fontWeight: 600,
            }}
          >
            Load servers
          </button>
          {pasteMsg && (
            <span role="status" style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
              {pasteMsg}
            </span>
          )}
        </div>
      </section>

      {/* Server editor */}
      <section aria-labelledby="servers-heading" style={{ marginTop: 'var(--space-8)' }}>
        <h2 id="servers-heading" style={{ fontSize: '1.1rem' }}>
          Your servers
        </h2>
        <div style={{ display: 'grid', gap: 'var(--space-2)', maxWidth: 520 }}>
          {servers.map((s, i) => (
            <div
              key={i}
              style={{ display: 'flex', gap: 'var(--space-2)', alignItems: 'center' }}
              data-testid={`row-${i}`}
            >
              <input
                aria-label={`Server ${i + 1} name`}
                value={s.name}
                onChange={(e) => setName(i, e.target.value)}
                style={{
                  flex: 1,
                  padding: 'var(--space-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--fg)',
                }}
              />
              <input
                aria-label={`${s.name} tool count`}
                type="number"
                min={0}
                max={200}
                value={s.toolCount}
                onChange={(e) => setCount(i, Math.max(0, Number(e.target.value)))}
                data-testid={`count-${i}`}
                style={{
                  width: 76,
                  padding: 'var(--space-2)',
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--fg)',
                }}
              />
              <span style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>tools</span>
              <button
                type="button"
                onClick={() => remove(i)}
                aria-label={`Remove ${s.name}`}
                style={{
                  border: '1px solid var(--border)',
                  borderRadius: 'var(--radius)',
                  background: 'var(--bg-elevated)',
                  color: 'var(--fg-muted)',
                  cursor: 'pointer',
                  padding: 'var(--space-2) var(--space-3)',
                }}
              >
                ×
              </button>
            </div>
          ))}
          {servers.length === 0 && (
            <p style={{ color: 'var(--fg-muted)' }}>Add a server below to start.</p>
          )}
        </div>

        <div style={{ marginTop: 'var(--space-4)' }}>
          <span
            style={{ fontSize: '0.85rem', color: 'var(--fg-muted)', marginRight: 'var(--space-2)' }}
          >
            Quick-add:
          </span>
          {PRESETS.map((p) => (
            <button
              key={p.name}
              type="button"
              onClick={() => addServer(p)}
              style={{
                margin: '0 var(--space-2) var(--space-2) 0',
                padding: 'var(--space-1) var(--space-3)',
                borderRadius: '999px',
                border: '1px solid var(--border)',
                background: 'var(--bg-elevated)',
                color: 'var(--fg)',
                cursor: 'pointer',
                fontSize: '0.85rem',
              }}
            >
              + {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => addServer({ name: `server-${servers.length + 1}`, toolCount: 12 })}
            style={{
              margin: '0 var(--space-2) var(--space-2) 0',
              padding: 'var(--space-1) var(--space-3)',
              borderRadius: '999px',
              border: '1px dashed var(--border)',
              background: 'transparent',
              color: 'var(--fg-muted)',
              cursor: 'pointer',
              fontSize: '0.85rem',
            }}
          >
            + custom
          </button>
        </div>
      </section>

      {/* Keep slider */}
      <section style={{ marginTop: 'var(--space-8)', maxWidth: 520 }}>
        <label htmlFor="keep" style={{ fontWeight: 600 }}>
          Tools each agent actually needs (kept per server):{' '}
          <span data-testid="keep-value">{keep}</span>
        </label>
        <input
          id="keep"
          type="range"
          min={0}
          max={20}
          value={keep}
          onChange={(e) => setKeep(Number(e.target.value))}
          data-testid="keep-slider"
          style={{ width: '100%', marginTop: 'var(--space-2)' }}
        />
      </section>

      {/* Results */}
      <div
        aria-live="polite"
        style={{
          display: 'grid',
          gap: 'var(--space-4)',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          marginTop: 'var(--space-8)',
        }}
      >
        <div style={cell}>
          <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>Tools loaded</div>
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
        <div style={cell}>
          <div style={{ color: 'var(--fg-muted)', fontSize: '0.85rem' }}>
            Share of a 200K window
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }} data-testid="share-out">
            {shareBefore}% → {shareAfter}%
          </div>
        </div>
        <div style={{ ...cell, background: 'var(--accent)', color: 'var(--accent-fg)' }}>
          <div style={{ fontSize: '0.85rem', opacity: 0.9 }}>Context cut</div>
          <div style={{ fontSize: '1.8rem', fontWeight: 800 }} data-testid="reduction-out">
            {result.reductionPct}%
          </div>
          <div style={{ fontSize: '0.8rem', opacity: 0.9 }}>
            {savedPerTurn.toLocaleString()} tokens / turn
          </div>
        </div>
      </div>

      {/* CTA */}
      <div
        style={{
          ...cell,
          marginTop: 'var(--space-8)',
          display: 'flex',
          gap: 'var(--space-4)',
          alignItems: 'center',
          flexWrap: 'wrap',
        }}
      >
        <div style={{ flex: 1, minWidth: 240 }}>
          <strong>Stop paying that tax.</strong> mcpfold curates the toolset per client from one
          canonical config — deterministically, on every client, with no extra config.
        </div>
        <Link
          to="/install"
          style={{
            padding: 'var(--space-3) var(--space-5)',
            borderRadius: 'var(--radius)',
            background: 'var(--accent)',
            color: 'var(--accent-fg)',
            fontWeight: 700,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
          }}
        >
          Install mcpfold
        </Link>
      </div>

      <p
        style={{
          color: 'var(--fg-muted)',
          fontSize: '0.85rem',
          marginTop: 'var(--space-6)',
          maxWidth: 720,
        }}
      >
        <strong>How this is estimated:</strong> tokens are computed from a representative tool
        schema (~1 token ≈ 4 characters of JSON, the common rule of thumb), the same method as
        mcpfold’s{' '}
        <a href="https://github.com/dj-pearson/MCPFold/blob/main/docs/benchmark.md">
          reproducible benchmark
        </a>
        , which also publishes{' '}
        <a href="https://github.com/dj-pearson/MCPFold/blob/main/docs/benchmark.md#exact-per-model-token-counts">
          exact per-model counts
        </a>{' '}
        (GPT and Claude tokenizers) that land within a few percent of this approximation. Real cost
        depends on each tool’s actual schema, so treat the tool counts as editable estimates. The
        relative reduction is stable regardless of tokenizer. See{' '}
        <Link to="/compare/reduce-mcp-token-usage">how to reduce MCP token usage</Link> for every
        approach compared.
      </p>

      {/* Visible FAQ (matches the FAQPage JSON-LD) */}
      {faqs.length > 0 && (
        <section style={{ marginTop: 'var(--space-12)', maxWidth: 720 }}>
          <h2>Frequently asked</h2>
          {faqs.map((f) => (
            <div key={f.question} style={{ marginBottom: 'var(--space-4)' }}>
              <h3 style={{ marginBottom: 'var(--space-1)' }}>{f.question}</h3>
              <p style={{ marginTop: 0, color: 'var(--fg-muted)' }}>{f.answer}</p>
            </div>
          ))}
        </section>
      )}
    </Container>
  );
}
