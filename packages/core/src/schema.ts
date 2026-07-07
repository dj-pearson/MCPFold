import { z } from 'zod';

/**
 * The canonical `mcp.config.jsonc` schema (spec §4).
 *
 * Everything downstream — types, resolution, adapters, doctor — is derived from
 * these zod schemas. Never hand-duplicate an interface; infer it (see types.ts).
 */

/** The six clients mcpfold folds config out to. */
export const CLIENT_IDS = [
  'claude-desktop',
  'claude-code',
  'cursor',
  'vscode',
  'windsurf',
  'zed',
] as const;

/** Secret-provider schemes understood by the resolver (E4). Parsing lives in secret-ref.ts. */
export const SECRET_SCHEMES = ['env', 'dotenv', 'infisical', 'keychain', 'op'] as const;

export const TRANSPORTS = ['stdio', 'http', 'sse'] as const;
export const SCOPES = ['user', 'project', 'workspace'] as const;

/**
 * Secret references look like `${scheme:path}` — e.g. `${infisical:dev/mcp/GITHUB_PAT}`.
 * The value is resolved at fold time; the reference is the only thing ever committed.
 * This regex intentionally accepts any lowercase scheme so an unknown scheme surfaces
 * as a *doctor warning* (S1.3), not a hard schema failure.
 */
export const SECRET_REF_RE = /^\$\{[a-z0-9_-]+:.+\}$/;

export const SecretRef = z.string().regex(SECRET_REF_RE, {
  message: 'secret reference must look like ${scheme:path}, e.g. ${env:GITHUB_PAT}',
});

/** Header/env values may be a literal string or a secret reference. */
const StringOrSecretRef = z.union([z.string(), SecretRef]);

export const AuthSchema = z
  .object({
    type: z.enum(['bearer', 'header', 'none']).default('none'),
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
    transport: z.enum(TRANSPORTS),
    command: z.string().optional(),
    args: z.array(z.string()).optional(),
    url: z.string().url().optional(),
    auth: AuthSchema.optional(),
    env: z.record(StringOrSecretRef).optional(),
    /** Pins an `@latest` stdio server to a fixed version at fold time (supply-chain hygiene). */
    pin: z.string().optional(),
    tools: ToolsSchema.optional(),
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
  })
  .strict()
  .refine((p) => p.scope === 'user' || Boolean(p.path), {
    message: '`path` is required when scope is "project" or "workspace"',
  });

export const ConfigSchema = z
  .object({
    version: z.literal(1),
    servers: z.record(ServerSchema),
    profiles: z.record(ProfileSchema),
  })
  .strict();
