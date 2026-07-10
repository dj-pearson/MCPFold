import type { ReactNode } from 'react';
import { Container } from '../design/components';
import { Hero } from '../home/Hero';
import { Calculator } from '../benchmark/Calculator';
import { HowItWorks } from '../home/HowItWorks';
import { UseCases } from '../home/UseCases';
import { Credibility } from '../home/Credibility';
import { FinalCta } from '../home/FinalCta';
import { FaqSection } from '../seo/FaqSection';

/**
 * Homepage (S13.2; on-page SEO S15.3; full narrative S13.8). Hero + benchmark proof, then the full
 * body: a four-pillar features overview (each linking to its live deep-dive), a how-it-works command
 * sequence, a use-cases teaser, an OSS-credibility slot, the internal-link graph, and a closing CTA.
 * Keyword-targeted H2s stay indexable; benchmark numbers come from committed source so the site and
 * docs never disagree.
 */
export function Home() {
  return (
    <>
      <Hero />

      <Container style={{ padding: 'var(--space-8) var(--space-6)' }}>
        <Calculator />
      </Container>

      <Container style={{ paddingBottom: 'var(--space-8)' }}>
        {/* Features overview — the four pillars, each a keyword-led H2 linking to its deep-dive. */}
        <section aria-label="What mcpfold does" data-testid="features">
          <SeoBlock
            heading="Manage every MCP server from one file"
            keyword="MCP config"
            body="Write your MCP servers once in a single canonical mcp.config.jsonc — the source of truth mcpfold folds out to every client. Add, curate, and version your MCP config in one place instead of hand-editing a different file for each tool."
            link={{ href: '/docs/config-format.html', text: 'See the config format' }}
          />

          <SeoBlock
            heading="Works with every MCP client"
            keyword="every MCP client"
            body="mcpfold renders each client's own native format from one config, so the same MCP servers show up everywhere:"
          >
            <ul className="client-list" data-testid="client-list">
              {CLIENTS.map((c) => (
                <li key={c.name}>
                  <a href={c.href}>{c.name}</a>
                </li>
              ))}
            </ul>
          </SeoBlock>

          <SeoBlock
            heading="Curate tools, cut the context-window tax"
            keyword="cut MCP context tokens"
            body="Every MCP server dumps its full tool schema into the model's context whether you use those tools or not. mcpfold lets you allow- or deny-list tools per server, so only what you need loads — the committed benchmark shows the token savings."
            link={{ href: '/docs/benchmark.html', text: 'See the benchmark' }}
          />

          <SeoBlock
            heading="Secrets as references, never values"
            keyword="MCP secrets"
            body="Your MCP config carries ${env:…} / ${op:…} references instead of raw tokens, so nothing sensitive is ever written to a client config or committed to git. mcpfold resolves the reference at fold time, from your environment or secret manager."
            link={{ href: '/docs/secrets.html', text: 'How secrets work' }}
          />
        </section>
      </Container>

      <HowItWorks />

      <UseCases />

      <Credibility />

      <Container style={{ paddingBottom: 'var(--space-16)' }}>
        <section aria-labelledby="explore-heading">
          <h2 id="explore-heading">Explore mcpfold</h2>
          <ul className="explore-links" data-testid="explore-links">
            {EXPLORE.map((l) => (
              <li key={l.href}>
                <a href={l.href}>{l.text}</a> — {l.desc}
              </li>
            ))}
          </ul>
        </section>
      </Container>

      <FinalCta />

      <FaqSection path="/" />
    </>
  );
}

function SeoBlock({
  heading,
  keyword,
  body,
  link,
  children,
}: {
  heading: string;
  keyword: string;
  body: string;
  link?: { href: string; text: string };
  children?: ReactNode;
}) {
  return (
    <div style={{ maxWidth: 760, margin: '0 auto var(--space-10)' }} data-keyword={keyword}>
      <h2 style={{ marginBottom: 'var(--space-3)' }}>{heading}</h2>
      <p style={{ color: 'var(--fg-muted)', margin: 0 }}>{body}</p>
      {children}
      {link && (
        <p style={{ marginTop: 'var(--space-3)' }}>
          <a href={link.href}>{link.text} →</a>
        </p>
      )}
    </div>
  );
}

// The supported clients, linked to the adapter-coverage docs (per-client guides land in S15.5).
const CLIENTS = [
  'Claude Desktop',
  'Claude Code',
  'Cursor',
  'VS Code',
  'Windsurf',
  'Zed',
  'Cline',
  'Gemini CLI',
  'JetBrains',
  'Visual Studio',
  'Continue',
  'Roo Code',
  'Goose',
  'Codex CLI',
  'LM Studio',
  'Warp',
  'opencode',
  'Copilot CLI',
].map((name) => ({ name, href: '/docs/coverage.html' }));

// Internal-link graph out of the homepage (existing pages; guides/glossary link in with S15.5/S15.6).
const EXPLORE = [
  { href: '/install', text: 'Install', desc: 'npx, npm, Homebrew, or Scoop — no account needed.' },
  {
    href: '/features',
    text: 'Features',
    desc: 'deep dives on the four pillars, with examples and proof.',
  },
  {
    href: '/directory',
    text: 'MCP server directory',
    desc: 'browse and add community MCP servers.',
  },
  { href: '/docs', text: 'Documentation', desc: 'config format, secrets, adapters, CLI contract.' },
  { href: '/pricing', text: 'Pricing', desc: 'free CLI (MIT); optional paid cloud for teams.' },
];
