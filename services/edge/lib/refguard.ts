// Config validation + the ref-only guard for push (S6.4). Defense-in-depth: the same
// invariant is enforced by the `config_is_ref_only` CHECK on public.configs (migration 0002)
// and by the CLI push guard (S9.1). We reject here too so a bad payload fails fast with a
// clear message instead of a raw constraint-violation error, and so no raw secret is ever
// even attempted to be written.

// Raw secret-shaped tokens — kept in sync with the DB CHECK's regex.
const RAW_SECRET = new RegExp(
  [
    "ghp_[A-Za-z0-9]{20,}",
    "github_pat_[A-Za-z0-9_]{20,}",
    "sk-[A-Za-z0-9]{20,}",
    "xox[baprs]-[A-Za-z0-9-]{10,}",
    "AKIA[0-9A-Z]{16}",
  ].join("|"),
);

const SECRET_REF = /^\$\{[a-z0-9_-]+:.+\}$/;

/** Every string value anywhere in the config that looks like a raw secret. */
export function findRawSecrets(config: unknown): string[] {
  const found: string[] = [];
  const walk = (v: unknown) => {
    if (typeof v === "string") {
      if (RAW_SECRET.test(v)) found.push(v);
    } else if (Array.isArray(v)) {
      for (const item of v) walk(item);
    } else if (v && typeof v === "object") {
      for (const value of Object.values(v)) walk(value);
    }
  };
  walk(config);
  return found;
}

export type ValidationError = { code: string; message: string };

/**
 * Validate a pushed config: canonical shape + ref-only secret positions. Not a full zod
 * validation (that's the CLI's job, S6.6, and the JSON schema's) — it enforces the invariants
 * the server must never accept a violation of: version 1, well-formed servers, and NO raw
 * secret value anywhere (only ${scheme:path} references in auth.token).
 */
export function validateConfigForPush(config: unknown): ValidationError | null {
  if (!config || typeof config !== "object" || Array.isArray(config)) {
    return { code: "invalid_config", message: "config must be an object" };
  }
  const cfg = config as Record<string, unknown>;
  if (cfg.version !== 1) {
    return { code: "invalid_config", message: "config.version must be 1" };
  }
  if (!cfg.servers || typeof cfg.servers !== "object" || Array.isArray(cfg.servers)) {
    return { code: "invalid_config", message: "config.servers must be an object" };
  }
  if (
    cfg.profiles !== undefined && (typeof cfg.profiles !== "object" || Array.isArray(cfg.profiles))
  ) {
    return { code: "invalid_config", message: "config.profiles must be an object" };
  }

  for (const [name, raw] of Object.entries(cfg.servers as Record<string, unknown>)) {
    if (!raw || typeof raw !== "object") {
      return { code: "invalid_config", message: `server "${name}" must be an object` };
    }
    const server = raw as Record<string, unknown>;
    const transport = server.transport;
    if (transport === "stdio") {
      if (typeof server.command !== "string") {
        return { code: "invalid_config", message: `stdio server "${name}" needs a command` };
      }
    } else if (transport === "http" || transport === "sse") {
      if (typeof server.url !== "string") {
        return { code: "invalid_config", message: `${transport} server "${name}" needs a url` };
      }
    } else {
      return {
        code: "invalid_config",
        message: `server "${name}" has an invalid transport (stdio|http|sse)`,
      };
    }
    // Any auth.token present must be a ${scheme:path} reference, never a literal.
    const auth = server.auth as Record<string, unknown> | undefined;
    if (auth && typeof auth.token === "string" && !SECRET_REF.test(auth.token)) {
      return {
        code: "raw_secret",
        message:
          `server "${name}" auth.token must be a \${scheme:path} reference, not a literal value`,
      };
    }
  }

  const raw = findRawSecrets(config);
  if (raw.length > 0) {
    return {
      code: "raw_secret",
      message: "config contains a raw secret value; only ${scheme:path} references may be synced",
    };
  }
  return null;
}
