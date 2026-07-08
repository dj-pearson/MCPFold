# Quickstart

Get from "MCP config scattered across clients" to "one canonical file, folded out to all
of them" in a few minutes.

## Requirements

- **Node 20+** (`node --version`).
- One or more MCP clients installed (Claude Code, Claude Desktop, Cursor, VS Code,
  Windsurf, or Zed). `mcpfold` detects whichever it finds.

## Install

```bash
npm install -g mcpfold      # or: pnpm add -g mcpfold
mcpfold --version
```

`mcpf` is a shorter alias for the same binary.

## 1. Initialize

```bash
mcpfold init
```

Scaffolds a commented [`mcp.config.jsonc`](./config-format.md) in the current directory,
with a `$schema` line for editor autocomplete and a sample server + profile. It also
detects which clients are installed and prints them. Re-running is refused unless you pass
`--force`.

## 2. Import what you already have

```bash
mcpfold import
```

Scans your installed clients, parses each native config, and merges them into the
canonical file — de-duplicating servers that appear in more than one client and unioning
their tags. Two important behaviors:

- **Conflicts are reported, never silently merged.** If two clients disagree about a
  server, you're told.
- **Hardcoded secrets are rewritten, never copied.** A token found inline in a client
  config becomes a `${env:...}` [reference](./secrets.md) placeholder — the value is never
  written into the canonical file.

Preview first with `mcpfold import --dry-run`.

## 3. Add a server

```bash
# A remote (HTTP) server, with the auth token as a reference — never a raw value:
mcpfold add github --url https://api.githubcopilot.com/mcp/ --token-ref '${env:GITHUB_PAT}'

# A local stdio server from an npm package, pinned to a version:
mcpfold add playwright --package @playwright/mcp@latest --pin 1.4.2
```

Run `mcpfold add <name>` with no source flags to be prompted interactively. Tokens are
**only** accepted as `${scheme:path}` references; a raw token is rejected.

## 4. Sync it out

```bash
mcpfold sync
```

Folds the canonical config out to every detected client, writing a timestamped backup of
any file it replaces. Sync is idempotent — an unchanged client file is left alone (no new
backup). Preview with `--dry-run`; some clients (e.g. Claude Desktop) print a restart hint.

## 5. Check for drift

```bash
mcpfold diff          # human-readable drift report; exits 1 if anything differs
mcpfold sync --check   # writes nothing; exits 1 if any client is out of sync
```

`sync --check` is designed as a CI gate — drop it into a pipeline to assert "everything is
synced" and fail the build if it isn't. See the [CLI contract](./cli-contract.md#exit-codes-s010)
for exit codes.

## 6. Validate

```bash
mcpfold doctor
```

Validates the config and catches silent failures: unpinned `@latest` packages, hardcoded
secrets, unknown secret schemes, and client-specific footguns (like VS Code's
`mcpServers`-vs-`servers` trap). Each finding carries a severity and a suggested fix;
`doctor` exits `2` if any error-severity problem is found.

## What next

- Understand the file you're editing → [Config format](./config-format.md).
- Wire up a real secret backend → [Secrets](./secrets.md).
- Cut your agent's context window → [Benchmark](./benchmark.md).
- Add a client that isn't supported yet → [Adapters](./adapters.md).
