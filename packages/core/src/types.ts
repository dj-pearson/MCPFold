import type { z } from 'zod';
import type {
  AuthSchema,
  CLIENT_IDS,
  ConfigSchema,
  ProfileSchema,
  SCOPES,
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
}
