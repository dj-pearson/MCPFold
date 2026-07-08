## What & why

<!-- What does this change and why? Link any issue. -->

## Type

- [ ] New client adapter
- [ ] New secret provider
- [ ] `doctor` check
- [ ] Bug fix
- [ ] Docs / chore

## Checklist

- [ ] `pnpm verify_all` passes (lint + typecheck + test + build).
- [ ] Tests added/updated; adapter changes include golden fixtures.
- [ ] Core purity respected (no `node:fs`/`node:os`/net/process imports in `packages/core`).
- [ ] No secret **values** committed or written to non-gitignored files; leak harness green.
- [ ] Added a changeset (`pnpm changeset`) if this is a user-facing change.
- [ ] For a new adapter: added the id to `CLIENT_IDS` and registered it in `all.ts`.
