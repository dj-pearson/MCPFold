# Adapter compatibility harness (S14.2)

Adapters are pinned to committed fixtures. If a client changes its on-disk config format upstream,
mcpfold could silently produce a file the client no longer accepts. This harness compares each
adapter's rendered **shape** (root keys + server-entry keys) against a captured sample of the
client's accepted format and flags divergence in CI before it reaches users.

- `check.ts` — the pure comparison (`shapeOf`, `checkAdapter`, `runCompatCheck`).
- `samples/<client>.json` — the captured accepted-format signature per client.
- `run.ts` — renders every adapter's canonical fixture and checks it against the samples; exits
  nonzero on divergence. `--capture` (re)writes the samples.
- [`../../../.github/workflows/adapter-compat.yml`](../../../.github/workflows/adapter-compat.yml)
  runs it weekly and opens/updates a tracking issue on divergence. A missing/unreachable `url`
  format source **skips** (never a false failure).

## Refreshing a sample

When a client legitimately changes its format, update the sample (and then the adapter until the
harness is green again):

```bash
# after confirming the new upstream format, recapture from the current adapter output:
npx tsx packages/adapters/compat/run.ts --capture
# then run the check:
npx tsx packages/adapters/compat/run.ts
```

For a client that publishes a machine-readable schema, set `source: { type: "url", url: "…" }` in
its sample; the harness pulls the live shape and compares against it (skipping if the source is
down). Otherwise `source.type` is `"captured"` — a versioned snapshot refreshed by hand here.
