import { UsageError, type ServerConfig } from '@mcpfold/core';

/**
 * Map an official-registry `server.json` (schema 2025-12-11) to a canonical mcpfold server (S17.7).
 * This is the differentiation: a registry listing becomes a **pinned, integrity-hashed, ref-only**
 * canonical entry — never an unpinned package, never a raw secret value. Pure (no I/O); the fetch
 * layer lives in client.ts.
 */

/** The subset of `server.json` fields mcpfold reads. */
export interface RegistryEnvVar {
  name: string;
  description?: string;
  isSecret?: boolean;
  isRequired?: boolean;
  default?: string;
}
export interface RegistryPackage {
  registryType: 'npm' | 'pypi' | 'cargo' | 'nuget' | 'oci' | 'mcpb';
  identifier: string;
  version?: string;
  transport?: { type?: string };
  runtimeHint?: string;
  environmentVariables?: RegistryEnvVar[];
  /** mcpb packages ship a content hash; accepted as hex or an SRI string. */
  fileSha256?: string;
}
export interface RegistryRemote {
  type: 'streamable-http' | 'sse' | string;
  url: string;
  headers?: RegistryEnvVar[];
}
export interface RegistryServer {
  name: string;
  description?: string;
  version?: string;
  packages?: RegistryPackage[];
  remotes?: RegistryRemote[];
}

/** A secret-provider scheme for the refs we synthesize. */
export type SecretScheme = 'env' | 'dotenv' | 'infisical' | 'keychain' | 'op';

export interface MapOptions {
  /** Scheme used for `${scheme:NAME}` refs synthesized from `isSecret` env vars. Default `env`. */
  secretScheme?: SecretScheme;
}

/**
 * The whitelist of runners a registry package may resolve to (S22.11). `runtimeHint` is
 * server-controlled data from `server.json` and flows into `server.command` — the process the client
 * will spawn — so it MUST map to a known-safe runner. An unrecognized hint is rejected, never passed
 * through as the command, so a malicious registry mirror can't make mcpfold write an arbitrary
 * launch command into a client config.
 */
const RUNNER_WHITELIST: Readonly<Record<string, string>> = {
  npm: 'npx',
  npx: 'npx',
  pypi: 'uvx',
  uvx: 'uvx',
  oci: 'docker',
  docker: 'docker',
};

/** The stdio runner for a registry package type, restricted to the whitelist. */
function runnerFor(pkg: RegistryPackage): string {
  const requested = pkg.runtimeHint ?? pkg.registryType;
  const runner = RUNNER_WHITELIST[requested];
  if (!runner) {
    throw new UsageError(
      `Registry package "${pkg.identifier}" requests an unsupported runtime "${requested}".`,
      {
        hint:
          'mcpfold only launches a known-safe set of runners (npx, uvx, docker). For an .mcpb ' +
          'bundle use `mcpfold add --from-mcpb`; otherwise report this listing to the registry.',
      },
    );
  }
  return runner;
}

/** Hex (64 chars) → SRI `sha256-<base64>`; pass an already-SRI string through; else null. */
export function toSri(sha256: string | undefined): string | null {
  if (!sha256) return null;
  const value = sha256.trim();
  if (/^sha(256|384|512)-/.test(value)) return value; // already SRI
  if (/^[0-9a-f]{64}$/i.test(value)) {
    const bytes = Buffer.from(value, 'hex');
    return `sha256-${bytes.toString('base64')}`;
  }
  return null;
}

/** Convert one registry env/header var to a canonical value: a ref for secrets, else the default. */
function valueFor(v: RegistryEnvVar, scheme: SecretScheme): string {
  // A secret NEVER becomes a value — it becomes a `${scheme:NAME}` reference the resolver fills.
  if (v.isSecret) return `\${${scheme}:${v.name}}`;
  if (v.default !== undefined) return v.default;
  // A required non-secret with no default still shouldn't be empty; resolve it from the environment.
  if (v.isRequired) return `\${env:${v.name}}`;
  return `\${env:${v.name}}`;
}

/** The npm/pypi package spec pinned to an exact version (never `@latest`). */
function pinnedSpec(pkg: RegistryPackage): string {
  const runner = runnerFor(pkg);
  const sep = runner === 'uvx' ? '==' : '@';
  return `${pkg.identifier}${sep}${pkg.version}`;
}

function mapPackage(pkg: RegistryPackage, options: MapOptions): ServerConfig {
  if (!pkg.version) {
    throw new UsageError(
      `Registry package "${pkg.identifier}" has no version — mcpfold refuses to add an unpinned package.`,
      { hint: 'A registry entry must pin an exact version; report this listing to the registry.' },
    );
  }
  const scheme = options.secretScheme ?? 'env';
  const runner = runnerFor(pkg);
  const server: ServerConfig = {
    transport: 'stdio',
    command: runner,
    args: runner === 'npx' ? ['-y', pinnedSpec(pkg)] : [pinnedSpec(pkg)],
    // Pin the exact version so a later `@latest` drift is impossible; mcpfold keeps it fixed.
    pin: pkg.version,
    tags: [],
  };
  const integrity = toSri(pkg.fileSha256);
  if (integrity) server.integrity = integrity;

  const env: Record<string, string> = {};
  for (const v of pkg.environmentVariables ?? []) env[v.name] = valueFor(v, scheme);
  if (Object.keys(env).length > 0) server.env = env;
  return server;
}

function mapRemote(remote: RegistryRemote, options: MapOptions): ServerConfig {
  // S22.11: the remote URL is server-controlled and gets written into client configs; require https
  // so a registry can't point a client at a plaintext (interceptable) or otherwise-hostile endpoint.
  if (!/^https:\/\//i.test(remote.url)) {
    throw new UsageError(
      `Registry remote endpoint "${remote.url}" is not an https URL.`,
      { hint: 'mcpfold refuses to write a non-https remote endpoint into a client config.' },
    );
  }
  const scheme = options.secretScheme ?? 'env';
  const transport = remote.type === 'sse' ? 'sse' : 'streamable-http';
  const server: ServerConfig = { transport, url: remote.url, tags: [] };
  const headers: Record<string, string> = {};
  for (const h of remote.headers ?? []) headers[h.name] = valueFor(h, scheme);
  if (Object.keys(headers).length > 0) server.auth = { type: 'header', headers };
  return server;
}

/**
 * Map a registry server to a canonical entry. Prefers a package (stdio — the pinned/integrity path)
 * and falls back to the first remote. Throws a UsageError if the listing has neither.
 */
export function mapRegistryServer(server: RegistryServer, options: MapOptions = {}): ServerConfig {
  if (server.packages && server.packages.length > 0) {
    return mapPackage(server.packages[0]!, options);
  }
  if (server.remotes && server.remotes.length > 0) {
    return mapRemote(server.remotes[0]!, options);
  }
  throw new UsageError(`Registry server "${server.name}" has no installable package or remote.`, {
    hint: 'Nothing to add — the listing declares neither a package nor a remote endpoint.',
  });
}
