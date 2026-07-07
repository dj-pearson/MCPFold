# mcpfold — MCP Config Portability & Curation Tool

**Name:** `mcpfold` (decided — npm package free, `mcpfold.com` secured)
**One-liner:** One source of truth for your MCP servers. Write it once, *fold* it out to every client — secrets never hardcoded, only the tools you need loaded.
**Domain:** mcpfold.com (primary) · consider mcpfold.dev as the docs/dev alias
**npm:** `mcpfold` · **CLI binary:** `mcpfold` (with optional short alias `mcpf`)
**Status:** Ground-floor spec. Nothing exists in this exact shape yet.

> Naming note: the CLI is `mcpfold`, **not** `fold` — `fold` is a POSIX utility already in everyone's PATH, and shadowing it would break scripts and confuse users. Ship `mcpfold` as the primary binary and register `mcpf` as a terse alias (like `kubectl`→`k`).

---

## 1. The problem (why this is empty)

MCP has ~97M monthly SDK downloads and 9,400+ public servers as of early 2026, and almost everyone using it runs **more than one client** — Claude Code + Cursor, or Claude Desktop + VS Code Copilot, etc. Every mid-2026 writeup on MCP still lists the same unsolved gap: *setting up a server in one client means starting from scratch in another; no portable config standard exists yet.*

Three things make it painful and nobody has productized the fix:

1. **The formats have quietly diverged.** They look identical until they silently fail:
   - Claude Desktop / Claude Code / Cursor / Windsurf: root key `mcpServers`
   - **VS Code: root key `servers`** (copy a Claude config in and it fails silently)
   - **Zed: root key `context_servers`**
   - Claude Code supports an explicit `type: "http" | "stdio"` field; others infer from `command` vs `url`
   - **Windsurf** can't do authenticated remote servers natively — needs an `mcp-remote` npx wrapper
   - File locations differ per client and per scope (user vs project vs workspace)

2. **Secrets get hardcoded.** Every guide says "never hardcode tokens, use env vars" — and everyone hardcodes them anyway because there's no ergonomic alternative. Bearer tokens and PATs end up in plaintext JSON on disk, often accidentally committed.

3. **Context bloat.** A widely-cited benchmark shows ~72% of an agent's context window gets eaten by MCP tool schemas when connecting to multiple servers. Native config formats let you enable/disable whole *servers*, but not individual *tools* — so you can't trim.

**Why it's not being eaten by gateways:** the enterprise gateway crowd (Composio, MintMCP, Lasso, ContextForge, Obot) solves the *server side* — "one server, every client," auth, audit, RBAC. `mcpfold` solves the *client side* — the individual developer's config sprawl across the clients on their own machine. Different problem, different buyer, zero-infra. Nobody's there.

**Honest competitor:** there's a free one-shot "MCP Config Generator" (paste a URL/package → get a config blob for Claude Desktop/Cursor/Zed). That's a paste tool, not a source of truth. It doesn't sync, doesn't manage secrets, doesn't curate tools, doesn't detect drift. `mcpfold` is differentiated on all four.

---

## 2. The wedge strategy (how to get in at ground level)

Ship in this order. Each layer is independently useful and each earns the right to the next.

```
Layer 0  ── the FORMAT: mcp.config.jsonc (canonical schema)      ← own this
Layer 1  ── the CLI:   local-first, zero-infra, npm-distributed  ← the wedge
Layer 2  ── secrets:   Infisical / 1Password / keychain          ← the "wow"
Layer 3  ── curation:  optional local proxy for per-tool trim    ← the moat
Layer 4  ── cloud:     Cloudflare Pages + self-hosted Supabase    ← the business
```

The **CLI is the wedge**, not the web app. A local-first CLI that reads one file and folds it out to every client requires no backend, ships in days, and gets GitHub traction. The cloud sync layer (your actual stack + monetization) sits on top later. Own the open format and the CLI first; the SaaS is the second act.

**Ground-floor move:** MCP config portability is a named 2026 roadmap priority, expected to land as an *extension* rather than core spec. Whoever has the shipping reference implementation when the Working Group debates it shapes the outcome. Publish the `mcp.config.jsonc` format (deliberately kept as a neutral, un-branded filename so it can become a de facto standard rather than "mcpfold's file"), align it with the WG's direction, and be the person in the room with running code. That is the definition of getting in at ground level.

