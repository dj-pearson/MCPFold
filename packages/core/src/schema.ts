import { z } from 'zod';

/**
 * The canonical `mcp.config.jsonc` schema (spec §4).
 *
 * Everything downstream — types, resolution, adapters, doctor — is derived from
 * these zod schemas. Never hand-duplicate an interface; infer it (see types.ts).
 */

/** The eighteen clients mcpfold folds config out to (keep in sync with CLIENT_IDS.length; tested). */
export const CLIENT_IDS = [
  'claude-desktop',
  'claude-code',
  'cursor',
  'vscode',
  'windsurf',
  'zed',
  'cline',
  'gemini-cli',
  'jetbrains',
  'visual-studio',
  'continue',
  'roo-code',
  'goose',
  'codex-cli',
  'lm-studio',
  'warp',
  'opencode',
  'copilot-cli',
] as const;

/** Secret-provider schemes understood by the resolver (E4). Parsing lives in secret-ref.ts. */
export const SECRET_SCHEMES = ['env', 'dotenv', 'infisical', 'keychain', 'op'] as const;

/** How a client handles secrets (spec §6; `native-env` added S19.4). Adapters own the default. */
export const SECRET_STRATEGIES = ['shim', 'native-input', 'inline', 'native-env'] as const;

/**
 * The user-selectable secret-strategy overrides (S19.4). A profile or server may opt into
 * `native-env` (write the client's own `${env:NAME}` dialect, no wrapper) or force `shim`; the
 * adapter's own default (usually `shim`, VS Code `native-input`) applies when unset. `native-input`
 * and `inline` are adapter-intrinsic and not user-selectable here.
 */
export const STRATEGY_OVERRIDES = ['shim', 'native-env'] as const;

/**
 * Canonical transports (schema v2, S17.5). The MCP spec's remote transport is **Streamable HTTP**
 * (the older HTTP+SSE was deprecated 2025-11-25). `streamable-http` is the canonical value; a plain
 * `http` is accepted as an alias and canonicalized to it on load. `sse` still loads but `doctor`
 * warns (deprecated). Adapters render each client's own dialect (`type: http` / bare `url` /
 * `httpUrl`) from the canonical value.
 */
export const TRANSPORTS = ['stdio', 'streamable-http', 'sse'] as const;

/** The transport field: accepts `http` as an alias for the canonical `streamable-http`. */
export const TransportSchema = z.preprocess(
  (v) => (v === 'http' ? 'streamable-http' : v),
  z.enum(TRANSPORTS),
);
export const SCOPES = ['user', 'project', 'workspace'] as const;

/**
 * Secret references look like `${scheme:path}` — e.g. `${infisical:dev/mcp/GITHUB_PAT}`.
 * The value is resolved at fold time; the reference is the only thing ever committed.
 * This regex intentionally accepts any lowercase scheme so an unknown scheme surfaces
 * as a *doctor warning* (S1.3), not a hard schema failure.
 *
 * Defense in depth (S22.1/S22.22): the path forbids shell/quote metacharacters — quotes,
 * backtick, `$`, `;`, parentheses, braces, backslash, and whitespace/control chars — so a ref
 * can never carry a command-injection payload into a provider backend even if one interpolates.
 */
export const SECRET_REF_RE = /^\$\{[a-z0-9_-]+:[^\s'"`$;(){}\\]+\}$/;

export const SecretRef = z.string().regex(SECRET_REF_RE, {
  message: 'secret reference must look like ${scheme:path}, e.g. ${env:GITHUB_PAT}',
});

/** Header/env values may be a literal string or a secret reference. */
const StringOrSecretRef = z.union([z.string(), SecretRef]);

/**
 * Auth kinds (v2, S17.5). `bearer`/`header` carry a secret reference mcpfold folds. `oauth` is a
 * **declarative marker** — the remote server uses client-native OAuth 2.1 (the CLIENT discovers the
 * RS/AS and holds no long-lived token here), so no `token`/`headers` are required and `doctor` stops
 * pushing a token ref at it. `none` is unauthenticated.
 */
export const AuthSchema = z
  .object({
    type: z.enum(['bearer', 'header', 'oauth', 'none']).default('none'),
    token: SecretRef.optional(),
    headers: z.record(StringOrSecretRef).optional(),
  })
  .strict();

export const ToolsSchema = z
  .object({
    mode: z.enum(['allow', 'deny']),
    list: z.array(z.string()),
  })
  .strict();

export const ServerSchema = z
  .object({
    transport: TransportSchema,
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    auth: AuthSchema.optional(),
    env: z.record(StringOrSecretRef).optional(),
    /** Pins an `@latest` stdio server to a fixed version at fold time (supply-chain hygiene). */
    pin: z.string().optional(),
    /** Optional SRI integrity hash (e.g. `sha512-…`) for the pinned stdio package (S9.2). */
    integrity: z.string().optional(),
    tools: ToolsSchema.optional(),
    /** Per-server secret-strategy override (S19.4) — wins over the profile's and adapter's default. */
    secretStrategy: z.enum(STRATEGY_OVERRIDES).optional(),
    tags: z.array(z.string()).default([]),
  })
  .strict()
  .refine((s) => (s.transport === 'stdio' ? Boolean(s.command) : Boolean(s.url)), {
    message: 'stdio servers need `command`; http/sse servers need `url`',
  });

export const ProfileSchema = z
  .object({
    client: z.enum(CLIENT_IDS),
    scope: z.enum(SCOPES).default('user'),
    /** Required for project/workspace scopes; ignored for user scope. */
    path: z.string().optional(),
    /** Tag filter — the "fold": only servers whose tags intersect this load into the client. */
    include: z.array(z.string()),
    /** Per-profile secret-strategy override (S19.4); a server's own override still wins over this. */
    secretStrategy: z.enum(STRATEGY_OVERRIDES).optional(),
  })
  .strict()
  .refine((p) => p.scope === 'user' || Boolean(p.path), {
    message: '`path` is required when scope is "project" or "workspace"',
  });

export const ConfigSchema = z
  .object({
    /** Optional JSON Schema pointer for editor autocomplete; ignored semantically. */
    $schema: z.string().optional(),
    /** Canonical schema version. v1 files auto-migrate to v2 on load (S17.5); `mcpfold migrate`
     * persists the upgrade. */
    version: z.literal(2),
    servers: z.record(ServerSchema),
    profiles: z.record(ProfileSchema),
  })
  .strict();
