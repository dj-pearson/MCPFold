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