---

## 3. Architecture

```
                    mcp.config.jsonc  (single source of truth, git-friendly)
                            │
                            ▼
        ┌───────────────────────────────────────────────┐
        │              @mcpfold/core                     │
        │  • Zod schema + validation                     │
        │  • profile/tag/scope resolution                │
        │  • secret resolver (provider interface)        │
        │  • adapter registry (render + parse)           │
        │  • drift diff (canonical → rendered vs on-disk)│
        └───────────────────────────────────────────────┘
             │              │                │
     ┌───────┘        ┌─────┘          ┌─────┘
     ▼                ▼                ▼
 ClientAdapters   SecretProviders   (later) SyncClient
 desktop/code/    env/dotenv/                login/push/pull
 cursor/vscode/   infisical/1pw/             → Cloudflare + Supabase
 windsurf/zed     keychain
     │
     ▼
  mcpfold CLI  (init · add · sync · diff · import · doctor · secret · proxy)
```

**Design principle:** `@mcpfold/core` is pure and I/O-free except through injected adapters/providers. All the client-format churn is quarantined inside adapters, so when a client changes its file format you patch one small module, not the engine. This is what keeps a solo maintainer sane.

---

## 4. The canonical schema

`mcp.config.jsonc` — hand-editable, comments allowed, checks into git (with secrets as *references*, never values).

```jsonc
{
  "version": 1,

  "servers": {
    "github": {
      "transport": "http",
      "url": "https://api.githubcopilot.com/mcp/",
      "auth": { "type": "bearer", "token": "${infisical:dev/mcp/GITHUB_PAT}" },
      "tools": { "mode": "allow", "list": ["create_issue", "get_pull_request", "search_code"] },
      "tags": ["work", "code"]
    },

    "supabase": {
      "transport": "http",
      "url": "https://mcp.supabase.com/sse",
      "auth": { "type": "bearer", "token": "${infisical:dev/mcp/SUPABASE_TOKEN}" },
      "tags": ["work"]
    },

    "playwright": {
      "transport": "stdio",
      "command": "npx",
      "args": ["-y", "@playwright/mcp@latest"],
      "pin": "1.4.2",                       // resolves to @playwright/mcp@1.4.2 — supply-chain hygiene
      "env": { "HEADLESS": "true" },
      "tags": ["code"]
    }
  },

  "profiles": {
    "work-cursor":       { "client": "cursor",         "scope": "user",    "include": ["work", "code"] },
    "personal-desktop":  { "client": "claude-desktop", "scope": "user",    "include": ["personal"] },
    "projectX":          { "client": "claude-code",    "scope": "project", "path": "~/repos/projectX", "include": ["code"] },
    "review-vscode":     { "client": "vscode",         "scope": "workspace","path": "~/repos/projectX", "include": ["code", "work"] }
  }
}
```

