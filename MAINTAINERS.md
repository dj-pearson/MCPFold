# Maintainers

This file lists the people who review and merge changes to mcpfold, and the areas
they own. It pairs with [CODEOWNERS](./CODEOWNERS) (which drives automatic review
requests) and the process in [GOVERNANCE.md](./GOVERNANCE.md).

## Lead maintainer

| Name        | GitHub                                          | Areas                   |
| ----------- | ----------------------------------------------- | ----------------------- |
| Dan Pearson | [@dj-pearson](https://github.com/dj-pearson)    | Everything (default owner) |

## Area maintainers

_None yet._ As contributors take ownership of specific areas, they'll be added here
and to the matching CODEOWNERS entry. Candidate areas that map cleanly to a
maintainer role:

- **Client adapters** — `packages/adapters/` (per-client format quirks)
- **Secret providers** — `packages/secrets/`
- **Core engine** — `packages/core/` (purity- and determinism-critical)
- **CLI / DX** — `packages/cli/`
- **Docs & site** — `docs/`, `apps/site/`

See [GOVERNANCE.md § Becoming a maintainer](./GOVERNANCE.md#becoming-a-maintainer)
for how this list grows.

## Emeritus

_None yet._ Maintainers who step back are moved here with thanks; they keep the
credit without the review obligation.
