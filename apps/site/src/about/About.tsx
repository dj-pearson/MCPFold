import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Container } from '../design/components';

/**
 * About / open-source project page (S13.12). States the mission, the open-source model + license
 * boundaries (MIT core/CLI, optional commercial cloud), and how to get involved (GitHub, CONTRIBUTING,
 * governance, roadmap, and the adapter on-ramp).
 *
 * Live project signals degrade gracefully: the latest release comes from the build (`__APP_VERSION__`,
 * the committed CLI version) so it is always in the prerendered HTML; the GitHub star and contributor
 * counts are fetched client-side and simply omitted if the API is unavailable — no error, no layout
 * shift. Neutral about the MCP project: mcpfold is independent and not endorsed by it.
 */
const REPO = 'dj-pearson/MCPFold';
const GH = `https://github.com/${REPO}`;

/** Live GitHub signals, fetched client-side; each is null until (and unless) it resolves. */
function useGitHubSignals() {
  const [stars, setStars] = useState<number | null>(null);
  const [contributors, setContributors] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { stargazers_count?: unknown }) => {
        if (alive && typeof d.stargazers_count === 'number') setStars(d.stargazers_count);
      })
      .catch(() => {
        /* Signal unavailable — leave null and render without a count. */
      });

    fetch(`https://api.github.com/repos/${REPO}/contributors?per_page=1&anon=1`)
      .then((r) => {
        if (!r.ok) return Promise.reject(new Error(String(r.status)));
        const link = r.headers.get('link');
        const m = link && /[?&]page=(\d+)>;\s*rel="last"/.exec(link);
        if (m) return Number(m[1]);
        return r.json().then((arr: unknown) => (Array.isArray(arr) ? arr.length : null));
      })
      .then((n) => {
        if (alive && typeof n === 'number') setContributors(n);
      })
      .catch(() => {
        /* Signal unavailable — leave null. */
      });

    return () => {
      alive = false;
    };
  }, []);

  return { stars, contributors };
}

const card: React.CSSProperties = {
  border: '1px solid var(--border)',
  borderRadius: 'var(--radius)',
  background: 'var(--bg-elevated)',
  padding: 'var(--space-6)',
  margin: 'var(--space-6) 0',
};

export function About() {
  const { stars, contributors } = useGitHubSignals();

  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 820 }}>
      <h1>About mcpfold</h1>
      <p style={{ fontSize: '1.15rem', lineHeight: 1.5, color: 'var(--fg)' }}>
        mcpfold is a free, open-source CLI that gives you one source of truth for your MCP servers —
        one canonical config, folded out to every client — so you stop hand-editing a different file
        for each tool.
      </p>

      <h2>The mission</h2>
      <p>
        Every MCP client keeps its servers in its own file and its own shape, and every server dumps
        its full tool schema into the model’s context whether you use it or not. mcpfold exists to
        fix both: own one neutral, portable <code>mcp.config.jsonc</code> format that renders to
        every client, and curate the tools that load so you stop paying the context-window tax.
        Secrets stay as references, never values.
      </p>

      <h2>Open source, with a clear line</h2>
      <p>
        The CLI and everything local — the config format, the adapters, the proxy, secret resolution
        — are <strong>free forever and MIT-licensed</strong>. There is no paid tier hiding local
        features behind a login.
      </p>
      <p>
        The only commercial surface is the optional hosted <strong>team cloud</strong> — shared
        configs, an audit trail, and managed sync — which you can also{' '}
        <Link to="/pricing">self-host for free</Link>. Even then, only config with secret{' '}
        <em>references</em> is ever synced; secret values never leave your machine. mcpfold stays
        local-first and is deliberately not a hosted enterprise MCP gateway.
      </p>

      {/* Live project signals — latest release is build-time (always present); stars/contributors
          are client-only and degrade gracefully. */}
      <div data-testid="project-signals" style={card}>
        <h2 style={{ marginTop: 0 }}>Project signals</h2>
        <ul
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 'var(--space-6)',
            listStyle: 'none',
            padding: 0,
            margin: 0,
            color: 'var(--fg-muted)',
          }}
        >
          <li>
            Latest release:{' '}
            <a href="https://www.npmjs.com/package/mcpfold" rel="noreferrer" target="_blank">
              <strong data-testid="latest-release">{`v${__APP_VERSION__}`}</strong>
            </a>
          </li>
          <li>
            <a href={GH} data-testid="about-github" rel="noreferrer" target="_blank">
              GitHub
            </a>
            {stars !== null && (
              <>
                {' — '}
                <strong data-testid="about-stars">★ {stars.toLocaleString('en-US')}</strong>
              </>
            )}
          </li>
          {contributors !== null && (
            <li>
              <strong data-testid="about-contributors">
                {contributors.toLocaleString('en-US')}
              </strong>{' '}
              contributors
            </li>
          )}
          <li>
            <a href={`${GH}/blob/main/LICENSE`} rel="noreferrer" target="_blank">
              MIT license
            </a>
          </li>
        </ul>
      </div>

      <h2>Get involved</h2>
      <p>
        mcpfold is built in the open and adding a client is a one-PR job — the fastest way to help
        is to <a href="/docs/adapters.html">contribute an adapter</a> for a client you use (there’s
        a <code>mcpfold scaffold-adapter</code> command to start you off).
      </p>
      <ul data-testid="about-links">
        <li>
          <a href={GH} rel="noreferrer" target="_blank">
            Source on GitHub
          </a>
        </li>
        <li>
          <a href={`${GH}/blob/main/CONTRIBUTING.md`} rel="noreferrer" target="_blank">
            Contributing guide
          </a>
        </li>
        <li>
          <a href="/docs/governance.html">Project governance</a>
        </li>
        <li>
          <a href="/docs/roadmap.html">Roadmap</a>
        </li>
        <li>
          <a href="/docs/adapters.html">Write an adapter</a>
        </li>
      </ul>

      <p style={{ color: 'var(--fg-muted)', fontSize: '0.85rem', marginTop: 'var(--space-8)' }}>
        mcpfold is an independent, open-source project. The Model Context Protocol is an open
        standard; mcpfold is not affiliated with or endorsed by the MCP project.
      </p>
    </Container>
  );
}
