# Threat model

The attack surfaces of mcpfold and the controls on each. This is the consolidated view; see
[Security](security.md) for the secret-handling audit and [At-rest hardening](security-at-rest.md)
for the self-hosted storage/transport controls.

## Shim launcher (`mcpfold run`)

`mcpfold run <name>` execs `command`/`args` from the config and injects resolved secrets — a
code-execution and secret-handling surface.

- **Config is executable code.** Trust-on-first-use gates every launch: a new or changed
  `command`/`args`/`pin` must be explicitly approved (`mcpfold trust`) before it can run (S9.2).
- **Supply chain.** `pin` rewrites `@latest` to a fixed version at fold time; an optional SRI
  `integrity` hash flags a package whose bytes changed (S8.3/S9.2).
- **Secret exposure.** Values are injected into the child's env/headers in memory and never
  logged; resolution fails closed with a coded, non-leaking error (S0.9/S9.1).

## Curation proxy

The optional proxy trims `tools/list` (and the stateless-core `server/discover`) to an allow/deny
set. It is a faithful JSON-RPC passthrough (ids/notifications/errors/`_meta` preserved), **off by
default**, and only sits in the launch path when a server declares a `tools` directive. It
transforms only the tool list — never secret material.

## Tool-definition pinning (rug-pull defense)

Tool poisoning / rug pulls are OWASP **MCP03:2025**: malicious instructions ride in tools/list
**descriptions** and enter the model's context before any tool is called, and a server that shipped
many clean versions can mutate its definitions after you trust it (e.g. `postmark-mcp` shipped a
backdoor in v1.0.16). Our config-as-code TOFU (S9.2) pins only the launch _command_; this extends
it to the _tool surface_.

- **What is pinned.** `mcpfold trust <server> --tools` probes the live server once and records an
  order-insensitive, whitespace-stable digest of every tool's `name` + `description` + input-schema
  alongside the launch-command signature, in the per-machine trust store (never synced).
- **Where it's enforced.** For **proxied** stdio servers, the proxy compares the live tool surface
  against the pinned one on every `tools/list` / `server/discover` and **warns by default** or
  **blocks** (`--strict-tools`), replacing the drifted listing with an error so nothing new reaches
  the model. For **non-proxied** servers, `mcpfold test` performs the same comparison and exits
  nonzero on drift. Either way the user sees a reviewable diff (added / removed / description- or
  schema-changed tools) and re-approves with `mcpfold trust <server> --tools`.
- **Boundaries.** This detects _silent_ drift from a trusted baseline; it does not judge whether the
  first-seen definitions are themselves benign (that is the user's trust decision, as with SSH host
  keys). Drift measured on the full surface even when curation would hide a tool from the client.
  The digest is content-based, so a server that changes behavior without changing its advertised
  definitions is out of scope. This is the ETDI / SEP-1766 direction, shipped ahead of the spec.

## Sync channel (`login` / `push` / `pull` + edge)

- **Transport + auth.** All cloud endpoints require a short-lived JWT and are row-level-security
  scoped (S6.2/S6.3); a cross-tenant read returns not-found. The side service enforces the same
  contract (S6.5).
- **No values synced.** `push` uploads references only; the client guard, server guard, and DB
  CHECK are three independent layers rejecting a raw secret (S6.4/S9.1).
- **Integrity.** Each pushed version is HMAC-signed; `pull` rejects a tampered (bad-signature)
  version and warns on unsigned (S9.2).
- **Sessions.** Access tokens are short-lived; device-code hardening + per-machine revocation are
  addressed in S9.5.

## Web console (`mcpfold.com`)

- **Response headers (S9.6).** Every response carries a strict `Content-Security-Policy`
  (`default-src 'self'`, no inline scripts, `frame-ancestors 'none'`), HSTS, `X-Content-Type-Options`,
  `X-Frame-Options: DENY`, `Referrer-Policy`, and a restrictive `Permissions-Policy` — declared in
  `apps/web/public/_headers` and drift-tested. TLS terminates at the Cloudflare/Coolify edge.
- **CSRF.** The SPA authenticates with a Bearer access token in the `Authorization` header, not an
  ambient cookie, and the API requires that header — so a cross-site request can't ride a session.
  Classic CSRF does not apply; clickjacking is blocked by the frame protections above.
- **Invite / share tokens (S9.6).** Team invites are 256-bit, single-use (server-marked on
  redemption), and expiring; member removal revokes access immediately (S7.6).
- **XSS.** React escapes by default; the CSP forbids inline/remote scripts as defense in depth.

## At-rest (self-hosted)

Because only references are stored, a DB or backup compromise exposes config metadata (server
names, URLs, ref paths) — never secret values. Volume encryption, encrypted+tested backups, and
enforced TLS are covered in [At-rest hardening](security-at-rest.md).

## Supply-chain / CI gate

Every push runs the [Security workflow](../.github/workflows/security.yml): gitleaks (a committed
secret fails the build) and `pnpm audit --prod --audit-level=high` (a high/critical advisory in a
shipped dependency — including the web app's — fails the build). The suite-wide leak harness (S9.1)
proves no resolved secret reaches any rendered file, backup, log, or push payload.
