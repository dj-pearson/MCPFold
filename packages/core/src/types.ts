import type { z } from 'zod';
import type {
  AuthSchema,
  CLIENT_IDS,
  ConfigSchema,
  ProfileSchema,
  SCOPES,
  SECRET_STRATEGIES,
  STRATEGY_OVERRIDES,
  ServerSchema,
  ToolsSchema,
  TRANSPORTS,
} from './schema.js';

/**
 * All public types are inferred from the zod schemas — never hand-duplicated.
 */

export type ClientId = (typeof CLIENT_IDS)[number];
export type Transport = (typeof TRANSPORTS)[number];
export type Scope = (typeof SCOPES)[number];
/** How a client handles secrets (S19.4). Owned here; adapters re-export it. */
export type SecretStrategy = (typeof SECRET_STRATEGIES)[number];
/** The user-selectable secret-strategy overrides (S19.4) — a subset of {@link SecretStrategy}. */
export type StrategyOverride = (typeof STRATEGY_OVERRIDES)[number];

export type AuthConfig = z.infer<typeof AuthSchema>;
export type ToolsDirective = z.infer<typeof ToolsSchema>;
export type ServerConfig = z.infer<typeof ServerSchema>;
export type ProfileConfig = z.infer<typeof ProfileSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * A server after profile/tag/scope resolution (S1.4): the canonical server plus the
 * profile context it will be rendered into. Secrets are still references at this stage —
 * they are resolved later, inside adapters/providers.
 */
export interface ResolvedServer {
  /** The server's key in `config.servers`. */
  name: string;
  transport: Transport;
  command?: string;
  args?: string[];
  url?: string;
  auth?: AuthConfig;
  env?: Record<string, string>;
  pin?: string;
  tools?: ToolsDirective;
  tags: string[];
  /** From the resolving profile. */
  client: ClientId;
  scope: Scope;
  projectPath?: string;
  /**
   * Effective secret-strategy override (S19.4): the server's own `secretStrategy` if set, else the
   * resolving profile's. Undefined ⇒ use the adapter's default. The renderer honors this.
   */
  secretStrategy?: StrategyOverride;
}
