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

The optional proxy trims `tools/list` to an allow/deny set. It is a faithful JSON-RPC passthrough
(ids/notifications/errors preserved), **off by default**, and only sits in the launch path when a
server declares a `tools` directive. It transforms only the tool list — never secret material.

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
