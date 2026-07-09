import { useEffect, useState } from 'react';
import { Container } from '../design/components';

/**
 * OSS-credibility slot (S13.8). The MIT license and the latest npm version are sourced from the
 * build (`__APP_VERSION__`, the committed CLI package) and are therefore present in the prerendered
 * HTML. The live GitHub star count is fetched client-side and degrades gracefully: if the API is
 * unavailable it simply renders the repo link with no count — no error, no layout shift beyond the
 * badge. No implied endorsement; these are factual signals.
 */
const REPO = 'dj-pearson/MCPFold';

export function Credibility() {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let alive = true;
    fetch(`https://api.github.com/repos/${REPO}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((d: { stargazers_count?: unknown }) => {
        if (alive && typeof d.stargazers_count === 'number') setStars(d.stargazers_count);
      })
      .catch(() => {
        /* Signal unavailable — leave `stars` null and render the repo link without a count. */
      });
    return () => {
      alive = false;
    };
  }, []);

  return (
    <Container style={{ paddingBottom: 'var(--space-16)' }}>
      <section
        data-testid="credibility"
        aria-labelledby="cred-heading"
        style={{
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius)',
          background: 'var(--bg-elevated)',
          padding: 'var(--space-6)',
        }}
      >
        <h2 id="cred-heading" style={{ marginTop: 0 }}>
          Free, open source, and MIT-licensed
        </h2>
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
            <a
              href={`https://github.com/${REPO}`}
              data-testid="github-link"
              rel="noreferrer"
              target="_blank"
            >
              GitHub
            </a>
            {stars !== null && (
              <>
                {' — '}
                <strong data-testid="github-stars">★ {stars.toLocaleString('en-US')}</strong>
              </>
            )}
          </li>
          <li>
            Latest on npm:{' '}
            <a href="https://www.npmjs.com/package/mcpfold" rel="noreferrer" target="_blank">
              <strong data-testid="npm-version">{`v${__APP_VERSION__}`}</strong>
            </a>
          </li>
          <li>
            <a
              href={`https://github.com/${REPO}/blob/main/LICENSE`}
              rel="noreferrer"
              target="_blank"
            >
              MIT license
            </a>
          </li>
        </ul>
      </section>
    </Container>
  );
}
