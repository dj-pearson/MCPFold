# Configuration assistance — diagnose → repair

`mcpfold doctor` names every config footgun (the file, the key, and the fix). The **assistance**
surface goes one step further: it applies the safe fixes for you — deterministically, offline, and only
after showing you what will change. There is no AI, no network "recommendation," and nothing decides
what belongs in your config; it just helps you reach a correct, byte-stable canonical config faster.

## `mcpfold doctor` — the report

`doctor` lints the canonical config and each on-disk client file and reports findings by severity:

```bash
mcpfold doctor          # human report; exit 2 if any error-severity finding exists
mcpfold doctor --json   # machine-readable envelope
```

Each finding names the file, the issue, and the fix. Findings whose repair is **unambiguous** also
carry a machine-applicable form that `--fix` can apply.

## `mcpfold doctor --fix` — apply the safe repairs

```bash
mcpfold doctor --fix              # PREVIEW: lists each fixable finding, writes nothing
mcpfold doctor --fix --yes        # apply every auto-applicable fix
mcpfold doctor --fix 1,3 --yes    # scope to specific finding ids (as shown in the preview)
mcpfold doctor --fix --json       # report what was applied / skipped / failed
```

- **Preview by default.** Without `--yes` (and without an interactive "yes"), `--fix` writes nothing —
  it prints what it _would_ do.
- **Backed up + re-validated.** Every file is backed up before an atomic write, and `doctor` is re-run
  afterward to confirm. A fix that would raise the error count is **rolled back from its backup**; a
  fix whose finding survives is reported **failed**, never a silent partial write.
- **No secret ever printed.** The preview describes actions, not file contents, and consumes already
  redacted findings.

### What `--fix` applies automatically

| Finding                                                           | Fix                                       |
| ----------------------------------------------------------------- | ----------------------------------------- |
| VS Code file uses the `mcpServers` root key (should be `servers`) | re-fold that client from canonical        |
| A curated server bypasses the proxy (its `tools` list is inert)   | re-fold it through the `mcpfold run` shim |
| An unpinned / vulnerable `mcp-remote` bridge (CVE-2025-6514)      | re-fold it to the pinned bridge           |
| A malformed client JSON file                                      | regenerate it from canonical              |

### What it reports but does **not** auto-apply

These need a human decision, so `--fix` lists them (and points you at the command) rather than guessing:

- **A hardcoded secret** → run [`mcpfold secret extract`](#mcpfold-secret-extract) (it needs a provider
  choice).
- **A deprecated `sse` transport** → switch to `streamable-http` once the server supports it.
- **An unpinned `@latest` package** stays advisory: pinning it requires resolving a concrete version
  (a network, non-deterministic step), so mcpfold won't fabricate one — add a `pin` yourself.

## `mcpfold secret extract`

Move a hardcoded token out of the config and into a provider reference, so the value leaves disk:

```bash
mcpfold secret extract <server>                    # prompt for a provider (default dotenv)
mcpfold secret extract <server> --scheme dotenv    # env | dotenv | keychain | infisical | op
mcpfold secret extract <server> --key API_TOKEN    # just one key (default: all hardcoded secrets)
mcpfold secret extract <server> --dry-run          # preview the plan, write nothing
```

- It finds the literal secret values in the server's `env` / `auth.headers` (the same detector `doctor`
  uses), rewrites each to a `${scheme:path}` reference with a **comment-preserving** edit, backs the
  config up first, and re-validates.
- **`dotenv`** persists the value to `.env`; every other scheme prints the exact store-it command with a
  `<value>` placeholder — the raw value is **never echoed to stdout or logs**, and stays recoverable
  from the config backup.
- Once the value is a reference, `mcpfold sync` folds it through the run shim, so it never lands in any
  client file. See [Secrets](./secrets.md) for the reference format and providers.

## `mcpfold explain` — learn why a footgun matters

Every `doctor` finding ends with a `see: mcpfold explain <id>` pointer. Run it for an offline, authored
explanation of _why_ the footgun matters and _why_ the fix is right — so you learn the model instead of
applying fixes blindly:

```bash
mcpfold explain                     # list every topic
mcpfold explain vscode-root-key     # a specific finding class
mcpfold explain shim                # a core concept (the run shim, curation, secret refs, …)
mcpfold explain hardcoded-secret --json
```

There is no network and no generation — the catalog is static and versioned in the CLI.

## The whole loop

```bash
mcpfold doctor                       # see every footgun
mcpfold secret extract gh            # move the hardcoded token to a provider ref
mcpfold doctor --fix --yes           # apply the deterministic client-file repairs
mcpfold sync                         # fold the fixed config out to every client
mcpfold doctor                       # confirm: clean
```

A cross-OS end-to-end test (`e2e/config-assistance.test.ts`) walks this exact path — a config with the
root-key trap, an unpinned `@latest`, and a hardcoded token — and asserts the result re-validates, is
byte-stable, and leaks no secret value, on Windows, macOS, and Linux.
