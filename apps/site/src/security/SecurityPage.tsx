import type { ReactNode } from 'react';
import { Container } from '../design/components';

/**
 * Public security & trust page (S13.13). Plain-language summary of the invariants that matter when
 * you hand mcpfold a secrets-adjacent config, each linking the authoritative doc. Every claim here
 * mirrors docs/security.md, docs/secrets.md, docs/threat-model.md and SECURITY.md — including the
 * honest caveats (the opt-in `inline` strategy; config is executable code). No overstatement.
 */
const REPO = 'https://github.com/dj-pearson/MCPFold';

function Section({
  id,
  title,
  children,
  more,
}: {
  id: string;
  title: string;
  children: ReactNode;
  more?: { href: string; text: string };
}) {
  return (
    <section data-testid={id} style={{ marginBottom: 'var(--space-10)', maxWidth: 720 }}>
      <h2>{title}</h2>
      <div style={{ color: 'var(--fg-muted)' }}>{children}</div>
      {more && (
        <p style={{ marginTop: 'var(--space-3)' }}>
          <a href={more.href}>{more.text} →</a>
        </p>
      )}
    </section>
  );
}

export function SecurityPage() {
  return (
    <Container style={{ padding: 'var(--space-16) var(--space-6)' }}>
      <h1>Security &amp; trust</h1>
      <p style={{ color: 'var(--fg-muted)', maxWidth: 720, fontSize: '1.1rem' }}>
        mcpfold manages configuration that lives next to your secrets, so its security posture is a
        feature, not an afterthought. This page summarizes what it guarantees in plain language and
        links the authoritative, test-backed docs for each claim — no overstatement.
      </p>

      <Section
        id="security-secrets"
        title="Secrets are references, never values"
        more={{ href: '/docs/secrets.html', text: 'How secrets work' }}
      >
        <p>
          Your canonical config stores secret <strong>references</strong> like{' '}
          <code>{'${env:GITHUB_PAT}'}</code> or <code>{'${op:vault/item/field}'}</code> — never the
          resolved value. The reference is the only thing committed to git. mcpfold resolves the
          real value <strong>in memory</strong> at fold/launch time and injects it into the server
          process; it is never cached to a temp file.
        </p>
        <p>
          When mcpfold renders a client&apos;s config, it keeps the token off disk by rewriting the
          launch to go through <code>mcpfold run</code>, or by emitting the client&apos;s own secret
          indirection (for example VS Code&apos;s <code>{'${input:}'}</code>). The one way a
          resolved value is ever written to a file is the explicitly opt-in <code>inline</code>{' '}
          strategy — and even then only if the target file is <strong>gitignored</strong>; otherwise
          mcpfold refuses and warns. This is the honest boundary, not a blanket &ldquo;never touches
          disk&rdquo;.
        </p>
      </Section>

      <Section
        id="security-cloud"
        title="Nothing sensitive is synced to the cloud"
        more={{ href: '/docs/security.html', text: 'Read the documented audit' }}
      >
        <p>
          The optional cloud stores only your canonical config with secret references — never
          values. A push is checked three times: a client-side guard, a server-side ref-only guard,
          and a database <code>config_is_ref_only</code> constraint as the final backstop. A
          non-reference in a secret position is rejected before it can be uploaded.
        </p>
      </Section>

      <Section
        id="security-local"
        title="Local-first by default"
        more={{ href: '/pricing', text: 'What the cloud adds' }}
      >
        <p>
          <code>init</code>, <code>import</code>, <code>sync</code>, <code>diff</code>,{' '}
          <code>doctor</code>, <code>scan</code>, and <code>run</code> all work entirely offline
          with no account and no server. The cloud is opt-in and adds only cross-machine sync and
          team sharing — the entire CLI is free and MIT-licensed, and the cloud is self-hostable at
          no cost.
        </p>
      </Section>

      <Section
        id="security-redaction"
        title="Diagnostics are redacted; telemetry is off by default"
        more={{ href: '/docs/security.html', text: 'Redaction & telemetry details' }}
      >
        <p>
          All CLI output — <code>diff</code>, <code>doctor</code>, <code>--debug</code>, and the{' '}
          <code>diagnose</code> bug-report bundle — flows through a redactor that masks reference
          paths, registered secrets, and token-shaped strings; the bundle is proven leak-free by
          test.
        </p>
        <p>
          Telemetry collects <strong>nothing</strong> unless you explicitly set{' '}
          <code>MCPFOLD_TELEMETRY=1</code>. When enabled it sends only a small, fixed, allow-listed
          set of non-identifying fields (command name, CLI/Node version, OS, exit code, duration) —
          never config, paths, server names, or values. Both <code>DO_NOT_TRACK=1</code> and{' '}
          <code>MCPFOLD_TELEMETRY=0</code> disable it, and opt-out always wins.
        </p>
      </Section>

      <Section
        id="security-integrity"
        title="Supply-chain & integrity"
        more={{ href: '/docs/threat-model.html', text: 'Full threat model' }}
      >
        <p>
          <code>doctor</code> flags any unpinned <code>@latest</code> stdio server, and a declared{' '}
          <code>pin</code> rewrites <code>@latest</code> to a fixed version in the rendered client
          file, so a client launches a known version rather than a moving target.{' '}
          <code>mcpfold scan</code> is a security preflight that audits every detected client&apos;s
          on-disk config for the known 2025–26 MCP incident root causes (cleartext secrets, unpinned
          packages, vulnerable <code>mcp-remote</code> bridges).
        </p>
        <p>
          The honest caveat: a server&apos;s <code>command</code>/<code>args</code> are executable
          code, so a tampered config is a code-execution vector — pinning bounds the supply-chain
          risk, and trust-on-first-use plus signed synced config harden this further.
        </p>
      </Section>

      <Section
        id="security-verified"
        title="Verified, not just asserted"
        more={{ href: '/docs/security-posture.html', text: 'Claims → evidence ledger' }}
      >
        <p>
          The refs-only invariant is machine-verified on every relevant path: a leak harness injects
          a known sentinel and exercises <code>sync</code>/<code>run</code>/<code>diff</code>/
          <code>doctor</code>/<code>push</code> across every adapter and strategy, asserting the
          sentinel appears in zero artifacts (files, backups, temp dirs, stdout/stderr, push
          payloads). CI also runs gitleaks secret scanning and a production dependency audit on
          every push. A deliberately introduced leak fails the build.
        </p>
      </Section>

      <Section id="security-disclosure" title="Reporting a vulnerability">
        <p>
          Please report security issues <strong>privately</strong> — do not open a public issue. The
          preferred path is a{' '}
          <a
            href={`${REPO}/security/advisories/new`}
            data-testid="advisory-link"
            rel="noreferrer"
            target="_blank"
          >
            GitHub private security advisory
          </a>
          , or email <a href="mailto:Dan@DanPearson.net">Dan@DanPearson.net</a>. We aim to
          acknowledge within 3 business days and to ship a fix before any public disclosure,
          coordinating a timeline with you. Full policy:{' '}
          <a
            href={`${REPO}/blob/main/SECURITY.md`}
            data-testid="security-md-link"
            rel="noreferrer"
            target="_blank"
          >
            SECURITY.md
          </a>
          .
        </p>
      </Section>
    </Container>
  );
}
