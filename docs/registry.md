# MCP registry integration

`mcpfold` talks to the **official MCP registry** (`registry.modelcontextprotocol.io`, the frozen v0
API) so adding a server is one command that produces the _safest possible_ config — **pinned to an
exact version, integrity-hashed where available, and with every secret stored as a reference, never
a value**. No competitor in the sync niche does this mapping.

## Search

```bash
mcpfold search github          # list matching servers (name, version, description)
mcpfold search github --json   # machine-readable
```

Each result's **name** is a reverse-DNS identifier (e.g. `io.github.owner/server`) — feed it to `add`.

## Add from the registry

```bash
mcpfold add io.github.owner/server --from-registry
mcpfold add io.github.owner/server --from-registry --secret-scheme op   # non-interactive
mcpfold add io.github.owner/server --from-registry --as myserver        # custom local key
```

`add --from-registry` fetches the listing's `server.json`, maps it to a canonical server, runs it
through the same org-policy gate as any add, and inserts it (comment-preserving) into
`mcp.config.jsonc`. The local key defaults to the name's last segment (`server`); override with
`--as`. Any `isSecret` env var/header becomes a `${scheme:NAME}` reference — mcpfold prompts for the
scheme (or use `--secret-scheme env|dotenv|infisical|keychain|op`).

**A registry entry can never introduce a raw secret value or an unpinned package** (test-proven): a
listing with a secret `default` still yields a reference, and a package with no version is refused.

## The mapping (`server.json` → `mcp.config.jsonc`)

Registry `server.json` (schema 2025-12-11) maps ~1:1 onto the canonical format:

| `server.json`                                        | canonical server                                             |
| ---------------------------------------------------- | ------------------------------------------------------------ |
| `packages[].registryType` (`npm`/`pypi`/`oci`/…)     | the stdio runner (`npx` / `uvx` / `docker`)                  |
| `packages[].identifier` + `version`                  | `command` + `args` pinned to the **exact** version           |
| `packages[].version`                                 | `pin` (so `@latest` drift is impossible)                     |
| `packages[].fileSha256` (mcpb bundles)               | `integrity` as an SRI `sha256-…` hash                        |
| `packages[].environmentVariables[]` where `isSecret` | an `env` entry set to a `${scheme:NAME}` **reference**       |
| `packages[].environmentVariables[]` (non-secret)     | an `env` entry set to its `default` (or a `${env:NAME}` ref) |
| `remotes[].type` (`streamable-http` / `sse`)         | a remote server's `transport`                                |
| `remotes[].url`                                      | the server's `url`                                           |
| `remotes[].headers[]` where `isSecret`               | `auth.headers` entries set to `${scheme:NAME}` references    |

A listing with both packages and remotes prefers the **package** (the pinned/integrity path).

## Add from an MCPB bundle (`--from-mcpb`) — S17.8

An [MCPB bundle](https://github.com/modelcontextprotocol/mcpb) (`.mcpb`, renamed from DXT) is a ZIP
whose root `manifest.json` declares a server + its launch config. mcpfold parses that into a
**canonical, ref-only** stdio server — it does not extract or run the bundle (that's the MCP
client's job); it maps, verifies, and surfaces.

```bash
mcpfold add ./weather.mcpb --from-mcpb
mcpfold add https://github.com/owner/repo/releases/download/v1/weather.mcpb --from-mcpb \
  --integrity <sha256>          # verify the download against a registry fileSha256 first
mcpfold add ./weather.mcpb --from-mcpb --secret-scheme op   # choose the ref scheme
```

What the mapping does:

- **`mcp_config` → command/args/env**, applying this OS's `platform_overrides`.
- **`user_config` → refs.** A field with `sensitive: true` becomes a `${keychain:<key>}` reference
  (or your `--secret-scheme`) — **never a value on disk**. A non-sensitive field with a `default`
  fills it in; without one you get an `${env:KEY}` ref and a warning.
- **Bundle runtime variables** (`${__dirname}`, `${HOME}`, …) are preserved verbatim and flagged —
  they resolve only when an MCPB-aware client runs the extracted bundle.
- **Unsupported server types** (`server.type` other than `node`/`python`/`binary`/`uv`) fail with a
  clear error naming what IS supported.

**Signature + integrity.** mcpfold reads the appended PKCS#7 signature and reports the bundle as
**signed** (CA-issued), **self-signed**, or **unsigned** — so you know what you're installing (it
surfaces the publisher; it does not gate execution). With `--integrity <sha256>` (a registry
`fileSha256`) it verifies the whole-file SHA-256 **before** touching your config and refuses a
mismatch.

## Subregistries and mirrors

The registry base URL is overridable for a subregistry or self-hosted mirror:

```bash
MCPFOLD_REGISTRY_URL=https://registry.internal.example mcpfold search foo
```

## Offline behavior

`search` and `add --from-registry` need the network. If the registry is unreachable, mcpfold fails
with a clear, actionable error per the [offline contract](./offline-contract.md) and **writes
nothing** — a partial config is never left behind.