**Schema notes**
- `tags` + `profiles.include` = curation at the *server* level. `personal-desktop` never loads your work servers → less clutter, fewer secrets exposed, smaller context. (This is the "fold" — one source folds selectively into each client.)
- `tools.mode: "allow" | "deny"` = curation at the *tool* level (enforced by the proxy in Layer 3; ignored by adapters that can't express it natively).
- `pin` rewrites `@latest` to a fixed version at compile — directly addresses the April 2026 stdio-transport RCE lesson that unpinned community servers are a supply-chain risk.
- Secret refs use `${provider:path}` syntax and are the *only* thing referencing a secret; the value is resolved at fold time.

Zod shape (abridged):

```typescript
import { z } from "zod";

const SecretRef = z.string().regex(/^\$\{[a-z0-9_-]+:.+\}$/);

const Server = z.object({
  transport: z.enum(["stdio", "http", "sse"]),
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  auth: z.object({
    type: z.enum(["bearer", "header", "none"]).default("none"),
    token: SecretRef.optional(),
    headers: z.record(z.union([z.string(), SecretRef])).optional(),
  }).optional(),
  env: z.record(z.union([z.string(), SecretRef])).optional(),
  pin: z.string().optional(),
  tools: z.object({ mode: z.enum(["allow", "deny"]), list: z.array(z.string()) }).optional(),
  tags: z.array(z.string()).default([]),
}).refine(
  (s) => (s.transport === "stdio" ? !!s.command : !!s.url),
  { message: "stdio servers need `command`; http/sse servers need `url`" }
);

const Profile = z.object({
  client: z.enum(["claude-desktop", "claude-code", "cursor", "vscode", "windsurf", "zed"]),
  scope: z.enum(["user", "project", "workspace"]).default("user"),
  path: z.string().optional(),       // required for project/workspace scopes
  include: z.array(z.string()),      // tag filter
});

export const Config = z.object({
  version: z.literal(1),
  servers: z.record(Server),
  profiles: z.record(Profile),
});
```

---

## 5. The adapter interface (the heart)

Every client is one small module implementing this. Adding a new client = one PR, no engine changes.

```typescript
export interface RenderedFile {
  path: string;           // absolute, resolved from scope + OS
  contents: string;       // serialized native config
  needsRestart: boolean;  // Claude Desktop yes; Cursor hot-reloads
}

export interface ClientAdapter {
  id: string;

  /** Resolve the on-disk config path for a given scope/project. */
  resolvePath(scope: "user" | "project" | "workspace", projectPath?: string): string;

  /** Canonical servers (already secret-resolved + tag-filtered) → native file. */
  render(servers: ResolvedServer[]): RenderedFile;

  /** Native file → canonical partial. Powers `import` and drift detection. */
  parse(contents: string): Partial<CanonicalConfig>;

  /** How this client wants secrets: inline, native-input, or launcher-shim. */
  secretStrategy: "inline" | "native-input" | "shim";
}
```

### Concrete adapter: Cursor (root key `mcpServers`, hot-reload)

```typescript
export const cursorAdapter: ClientAdapter = {
  id: "cursor",
  secretStrategy: "shim",   // default: keep tokens off disk (see §6)

  resolvePath(scope, projectPath) {
    if (scope === "user") return expandHome("~/.cursor/mcp.json");
    return join(projectPath!, ".cursor", "mcp.json");
  },

  render(servers) {
    const mcpServers: Record<string, unknown> = {};
    for (const s of servers) {
      mcpServers[s.name] =
        s.transport === "stdio"
          ? { command: s.command, args: s.args, ...(s.env && { env: s.env }) }
          : { url: s.url, ...(s.headers && { headers: s.headers }) };
    }
    return {
      path: this.resolvePath(servers[0].scope, servers[0].projectPath),
      contents: JSON.stringify({ mcpServers }, null, 2),
      needsRestart: false,
    };
  },

  parse(contents) {
    const raw = JSON.parse(contents);
    return fromMcpServersShape(raw.mcpServers); // shared helper
  },
};
```

### Concrete adapter: VS Code (root key `servers`, supports `${input:}`)

```typescript
export const vscodeAdapter: ClientAdapter = {
  id: "vscode",
  secretStrategy: "native-input",  // VS Code prompts + stores via ${input:...}

  resolvePath(scope, projectPath) {
    if (scope === "workspace") return join(projectPath!, ".vscode", "mcp.json");
    return vscodeUserProfileMcpPath(); // OS-specific user profile
  },

  render(servers) {
    const serversObj: Record<string, unknown> = {};
    const inputs: unknown[] = [];
    for (const s of servers) {
      // token becomes ${input:github-token}; VS Code prompts once and stores securely
      const { entry, promptedInputs } = toVscodeEntryWithInputs(s);
      serversObj[s.name] = entry;
      inputs.push(...promptedInputs);
    }
    return {
      path: this.resolvePath(servers[0].scope, servers[0].projectPath),
      contents: JSON.stringify({ servers: serversObj, inputs }, null, 2),  // NOTE: "servers", not "mcpServers"
      needsRestart: false,
    };
  },

  parse(contents) {
    const raw = JSON.parse(contents);
    return fromMcpServersShape(raw.servers);
  },
};
```

### Per-client quirk table the adapters encode

| Client | Root key | User path | Project/WS path | Restart? | Remote auth | Secret strategy |
|---|---|---|---|---|---|---|
| Claude Desktop | `mcpServers` | `claude_desktop_config.json` (OS-specific) | — | **Yes** | native | shim |
| Claude Code | `mcpServers` (+`type`) | `~/.claude.json` | `.mcp.json` | new session | native | shim |
| Cursor | `mcpServers` | `~/.cursor/mcp.json` | `.cursor/mcp.json` | No | native | shim |
| VS Code | **`servers`** | user profile | `.vscode/mcp.json` | No | native | native-input |
| Windsurf | `mcpServers` | Windsurf settings | — | Yes | **needs `mcp-remote` wrapper** | shim |
| Zed | **`context_servers`** | Zed settings | — | No | native | shim |

---

## 6. Secrets (the differentiator that makes people say "oh nice")

Three strategies, chosen per adapter, so plaintext tokens ideally never touch disk:

- **`native-input`** — emit the client's own indirection (VS Code `${input:...}`). Client prompts once, stores in its own secret store.
- **`shim`** — the default for clients with no native secret story. Instead of writing the token, `mcpfold` rewrites the launch command to pull it at runtime:

  ```jsonc
  // what lands in cursor/mcp.json — no secret on disk
  {
    "mcpServers": {
      "github": {
        "command": "mcpfold",
        "args": ["run", "github"]   // mcpfold resolves ${infisical:...} at launch, injects, execs real server
      }
    }
  }
  ```

- **`inline`** — last resort for clients that can't do either. `mcpfold` resolves the secret and writes it, but refuses unless the target file is gitignored and prints a loud warning.

Provider interface (Infisical first — you already run it):

```typescript
export interface SecretProvider {
  scheme: string;                       // "infisical" | "env" | "dotenv" | "op" | "keychain"
  resolve(ref: string): Promise<string>;
}

export const infisicalProvider: SecretProvider = {
  scheme: "infisical",
  async resolve(ref) {
    const [, path] = ref.replace(/[${}]/g, "").split(":"); // "dev/mcp/GITHUB_PAT"
    return infisicalClient.getSecret(path);                // uses your existing Infisical setup
  },
};
```

Ship providers in this order: `env` / `dotenv` (day 1) → `infisical` (your dogfood) → `keychain` (macOS/Windows/libsecret) → `op` (1Password CLI).

---

## 7. Tool-level curation (the token-saving moat)

Native configs can't express "load server X but only 3 of its 20 tools." So per-tool trimming needs a thin local proxy — this is the feature that turns the product from convenience-glue into "makes my agents cheaper and faster."

```
Client ──stdio/http──▶ mcpfold-proxy ──▶ real MCP server
                          │
                          └─ intercepts tools/list, returns only the allow-listed tools
                             (or strips deny-listed), passes tools/call straight through
```

When `tools` is set on a server, the shim already in the launch path (§6) also filters `tools/list`. Zero extra config for the user. Publish a before/after context-window benchmark on launch ("cut MCP schema tokens from 72% to 18%") — that's the headline, not "config sync."

Sequencing: server-level curation via tags ships in v1 (free, no proxy). Tool-level curation via proxy is v1.x — it's more surface area, so gate it behind an opt-in flag until it's solid.

---

## 8. CLI surface

```
mcpfold init                 # scaffold mcp.config.jsonc, detect installed clients
mcpfold import               # adopt existing client configs INTO the canonical file (reverse-fold)
mcpfold add <name>           # interactive add: paste URL/package → guided entry
mcpfold sync [--profile p]   # fold canonical → every (or one) client file, with backups
mcpfold diff                 # show drift: canonical vs what's actually on disk
mcpfold doctor               # validate JSON, catch VS Code `servers` mistakes, flag unpinned/plaintext
mcpfold secret set|test      # wire up + verify a provider
mcpfold run <name>           # internal: the shim launcher (resolve secret, filter tools, exec server)
mcpfold login|push|pull      # Layer 4: cloud sync (later)

# alias: `mcpf` works everywhere `mcpfold` does, e.g. `mcpf sync`
```

`import` matters more than it looks — it's the zero-friction onboarding path. A new user runs `mcpfold import` and their existing scattered configs become one managed file in seconds. `doctor` is the retention hook: it catches the silent failures (bad JSON, wrong root key, hardcoded tokens, unpinned `@latest`) that waste hours today.

---

## 9. The cloud layer (your stack, the business)

Everything above is local-first and free/open-source. The SaaS sits on top, and it's exactly your Cloudflare + self-hosted Supabase stack:

- **Frontend:** Cloudflare Pages, React/TypeScript, served from `mcpfold.com`. Visual editor for the canonical config, profile management, a curated server directory, per-machine sync status.
- **API:** Supabase Edge Functions (Deno) for auth + `push`/`pull`. `mcpfold login` does device-code OAuth; `push`/`pull` sync the canonical config (secrets stay as references — you sync *config*, never *secret values*).
- **DB:** self-hosted Supabase on your Contabo VPS via Coolify. Tables: `users`, `configs` (versioned, append-only history), `machines`, `teams`, `team_members`.
- **Monetizable surface:** cross-machine sync, team-shared configs, a private server registry, and a change-audit trail ("who added the Stripe server to the team config, when"). Free CLI drives adoption; teams pay for sync + governance.

Row-level security keeps it multi-tenant cleanly. Version history is append-only — same pattern you already used for GradeThread certificates, so nothing new to learn there.

---

## 10. Build plan & feasibility

Realistic for a solo full-stack dev on your stack. This ships genuinely fast because Layers 0–1 are pure TS with no infra.

| Phase | Scope | Solo estimate |
|---|---|---|
| **Alpha** | Zod schema + Claude Desktop + Cursor adapters + `sync`/`diff` + env/dotenv secrets. `npx mcpfold`. | 2–4 days |
| **v0.1 public** | Add claude-code, vscode (`servers` key), windsurf (`mcp-remote`), zed (`context_servers`). `import` + `doctor`. Backups + drift. | ~1 week |
| **v0.2** | Infisical + keychain + 1Password providers. Shim launcher (secrets off disk). Profiles/tags fully wired. | ~1 week |
| **v0.3** | Optional `mcpfold-proxy` for tool-level curation. Publish context-window benchmark. | ~1 week |
| **v1.0 cloud** | Cloudflare Pages editor at `mcpfold.com` + Supabase edge sync API + `login/push/pull` + teams. | 2–3 weeks |

**Total to a compelling open-source launch (through v0.3): ~3–4 weeks part-time.** The cloud/business layer is another few weeks after you've validated pull.

### Feasibility risks, honestly

- **Absorption risk (medium).** Config portability is a roadmap priority and may become an official extension. *Mitigation:* be the reference implementation, align your format with the WG, and own the ergonomics a spec will never cover — secret injection, tool curation, the proxy, `doctor`. A spec defines a file; it doesn't ship a great CLI.
- **Format drift (low-medium, ongoing).** Clients change their config files. *Mitigation:* the adapter pattern isolates every change to one ~50-line module; fixture-based snapshot tests catch regressions; new clients arrive as community PRs.
- **The one-shot generator incumbent (low).** It's a paste tool with no source of truth, secrets, curation, or sync. You're not competing on the same axis.
- **Proxy scope creep (medium).** Tool-level curation is the moat but adds a whole runtime surface. *Mitigation:* it's opt-in and sequenced last in the OSS phase; server-level curation delivers most of the value without it.

### Naming, licensing, launch

- **Name / domain:** `mcpfold`, `mcpfold.com` (secured). npm package `mcpfold`; CLI binary `mcpfold` (+ `mcpf` alias). Do **not** name the binary `fold` — it shadows the POSIX `fold` utility.
- **"MCP" in the name:** MCP is now a Linux Foundation / Agentic AI Foundation standard and thousands of community tools use the `mcp-` prefix descriptively, so this is standard practice — just don't imply official endorsement in copy. Fine for shipping open-source now; if you later want a registrable trademark, a more abstract mark helps, but it's not a blocker.
- **License:** MIT on core + CLI (adoption first). Cloud layer is closed/commercial.
- **Launch surfaces:** Show HN, dev.to, the `awesome-mcp` lists, r/mcp. Headline the context-window benchmark, not the sync.
- **Ground-floor play:** open a discussion/SEP-adjacent thread in the config-portability Working Group with your running implementation. Shipping code beats a proposal.

---

## 11. Immediate next step

Cut the Alpha: canonical schema + Cursor and Claude Desktop adapters + `sync` + `diff`, dogfood it on your own machine (you already run Supabase, Stripe, Cloudflare, N8N, Sentry MCP servers across clients — perfect test bed), then post it before adding anything else. Everything after that is earned by traction.

`npx mcpfold init` → `mcpfold import` → `mcpfold sync`. Ship that loop first.
