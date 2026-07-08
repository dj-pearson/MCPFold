# mcpfold CLI contract

This contract is **stable and versioned**. Scripts and CI pipelines may depend on it;
changes are additive and announced. Every command (current and future) conforms.

## Exit codes (S0.10)

| Code | Name      | Meaning                                                         |
| ---- | --------- | --------------------------------------------------------------- |
| `0`  | `SUCCESS` | Clean success — no actionable difference.                       |
| `1`  | `DIFF`    | An actionable difference (drift from `diff` / `sync --check`).  |
| `2`  | `ERROR`   | An error or misuse (bad config, unknown profile, invalid flag). |

`sync --check` exits `1` when any client file drifts or is missing, writing nothing —
so `mcpfold sync --check` is a CI gate for "is everything synced?".

## `--json` envelope (S0.10)

Every command accepts `--json` and then prints exactly **one** envelope to stdout:

```jsonc
{
  "envelopeVersion": 1, // bumped only on breaking envelope changes
  "ok": true, // false on error
  "command": "diagnose", // the command that ran
  "data": {/* command-specific payload */},
  "warnings": ["…"], // non-fatal notes
  "errors": [
    // present (non-empty) only when ok=false
    { "code": "DRIFT", "message": "…", "hint": "…" },
  ],
}
```

- The envelope shape is snapshot-guarded in `packages/cli/test/contract.test.ts`; an
  accidental shape change fails CI.
- **Human and machine paths are separate.** Human output never appears on the `--json`
  path and vice-versa, so reformatting human text can never break a script.
- In `--json` mode, stdout carries only the envelope; diagnostic/debug lines go to stderr.

## Global flags

- `--json` — machine-readable output (above).
- `--debug` (or `MCPFOLD_DEBUG=1`) — verbose logging to **stderr**, always redacted
  (no secret value or ref path can appear; see [redaction](#redaction-s06-enforced-again-at-s93)).
- `-v, --version`, `-h, --help` — standard.

## Redaction (S0.6, enforced again at S9.3)

Nothing that leaves the machine may contain a secret **value** or a provider ref
**path**. Secret references keep their scheme but lose their path
(`${infisical:dev/mcp/GITHUB_PAT}` → `${infisical:***}`); registered secret values are
scrubbed verbatim everywhere. `mcpfold diagnose` emits a bundle that is provably
leak-free (tested). The same redactor backs `--debug` logs and any future telemetry sink.

## Determinism (S0.8)

Rendered output is byte-stable for a given input: object keys are sorted, arrays keep
their order, indentation is fixed (2 spaces), and there is exactly one trailing newline
with `\n` endings on every OS. This is why snapshots don't thrash and `sync --check` is
meaningful. Adapter authors **must** render through `serialize()` from `@mcpfold/core`.
