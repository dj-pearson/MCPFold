# PROGRESS — mcpfold build log

Append-only. One entry per story state change, newest at the bottom. A fresh loop reads
the tail of this file plus `prd.json` (story `status` fields) to pick the next eligible
story. **Never edit past entries** — only append.

Entry format:

```
[<ISO date>] <id> <status> — <one-line summary> (commit <sha>) [follow-ups: …]
```

Statuses: `todo` → `in_progress` → `done` (or `blocked`).

---

[2026-07-07] S0.1 done — pnpm monorepo scaffold: tsconfig.base (strict + noUncheckedIndexedAccess), eslint w/ core-purity no-restricted-imports, prettier, vitest workspace, packages/core smoke test. verify_all green.
[2026-07-07] S0.2 done — GitHub Actions CI: ubuntu/macos/windows × node 20 matrix (install/lint/typecheck/test+coverage/build) + dedicated core-purity + format:check job. Branch-protection docs in docs/ci.md.
[2026-07-07] S0.3 done — Ralph loop harness: ralph/PROMPT.md (iteration_steps + global DoD), PROGRESS.md (this file), AGENT_NOTES.md (path/fixture/secret/determinism decisions). Loop can identify next story from files alone.
[2026-07-07] S1.1 done — Zod canonical schema (schema.ts): Server/Profile/Config, transport↔command/url refine, path-required refine, strict unknown-key rejection, SecretRef regex. Types inferred in types.ts. 13 tests.
[2026-07-07] S1.2 done — JSONC loader (load.ts): loadConfig returns discriminated result with positioned (line/col) parse + pathed schema errors and fix hints; loadConfigOrThrow convenience. Spec §4 example (w/ comments) loads. 8 tests.
[2026-07-07] S1.3 done — Secret-ref grammar (secret-ref.ts): parseSecretRef (whole-string), findSecretRefsInString (embedded), findSecretRefs(server) over auth.token/headers/env; unknown scheme → known:false (no crash). Pure. 9 tests.
[2026-07-07] S1.4 done — Resolution engine (resolve.ts): resolveProfile/resolveAll (tag-intersection fold, stable sort), resolveProfileWithDiagnostics (unmatched tags, empty), UnknownProfileError. Secrets stay as refs. ResolvedServer exported. 8 tests.
