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
[2026-07-07] fix(ci) — CI run #1 failed: `pnpm -r test --coverage` needs @vitest/coverage-v8 (local `pnpm test` omitted --coverage so it passed). Added @vitest/coverage-v8 devDep; exact CI command now green (95.94% core coverage).
[2026-07-07] S0.8 done — Deterministic output: core serialize.ts (sorted keys, preserved array order, 2-space, trailing \n; shuffle-invariant + property test) + check.ts drift engine (checkRendered/hasDrift). CLI runSyncCheck (sync --check → EXIT.DIFF on drift). Invariant documented (docs/cli-contract.md, AGENT_NOTES).
[2026-07-07] S0.6 done — Error hierarchy + redaction: core errors.ts (McpfoldError codes; UnknownProfileError refactored into it). CLI util/redact.ts (Redactor: ref-path + sentinel scrubbing; redactConfig), util/debug.ts (--debug/MCPFOLD_DEBUG, redacted, stderr), commands/diagnose.ts (leak-free bundle). Proven leak-free by test.
[2026-07-07] S0.10 done — Stable --json + exit codes: created packages/cli (mcpfold/mcpf bin, commander). output/exit-codes.ts (0/1/2), envelope.ts (versioned {ok,command,data,warnings,errors}), render.ts (human/JSON paths separated). Conformance + inline-snapshot tests. docs/cli-contract.md.
[2026-07-07] note — packages/cli created here (hosts S0.6/S0.8/S0.10 CLI contracts); S3.1 builds the fuller command surface on it. Cross-pkg @mcpfold/core resolved via tsconfig paths (typecheck) + vitest alias (test) so CI's test-before-build order works; build stays topological on dist. E2E-caught bug: commander routes --json to root even after subcommand → merge with || not ??.
[2026-07-08] S2.1 done — Adapter framework (packages/adapters): ClientAdapter/RenderedFile/SecretStrategy types, registry (register/get/require/list/clear), shared mcpServers helpers (toMcpEntry/toMcpServersShape/fromMcpServersShape + createMcpServersAdapter factory), cross-platform paths.ts (expandHome/userConfigDir/joinFor, win32/darwin/linux, injectable OsContext). 17 tests.
[2026-07-08] S2.2-S2.7 done — Six client adapters: cursor (mcpServers, shim), claude-desktop (user-only, needsRestart), claude-code (+type field), vscode (root `servers` + ${input:} native-input secrets — trap regression test), windsurf (mcp-remote wrapper for authed remotes, reversible parse), zed (root context_servers). Per-OS resolvePath tested; golden file-snapshots committed. registerAll() wires all six.
[2026-07-08] S2.8 done — Cross-adapter matrix harness: single canonical.jsonc folded through all six adapters → committed goldens (fixtures/matrix/*), render→parse round-trip invariant per adapter. Update goldens via `pnpm --filter @mcpfold/adapters test -u` (never -u in CI).
[2026-07-08] S1.6 done — Drift-diff engine (core/diff.ts): diffRendered(expected, actualContents|undefined, parser) → structured ConfigDiff (added/changed/unmanaged + field changes), semantic (key-order/whitespace-insensitive via serialize), fileMissing distinct, pure. Adapter-agnostic via minimal ParseCapable interface (no circular dep). 5 tests.
[2026-07-08] S3.1 done — CLI skeleton (cli.ts): commander framework, global flags --profile/--cwd/--dry-run/--json/--debug (merged before/after subcommand), --version, help lists init/import/add/sync/diff/doctor/secret/run + stubbed login/push/pull, unknown cmd → exit 2 (exitOverride). mcpf alias via bin map. Output routed through injectable writer.
[2026-07-08] S3.5 done — sync (commands/sync.ts + io/atomic-write.ts + io/backup.ts): resolve profiles → adapter.render → timestamped backup → atomic write (temp+rename, cleanup on fail). --profile, --dry-run (preview via S1.6), --check (CI gate exit 1), idempotent unchanged detection, restart hints. Injectable OsContext/clock. 6 tmp-dir integration tests + e2e-driven built binary.
[2026-07-08] S3.6 done — diff (commands/diff.ts): per-client added/changed/unmanaged + missing-file, --json structured, exit 1 on drift / 0 clean. 3 tmp-dir tests. E2E verified: diff(missing)→sync→diff(clean) with cursor mcpServers + vscode servers/inputs.
[2026-07-08] S3.2 done — init (commands/init.ts): scaffolds commented mcp.config.jsonc with $schema line + sample server/profile (validates itself), detects installed clients via adapter resolvePath existence (util/detect-clients.ts rewritten to use ALL_ADAPTERS), refuses overwrite without --force, --dry-run. Added optional `$schema` key to ConfigSchema (core). 6 tests.
[2026-07-08] S3.7 done — doctor (commands/doctor.ts + checks/*.ts): pathed config-validity errors, unpinned @latest (warn+pin fix), hardcoded secrets in env/headers (error+${env:} fix), unknown secret schemes (warn), VS Code mcpServers-vs-servers on-disk trap (error). Each finding {severity,file,where,message,fix}. Exit 2 on error-severity, --json. 6 tests.
[2026-07-08] S3.3 done — import (commands/import.ts): scans detected clients, adapter.parse → merge (dedupe by transport+command/url signature, union tags), per-client profiles, conflicts reported (not silently merged), hardcoded secrets rewritten to ${env:...} placeholders (not copied). --dry-run/--force. 5 tests. E2E: init→import(secret rewritten, no leak)→doctor.
