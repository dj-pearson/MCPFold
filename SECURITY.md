# Security Policy

mcpfold manages MCP configuration that lives next to secrets, so we take reports seriously.

## Reporting a vulnerability

**Do not open a public issue for security problems.** Instead, report privately via one of:

- **GitHub private advisory** — the preferred path: open a draft advisory at
  <https://github.com/dj-pearson/MCPFold/security/advisories/new>.
- **Email** — security@mcpfold.com (or the maintainer address listed on the repository
  profile if that alias is not yet live).

Please include: affected version/commit, reproduction steps, and impact. We aim to
acknowledge within 3 business days and to ship a fix or mitigation before any public
disclosure, coordinating a timeline with you.

## Scope of particular interest

Because mcpfold's core guarantee is that **secret values never touch disk unless you
explicitly opt into the gitignored `inline` strategy**, we especially want to hear about:

- Any path where a resolved secret value is written to a non-gitignored file, a backup, a
  temp file, a log, stdout/stderr, or a sync/push payload (see the leak harness in
  `security/`).
- Redaction bypasses in `diff`/`doctor`/`--debug`/`diagnose` output.
- Adapter output that emits a raw token instead of the client's secret indirection.

## Supported versions

Until 1.0, security fixes land on the latest published minor. Pin a version and watch
releases for advisories.
