# Offline / degraded-mode contract (S0.9)

mcpfold resolves secrets and (later) syncs to the cloud, so it must define exactly what
happens when a provider is down, the network is gone, or a call hangs. This contract is
fixed **before** providers depend on the resolver interface, because it shapes that
interface.

## Fail closed

Secret resolution is **fail closed**: if any `${scheme:path}` reference cannot be resolved
— missing provider, missing value, provider error, or timeout — the entire operation
aborts. **A blank or partial secret is never injected**, and no client file is written
with a half-resolved config. The error is a `SecretResolutionError` (code
`SECRET_RESOLUTION`) that names the provider and the reference, and the CLI exits with
code **2** (`ERROR`).

## Timeouts

Each provider call has a timeout (default **10s**, `DEFAULT_TIMEOUT_MS`; overridable
globally via `ResolveOptions.timeoutMs` or per-provider via `SecretProvider.timeoutMs`).
When it elapses the call is aborted via an `AbortSignal` and the resolution fails closed
with a "timed out after Nms" message — a hung provider never blocks indefinitely.

## What works fully offline

Operations that need no secrets and no network keep working with zero connectivity,
because they never call the resolver:

- `mcpfold doctor` — structural + reference-grammar checks.
- `mcpfold diff` — compares **reference-only** rendered config against on-disk files.
- `mcpfold sync` and `sync --check` at the current stage — rendered files carry secret
  **references**, not values (value injection via the shim is E4/S4.7).
- config validation / `init` / `import`.

## Cloud commands

`login` / `push` / `pull` (E6) must degrade to a clear **"offline"** error when the
backend is unreachable — never a silent no-op. (Stubbed until E6.)

## Interface consequence

`SecretProvider.resolve(path, { signal })` takes an `AbortSignal` from the start so the
timeout/fail-closed contract is enforceable without a later breaking change.
