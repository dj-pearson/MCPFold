# Contributing to mcpfold

Thanks for helping build a portable, secret-safe MCP config layer. New client adapters,
secret providers, and `doctor` checks are especially welcome.

## Setup

Requires **Node 20+** and **pnpm 10+** (`corepack enable`).

```bash
pnpm install
pnpm verify_all   # lint + typecheck + test + build — the full gate CI runs
```

## Ground rules

- **Core purity.** `packages/core` must not import `node:fs`/`node:os`/`node:path` or any
  network/process library. All I/O flows through injected `ClientAdapter` / `SecretProvider`.
  Enforced by ESLint + `scripts/check-core-purity.mjs`.
- **Every change ships tests.** Adapters use fixture snapshots; the full suite must be green
  on the CI matrix (ubuntu/macOS/windows) before merge.
- **No secret values on disk.** Config carries `${scheme:path}` references, never values.
  The suite-wide leak harness (`security/`) must stay green.
- **Conventional Commits**, one logical change per PR. Add a changeset (`pnpm changeset`)
  describing user-facing changes and which packages bump.
- **Determinism.** Rendered output is byte-stable: render through `serialize()` from
  `@mcpfold/core` (sorted keys, `\n` endings, trailing newline).

## Adding a new client adapter (the one-PR on-ramp)

1. `pnpm --filter mcpfold build && node packages/cli/dist/bin.js scaffold-adapter <client>`
   (or `pnpm mcpfold scaffold-adapter <client>` once installed) generates the adapter module
   - test + fixture skeleton.
2. Add the client id to `CLIENT_IDS` in `packages/core/src/schema.ts` and register the
   adapter in `packages/adapters/src/all.ts` (the scaffold prints this checklist).
3. Fill in `resolvePath` (per-OS!), `render`, and `parse`. See
   [docs/adapters.md](./docs/adapters.md).
4. `pnpm --filter @mcpfold/adapters test -u` to write the golden fixture, review it, commit.

## Reporting security issues

See [SECURITY.md](./SECURITY.md) — please use the private disclosure path.
