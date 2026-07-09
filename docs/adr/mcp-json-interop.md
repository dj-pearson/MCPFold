# ADR 0001 — mcpfold's stance on `.mcp.json`

- **Status:** Accepted (S20.1)
- **Date:** 2026-07-09
- **Decision:** Option (b) — `.mcp.json` is a **first-class import source and export target**;
  `mcp.config.jsonc` remains the single canonical format.

## Context

The MCP client ecosystem is converging on a filename, not a spec:

- **Claude Code** writes a project-scope `.mcp.json` and describes it as "a standardized format."
- **Visual Studio** (2026-05 docs) reads `%USERPROFILE%\.mcp.json` **and** `<SOLUTIONDIR>\.mcp.json`
  (alongside `.vscode/mcp.json` and `.cursor/mcp.json`).
- The actual interop unit is the **`mcpServers` blob** — a flat map of `name → { command/args/env }`
  or `name → { url/headers }`. Convergence happens because clients **read each other's files**, not
  because anyone ratified a schema.

mcpfold's north star said "own the neutral `mcp.config.jsonc` format." Taken literally that invites a
**filename war** against a standard the ecosystem is already adopting. That is the wrong fight. The
value mcpfold adds is not a filename — it is the things the flat `.mcp.json` blob **cannot express**:

| Capability                                                | `.mcp.json` (flat `mcpServers`) | `mcp.config.jsonc` (canonical) |
| --------------------------------------------------------- | ------------------------------- | ------------------------------ |
| List of servers                                           | ✅                              | ✅                             |
| **Profiles** (fold a subset into each client)             | ❌                              | ✅                             |
| **Tags** (the "fold" selector)                            | ❌                              | ✅                             |
| **Secret refs** (`${infisical:…}`, `${op:…}`, `${env:…}`) | env interpolation only          | ✅ all schemes                 |
| Per-client scope / path targeting                         | ❌                              | ✅ (via adapters)              |
| Pins, tool allow/deny directives                          | ❌                              | ✅                             |

So the canonical format is a **superset**. The question is only how it relates to the flat file.

## Options considered

**(a) Adopt `.mcp.json` as an alternate canonical filename.** Add it to `CONFIG_FILENAMES`.
_Rejected._ `.mcp.json` is already **claude-code's project-scope _target_ file** (and one of Visual
Studio's read paths). Making it _also_ mcpfold's canonical _source_ creates a canonical-vs-target
collision on the exact same path: `mcpfold sync` would render a client file on top of its own source
of truth. It also implies the canonical file is flat, which throws away profiles/tags/refs — the whole
point of mcpfold.

**(b) First-class import/export peer; `mcp.config.jsonc` stays canonical.** _Chosen._ `.mcp.json` is
treated as the lingua franca at the edges: `mcpfold import` reads a bare `.mcp.json` as a source, and
`mcpfold export --mcp-json` emits one from the canonical config. The rich format stays the source of
truth; the flat file is how mcpfold talks to the rest of the world. No path collision (canonical is
`mcp.config.jsonc`, never `.mcp.json`).

**(c) Status quo.** _Rejected._ Leaves mcpfold unable to ingest or emit the emerging standard, which
reads as fighting it.

## Decision

Adopt **(b)**. Concretely:

- **Import** — `mcpfold import` picks up a bare `<cwd>/.mcp.json` as a first-class source (tag +
  profile `mcp-json`), in addition to scanning installed clients' own configs. `${VAR}` env
  interpolation in the flat file is normalized to a canonical `${env:VAR}` ref.
- **Export** — `mcpfold export --mcp-json` renders the canonical config (all servers, or one
  `--profile`) to a flat `.mcp.json`. Secret refs are preserved as env interpolation **where possible**:
  `${env:NAME}` → `${NAME}`. Refs to schemes a plain `.mcp.json` cannot resolve (`infisical`, `op`,
  `keychain`, `dotenv`) are left verbatim and reported, so nothing is silently downgraded to a value.
- **Canonical is never `.mcp.json`.** `CONFIG_FILENAMES` is unchanged, so there is no collision with
  the file claude-code/Visual Studio target.

## The one-paragraph position (repeatable by a stranger)

> mcpfold's canonical file is `mcp.config.jsonc` — a neutral superset that adds profiles, tags, and
> secret references the flat `.mcp.json` can't express. `.mcp.json` is the ecosystem's emerging
> lingua franca, so mcpfold treats it first-class at the edges: `mcpfold import` reads one, and
> `mcpfold export --mcp-json` writes one. You keep the rich source of truth; the flat file is how
> mcpfold interoperates with everything that speaks `.mcp.json`.

## Consequences

- mcpfold positions as a **steward** of the `.mcp.json` standard, not a competitor to it.
- Round-trip (`export --mcp-json` → `import`) is lossy only where the flat format is inherently
  poorer (profiles collapse to one `mcp-json` profile; non-env secret schemes need re-resolution).
  This is documented in [config-format.md](../config-format.md).
- The north star is updated from "own the neutral `mcp.config.jsonc` format" to "**steward** the
  neutral config format — canonical `mcp.config.jsonc`, first-class `.mcp.json` interop."
