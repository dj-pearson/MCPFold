# Telemetry

mcpfold collects **nothing by default**. Everything on this page is strictly opt-in and designed
to be impossible to tie back to you.

## Opt in / out

```bash
export MCPFOLD_TELEMETRY=1     # opt in
```

It stays off unless you set that. And it is forced **off** — even if you opted in — by either of:

```bash
export DO_NOT_TRACK=1          # the cross-tool convention
export MCPFOLD_TELEMETRY=0
```

There is no network sink wired by default; a sink is injected, so mcpfold ships without a backend.

## What is collected

Two event shapes, each a **fixed allow-list** of non-identifying fields. Every event additionally
passes through the [secret redactor](./security.md) as a final guard.

### `command` event (S8.3)

| Field         | Example    | Notes                |
| ------------- | ---------- | -------------------- |
| `command`     | `"sync"`   | which subcommand ran |
| `cliVersion`  | `"0.3.1"`  |                      |
| `nodeVersion` | `"v20.x"`  |                      |
| `os`          | `"darwin"` | platform only        |
| `exitCode`    | `0`        |                      |
| `durationMs`  | `42`       |                      |

### `adoption` event (S11.5)

An aggregate signal so adapter/provider work is driven by data, not guesswork.

| Field              | Example              | Notes                                                               |
| ------------------ | -------------------- | ------------------------------------------------------------------- |
| `adapters`         | `["cursor","zed"]`   | **only** known client ids; anything else is dropped                 |
| `providerSchemes`  | `["env","op"]`       | **only** known schemes (`env`/`dotenv`/`infisical`/`keychain`/`op`) |
| `serverBucket`     | `"6-20"`             | coarse size bucket — never the exact count                          |
| `profileBucket`    | `"1-5"`              | coarse size bucket                                                  |
| `cliVersion`, `os` | `"0.3.1"`, `"linux"` |                                                                     |

**Never collected, in any event:** your config, file paths, URLs, server names, tags, environment
variable names/values, or any secret. Adapter ids and provider schemes are filtered to the known
enums, so a mistyped path or server name can never become a field value.

## Aggregation view (private)

Events roll up into a maintainer-only view answering **"which clients and providers matter"** —
counts of `adapters` and `providerSchemes` across events, and the distribution of size buckets.
Because every field is aggregate and there is no per-user identifier, session id, or IP retention,
there is nothing to tie events to a person or machine — the view is inherently per-population, not
per-user. It exists to prioritize the [adapter coverage roadmap](./adapters.md).
