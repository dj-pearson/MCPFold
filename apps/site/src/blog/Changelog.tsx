import { marked } from 'marked';
import { Container } from '../design/components';
import './prose.css';
// The changelog is derived from the repo's CHANGELOG.md (the human-readable summary Changesets
// feeds), so release notes are never hand-maintained twice.
import changelogRaw from '../../../../CHANGELOG.md?raw';

const html = marked.parse(changelogRaw, { async: false }) as string;

/** Changelog page (S13.7) — renders the CHANGELOG.md source. */
export function Changelog() {
  return (
    <>
      <Container style={{ padding: 'var(--space-16) var(--space-6)', maxWidth: 720 }}>
        <article
          className="prose"
          data-testid="changelog-body"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </Container>
    </>
  );
}
