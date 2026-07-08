# Security

mcpfold handles secrets-adjacent configuration, so its security posture is a feature, not an
afterthought. This page is the documented audit (S8.3): what we guarantee, how it is enforced
in code and CI, and the threat model for the surfaces that execute code or touch the network.

To report a vulnerability privately, see `SECURITY.md` at the repo root — please do not open a
public issue for security reports.

## The core promise: secret **values** never touch disk or logs

mcpfold's canonical config stores secret **references** (`${scheme:path}`) only — never resolved
values. Resolution happens in memory at fold/launch time. See [Secrets](secrets.md) for the model.

Audit — every path that could expose a value, and the control that prevents it:

| Surface                                  | Risk                                              | Control                                                                                                                                                                                                                                                      |
| ---------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rendered client files (`sync`)           | a token written to a client config                | Per-adapter strategies (S4.6): `shim` rewrites the launch to `mcpfold run <name>`; `native-input` emits the client's own indirection (VS Code `${input:}`); `inline` resolves a value **only** if the target is gitignored, else refuses — and warns loudly. |
| Backups (`*.mcpfold.bak.*`)              | a prior inlined secret copied into a backup       | Backups are gitignored and `chmod 0600` on POSIX (S9.3).                                                                                                                                                                                                     |
| CLI output (`diff`, `doctor`, `--debug`) | a value or ref path echoed to a terminal / CI log | All output flows through the redactor (S0.6 / S9.3): ref paths, registered sentinels, and token-shaped strings are masked.                                                                                                                                   |
| Diagnostics (`mcpfold diagnose`)         | a bug-report bundle leaking a value or ref path   | The bundle is scrubbed and proven leak-free by test (S0.6).                                                                                                                                                                                                  |
| Cloud sync (`push`)                      | a resolved secret uploaded to the server          | The client push guard and the server-side ref-only guard both reject any non-reference in a secret position; the DB `config_is_ref_only` CHECK is the final backstop (S6.4 / S9.1).                                                                          |
| Resolution itself                        | a value cached to a temp file                     | Resolution is memory-only; no value is ever written to a cache or temp file (S9.1).                                                                                                                                                                          |

This invariant is not merely asserted — it is **machine-verified on every relevant path** by the
suite-wide leak harness (S9.1): a known sentinel is injected via a fake provider, `sync`/`run`/
`diff`/`doctor`/`push` are exercised across all six adapters and every strategy, and the harness
asserts the sentinel appears in **zero** artifacts (files, backups, temp dirs, stdout/stderr, push
payloads) except a legitimately-gitignored `inline` target. A deliberately introduced leak fails
the build.

## Supply-chain hygiene: pin `@latest`

An unpinned `@latest` stdio server runs whatever code the registry serves at launch — the
April-2026 unpinned-stdio RCE lesson. mcpfold addresses this two ways:

- **`doctor` flags** any unpinned `@latest` stdio server and tells you to add a `pin`.
- **Pin at fold time**: when a server declares `"pin": "1.4.2"`, `sync` rewrites `@latest` to the
  pinned version in the rendered client file, so the client launches a fixed version — not a
  moving target. The shim launch path applies the same rewrite.

## Telemetry: off by default, opt-in only

mcpfold collects **nothing** unless you explicitly set `MCPFOLD_TELEMETRY=1`. When enabled, the
payload is a small, fixed, allow-listed set of non-identifying fields — the command name, the CLI
and Node versions, the OS, the exit code, and the duration. It never includes config, file paths,
server names, URLs, or secret values, and it is passed through the redactor as a final guard.

Opt-out is honored over any opt-in: both `DO_NOT_TRACK=1` (the cross-tool convention) and
`MCPFOLD_TELEMETRY=0` disable telemetry. There is no network sink wired by default.

## Enforced in CI

The [Security workflow](../.github/workflows/security.yml) runs on every push and PR:

- **Secret scanning** — gitleaks scans the working tree; a committed credential fails the build.
  Intentional test fixtures, leak-harness sentinels, and `${scheme:path}` references are
  allow-listed in `.gitleaks.toml`.
- **Dependency audit** — `pnpm audit --prod --audit-level=high` fails on any high/critical advisory
  in shipped (production) dependencies.

The main [CI](ci.md) pipeline additionally runs the leak harness and the full test suite on the
Windows/macOS/Linux matrix.

## Threat model

### Shim launcher (`mcpfold run <name>`)

The shim resolves a server's secret refs and execs the real server, keeping tokens off disk.

- **Config is executable code.** `run` execs `command`/`args` from the canonical config. A malicious
  or tampered config is a code-execution vector. Trust-on-first-use for new/changed commands and
  version-integrity signing on synced config are addressed in S9.2; pinning (above) bounds the
  supply-chain risk of `@latest`.
- **Secret exposure.** Resolved values are injected into the child's environment/headers in memory
  and never logged; a resolution failure fails closed with a coded error that never prints the
  value.
- **Signal handling.** SIGINT/SIGTERM are forwarded to the child so the shim adds no lifecycle gap.

### Curation proxy

The optional proxy trims `tools/list` to an allow/deny set. It is a faithful JSON-RPC passthrough
(ids, notifications, errors preserved) and is **off by default** — it only sits in the launch path
when a server declares a `tools` directive. It transforms only the tool list; it never inspects or
rewrites secret material.

### Sync channel (`login` / `push` / `pull`)

- **Transport + auth.** All cloud endpoints require a short-lived JWT and are scoped by row-level
  security (S6.2/S6.3); a cross-tenant read returns not-found. Session and device-code hardening
  (short-lived rotated tokens, revocation) is addressed in S9.5.
- **No values synced.** `push` uploads references only; the client guard, server guard, and DB CHECK
  are three independent layers rejecting a raw secret (S6.4 / S9.1).
- **At-rest.** Because only references are stored, a database compromise exposes config metadata
  (server names, URLs, ref paths) — never secret values. Self-hosted volume encryption, encrypted
  backups, and TLS/HSTS are covered in [At-rest hardening](security-at-rest.md).
