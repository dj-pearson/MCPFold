import { marked } from 'marked';
import { Container } from '../design/components';
import '../blog/prose.css';
// Single source of truth (S13.16): the site roadmap renders the SAME docs/roadmap.md (S14.3), inlined
// at build via Vite `?raw`. Editing the roadmap is a one-file edit to that markdown — the page (and
// its status groups) reflow automatically on rebuild; there is no forked copy to keep in sync.
import roadmapRaw from '../../../../docs/roadmap.md?raw';

/** Rewrite the doc-relative markdown links (`./x.md`, `./x.md#anchor`) to the built docs site URLs. */
function rewriteDocLinks(html: string): string {
  return html.replace(
    /href="\.\/([^"#]+)\.md(#[^"]*)?"/g,
    (_all, file: string, anchor = '') => `href="/docs/${file}.html${anchor}"`,
  );
}

const ROADMAP_HTML = rewriteDocLinks(marked.parse(roadmapRaw, { async: false }) as string);

/**
 * Public roadmap page (S13.16). Renders docs/roadmap.md verbatim (status-grouped: Shipped / Next /
 * Exploring), with its doc links pointed at the published docs. Feeds trust and cuts "does it do X
 * yet" questions. Prerendered; in the sitemap + footer.
 */
export function Roadmap() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 760 }}>
      <article
        className="prose"
        data-testid="roadmap-body"
        dangerouslySetInnerHTML={{ __html: ROADMAP_HTML }}
      />
    </Container>
  );
}
