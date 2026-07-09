# Security posture — claims backed by tests

Most security pages are prose. This one is a ledger: every property mcpfold claims is paired with
the **mechanism** that enforces it and a **link to the test, CI job, or policy that proves it** —
so each claim is one click from the code. The list is CI-guarded: the docs build fails if any
evidence link rots (`docs:build`), and [`scripts/check-evidence-links.mjs`](../scripts/check-evidence-links.mjs)
fails if any claim below lacks a resolvable evidence link.

The one promise everything else serves: **secret _values_ never touch disk or logs — only
references (`${scheme:path}`) are stored, and values are resolved in memory at launch.**

## Claims → evidence

| Property                                             | How it is enforced                                                                                             | Evidence                                                            |
| ---------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Sync uploads references, never secret values         | Client push guard **and** server-side ref-only guard both reject any non-reference in a secret position        | [cloud.test.ts](../packages/cli/test/cloud.test.ts)                 |
| A secret value reaches **zero** artifacts            | A sentinel injected via a fake provider is asserted absent from every file, backup, temp dir, stdout, and push | [leak.test.ts](../security/leak.test.ts)                            |
| Tool denial is enforced at the **call**, not hidden  | The proxy refuses a `tools/call` to a curated-out tool before it reaches the server — not just list-filtering  | [filter.test.ts](../packages/proxy/test/filter.test.ts)             |
| Tool **definitions** are pinned, not just names      | A server whose tool surface drifts from the trusted digest is flagged (warn) or blocked (strict)               | [tool-pinning.test.ts](../packages/proxy/test/tool-pinning.test.ts) |
| Launch commands are trust-on-first-use               | A new or changed launch command refuses to run until explicitly approved (TOFU)                                | [trust.test.ts](../packages/cli/test/trust.test.ts)                 |
| Synced config versions are signed and tamper-evident | A present-but-invalid signature is a hard reject; an unverifiable version needs an explicit opt-in to apply    | [cloud.test.ts](../packages/cli/test/cloud.test.ts)                 |
| CLI output is redacted                               | Ref paths, registered sentinels, and token-shaped strings are masked across `diff` / `doctor` / `--debug`      | [redact.test.ts](../packages/cli/test/redact.test.ts)               |
| Telemetry is off by default and redacted             | Nothing is sent unless opted in; the fixed allow-listed payload is passed through the redactor                 | [telemetry.test.ts](../packages/cli/test/telemetry.test.ts)         |
| Windows credentials are encrypted at rest            | The cloud session is stored via built-in DPAPI (user-scoped), never plaintext and with no third-party module   | [token-store.test.ts](../packages/cli/test/token-store.test.ts)     |
| Resolved auth is never on a command line             | For `mcp-remote` bridges the token travels via an env placeholder, so argv holds no secret value               | [run.test.ts](../packages/cli/test/run.test.ts)                     |
| The tool-call audit log is redacted by construction  | Audit events record argument **shapes** (key → type), never values, so no secret can reach the log             | [audit.test.ts](../packages/proxy/test/audit.test.ts)               |
| A timed-out provider child is terminated             | The resolver's timeout kills the spawned provider process instead of orphaning it with held locks              | [exec.test.ts](../packages/secrets/test/exec.test.ts)               |
| Committed secrets and vulnerable deps fail CI        | gitleaks scans every push/PR; `pnpm audit` fails on any high/critical advisory in shipped deps                 | [security.yml](../.github/workflows/security.yml)                   |

## Boundaries — what mcpfold does **not** defend against

Provable claims are only credible next to honest limits. These are sourced from the
[threat model](threat-model.md), which is the authoritative, all-surfaces view.

- **Malicious server _code_.** `mcpfold run` executes a server's `command`/`args`; a trusted-but-hostile
  server package can do anything your user account can. Pinning bounds the supply-chain risk of
  `@latest`, TOFU catches launch-command changes, and tool curation limits the exposed surface — but
  none of these sandbox the server process.
- **A compromised machine or user account.** DPAPI / OS-keychain secrets are readable by processes
  running as you. mcpfold protects secrets at rest and in transit, not against malware already
  executing under your identity.
- **A running server's own network behavior.** mcpfold curates the tool surface and can audit calls,
  but it does not proxy or inspect the server's outbound traffic or prevent a permitted tool from
  exfiltrating data it legitimately receives.
- **Provider backend security.** mcpfold resolves `${infisical:…}` / `${op:…}` references; the auth,
  access control, and availability of those backends are out of scope.
- **Client application security after a native fold.** When a value is folded into a client's own
  indirection (`native-input`) or a gitignored `inline` target, the client owns it from there.

## Where this is published

This page renders in the [docs site](https://mcpfold.com/docs/security-posture.html) and complements
the narrative [Security](security.md) page. The marketing security page (S13.13) links here rather
than duplicating the claims, so the evidence table stays single-sourced.
