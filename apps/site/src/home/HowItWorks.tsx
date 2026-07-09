import { CopyBlock } from '../install/CopyBlock';
import { Container } from '../design/components';

/**
 * "How it works" (S13.8): the init → import → sync → diff sequence with copy-paste commands, so a
 * scrolled-past visitor sees the whole workflow without leaving. Commands mirror the real CLI
 * contract (packages/cli/src/commands).
 */
const STEPS = [
  {
    n: 1,
    command: 'mcpfold init',
    title: 'init',
    body: 'Create the canonical mcp.config.jsonc — one source of truth for every MCP server you run.',
  },
  {
    n: 2,
    command: 'mcpfold import',
    title: 'import',
    body: 'Pull the servers already configured across your clients into the canonical config, secrets rewritten as references.',
  },
  {
    n: 3,
    command: 'mcpfold sync',
    title: 'sync',
    body: "Fold the canonical config out to every client's native format — add a server once, it appears everywhere.",
  },
  {
    n: 4,
    command: 'mcpfold diff',
    title: 'diff',
    body: 'See any drift between the canonical config and what each client currently has, before you sync.',
  },
];

export function HowItWorks() {
  return (
    <Container style={{ paddingBottom: 'var(--space-16)' }}>
      <section data-testid="how-it-works" aria-labelledby="how-heading">
        <h2 id="how-heading">How it works</h2>
        <p style={{ color: 'var(--fg-muted)', maxWidth: 640 }}>
          Four commands take you from scattered client configs to one source of truth, folded out
          everywhere.
        </p>
        <ol style={{ listStyle: 'none', padding: 0, margin: 'var(--space-6) 0 0' }}>
          {STEPS.map((s) => (
            <li key={s.title} style={{ marginBottom: 'var(--space-6)' }}>
              <h3 style={{ margin: '0 0 var(--space-2)' }}>
                <span aria-hidden="true" style={{ color: 'var(--fg-muted)' }}>
                  {s.n}.{' '}
                </span>
                <code>{s.command}</code>
              </h3>
              <p style={{ color: 'var(--fg-muted)', margin: '0 0 var(--space-3)', maxWidth: 640 }}>
                {s.body}
              </p>
              <CopyBlock command={s.command} label={`${s.title} command`} />
            </li>
          ))}
        </ol>
      </section>
    </Container>
  );
}
