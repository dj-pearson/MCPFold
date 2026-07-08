# Governance & maintainership

How mcpfold is maintained, how decisions get made, and how releases happen. Kept deliberately
lightweight for an early-stage MIT project.

## Licensing

- **MIT:** the CLI, `@mcpfold/*` packages, and the self-hostable cloud (schema + edge service).
- **Commercial:** the hosted mcpfold.com service and its Team/Enterprise features. See the
  [pricing model](./pricing-model.md#licensing-boundaries).

## Decisions

- **Small changes** (bug fixes, a new adapter, docs) — a PR + one maintainer review.
- **Notable changes** (config format, CLI contract, security posture) — open an issue first to
  discuss; these touch the [CLI contract](./cli-contract.md) and [security](./security.md) invariants
  and must preserve them (stable `--json` envelope, exit codes, no secret values on disk).
- **Prioritization** is data-informed: the [opt-in adoption signal](./telemetry.md), open requests,
  and the [roadmap](./roadmap.md).

## Contributing an adapter

Adding a client is the highest-leverage first contribution and is meant to be a one-PR job — see
[Adapter coverage](./coverage.md#add-a-client) and `mcpfold scaffold-adapter`. Every adapter must
pass the shared determinism + cross-adapter round-trip invariants.

## Releases

- Versioning is [semver](https://semver.org); releases are cut with **Changesets**. Every publishable
  package ships a changeset; merging the "Version Packages" PR publishes to npm with provenance and
  builds the standalone binaries.
- The [CLI contract](./cli-contract.md) (stable JSON envelope + exit codes) is a compatibility
  promise across minor versions.

## Funding

mcpfold is funded by the paid cloud and by [sponsorship](../.github/FUNDING.yml)
(GitHub Sponsors / Open Collective). Sponsoring supports the free, MIT core.
