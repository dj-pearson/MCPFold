# Project Governance

mcpfold is open source (MIT) and welcomes contributions. This document describes
how decisions get made and how code reaches `main` so the process is predictable
for everyone.

## Roles

- **Lead maintainer** — [Dan Pearson (@dj-pearson)](https://github.com/dj-pearson).
  Holds final say on direction, owns releases, and administers the repository.
  Set as the default owner in [CODEOWNERS](./CODEOWNERS).
- **Maintainers** — trusted contributors with review/merge rights over specific
  areas. Listed in [MAINTAINERS.md](./MAINTAINERS.md). There are none yet beyond
  the lead; the path to becoming one is below.
- **Contributors** — anyone who opens an issue or PR. No permissions required;
  the fork → PR flow in [CONTRIBUTING.md](./CONTRIBUTING.md) works for everyone.

## How changes land

Every change to `main` — including from the lead maintainer — is expected to go
through a pull request that:

1. Passes the full CI gate (`pnpm verify_all`: lint + typecheck + test + build on
   the ubuntu/macOS/windows matrix).
2. Receives approval from a Code Owner for the touched paths (see CODEOWNERS).
3. Includes a [Changeset](https://github.com/changesets/changesets) for any
   user-facing change.

The lead maintainer retains a direct-push fast-lane for release chores, hotfixes,
and trivial docs edits — but PRs are the norm, and anything touching `packages/core`,
`security/`, or `packages/secrets/` always goes through review because of the
secret-safety guarantees.

## Decision making

- **Day-to-day** (bug fixes, adapters, docs): decided in the PR by the reviewing
  Code Owner. Lazy consensus — if no maintainer objects within a reasonable window,
  a passing, reviewed PR merges.
- **Significant changes** (new public API, breaking changes, security-model shifts,
  new dependencies in `core`): open an issue or Discussion first to gather input.
  The lead maintainer makes the final call if consensus doesn't emerge.
- **Security**: handled privately per [SECURITY.md](./SECURITY.md), never in public
  issues.

## Becoming a maintainer

There's no application form. Maintainership is offered to contributors who have
shown, over several merged PRs, that they:

- Ship well-tested changes that respect **core purity** and the **no-secret-values-on-disk**
  invariant.
- Give thoughtful reviews and help triage issues.
- Communicate constructively and follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

The lead maintainer extends the invitation and adds the person to
[MAINTAINERS.md](./MAINTAINERS.md) and the relevant CODEOWNERS entries, scoped to
the area they know best (e.g. a specific adapter family).

## Releases

Releases are cut from `main` via Changesets and the release workflow. Only the lead
maintainer publishes to the registry. See the release workflow in
[`.github/workflows/release.yml`](./.github/workflows/release.yml).

## Changing this document

Governance changes are proposed by PR and require lead-maintainer approval.
