import { createHash } from 'node:crypto';
import { unzipSync, strFromU8 } from 'fflate';
import forge from 'node-forge';
import { UsageError, type ServerConfig } from '@mcpfold/core';
import type { SecretScheme } from './map.js';

/**
 * MCPB bundle support as an install source (S17.8). An `.mcpb` (MCP Bundle, renamed from DXT) is a
 * ZIP whose root `manifest.json` declares a server + its `mcp_config` (command/args/env, with
 * platform overrides) and typed `user_config` (where `sensitive: true` means a secret). mcpfold
 * parses that into a **canonical, ref-only** stdio server — secrets become `${keychain:…}` refs,
 * never values — and surfaces the bundle's signature status. Executing the bundle (extracting it,
 * resolving `${__dirname}`) is the MCP client's job, not ours; we map + verify + surface.
 *
 * Verified against modelcontextprotocol/mcpb MANIFEST.md v0.3 + src/node/sign.ts (July 2026).
 */

/** Allowed `server.type` values (MANIFEST.md v0.3). */
export const MCPB_SERVER_TYPES = ['node', 'python', 'binary', 'uv'] as const;
export type McpbServerType = (typeof MCPB_SERVER_TYPES)[number];

export interface McpbMcpConfig {
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  platform_overrides?: Partial<
    Record<
      'win32' | 'darwin' | 'linux',
      { command?: string; args?: string[]; env?: Record<string, string> }
    >
  >;
}

export interface McpbUserConfigField {
  type: 'string' | 'number' | 'boolean' | 'directory' | 'file';
  title?: string;
  description?: string;
  required?: boolean;
  default?: unknown;
  sensitive?: boolean;
  multiple?: boolean;
}

export interface McpbManifest {
  manifest_version: string;
  name: string;
  version: string;
  description?: string;
  server: { type: string; entry_point?: string; mcp_config?: McpbMcpConfig };
  user_config?: Record<string, McpbUserConfigField>;
}

/** Read `manifest.json` from an `.mcpb` ZIP (fflate tolerates the appended signature block). */
export function parseMcpbManifest(bundle: Uint8Array): McpbManifest {
  let files: Record<string, Uint8Array>;
  try {
    files = unzipSync(bundle);
  } catch (e) {
    throw new UsageError(`Not a valid .mcpb bundle (unreadable ZIP): ${(e as Error).message}`);
  }
  const raw = files['manifest.json'];
  if (!raw) throw new UsageError('.mcpb bundle has no manifest.json at its root.');
  let manifest: McpbManifest;
  try {
    manifest = JSON.parse(strFromU8(raw)) as McpbManifest;
  } catch (e) {
    throw new UsageError(`.mcpb manifest.json is not valid JSON: ${(e as Error).message}`);
  }
  if (!manifest.name || !manifest.server?.type) {
    throw new UsageError('.mcpb manifest.json is missing `name` or `server.type`.');
  }
  return manifest;
}

export interface MapMcpbOptions {
  /** Target platform for `platform_overrides` (defaults to the current OS). */
  platform?: 'win32' | 'darwin' | 'linux';
  /** Scheme for `sensitive` user_config refs (default `keychain` — never a raw value). */
  secretScheme?: SecretScheme;
}

export interface MappedMcpb {
  server: ServerConfig;
  /** Non-fatal notes (unresolved runtime vars, prompts a user still owes, …). */
  warnings: string[];
}

/** Resolve one `user_config` field to a canonical value: a secret ref, its default, or a prompt marker. */
function userConfigValue(
  key: string,
  field: McpbUserConfigField | undefined,
  scheme: SecretScheme,
): { value: string; warning?: string } {
  // A sensitive field NEVER becomes a value — it becomes a `${scheme:key}` reference (default keychain).
  if (field?.sensitive) return { value: `\${${scheme}:${key}}` };
  if (typeof field?.default === 'string') return { value: field.default };
  if (field?.default !== undefined) return { value: String(field.default) };
  // No default → the user must still supply it; leave an `${env:KEY}` ref and flag it.
  return {
    value: `\${env:${key.toUpperCase().replace(/[^A-Z0-9]/g, '_')}}`,
    warning: `user_config "${key}" has no default — set ${key.toUpperCase()} in the environment, or edit the ref.`,
  };
}

/** Substitute `${user_config.KEY}` in a string; other `${…}` runtime vars are left for the client. */
function substitute(
  input: string,
  userConfig: Record<string, McpbUserConfigField> | undefined,
  scheme: SecretScheme,
  warnings: Set<string>,
): string {
  return input.replace(/\$\{user_config\.([A-Za-z0-9_]+)\}/g, (_m, key: string) => {
    const { value, warning } = userConfigValue(key, userConfig?.[key], scheme);
    if (warning) warnings.add(warning);
    return value;
  });
}

/**
 * Map an MCPB manifest to a canonical, ref-only stdio server (S17.8). Applies the current platform's
 * overrides, rewrites `${user_config.KEY}` (secrets → `${keychain:…}` refs), and preserves the
 * bundle's own runtime vars (`${__dirname}`, `${HOME}`, …) — those resolve when an MCPB-aware client
 * runs the extracted bundle. Throws a clear error for a server type mcpfold can't express.
 */
export function mapMcpbManifest(manifest: McpbManifest, options: MapMcpbOptions = {}): MappedMcpb {
  if (!(MCPB_SERVER_TYPES as readonly string[]).includes(manifest.server.type)) {
    throw new UsageError(`mcpfold can't add an MCPB server of type "${manifest.server.type}".`, {
      hint: `Supported MCPB server types: ${MCPB_SERVER_TYPES.join(', ')}.`,
    });
  }
  const base = manifest.server.mcp_config;
  if (!base?.command) {
    throw new UsageError(`.mcpb manifest declares no runnable mcp_config.command.`, {
      hint: 'Only bundles with an explicit stdio launch command can be added.',
    });
  }
  const platform = options.platform ?? (process.platform as 'win32' | 'darwin' | 'linux');
  const scheme = options.secretScheme ?? 'keychain';
  const warnings = new Set<string>();

  // Shallow-merge this platform's overrides over the base mcp_config.
  const ov = base.platform_overrides?.[platform] ?? {};
  const command = ov.command ?? base.command;
  const args = ov.args ?? base.args ?? [];
  const env = { ...(base.env ?? {}), ...(ov.env ?? {}) };

  const sub = (s: string) => substitute(s, manifest.user_config, scheme, warnings);
  const server: ServerConfig = {
    transport: 'stdio',
    command: sub(command),
    tags: [],
  };
  if (args.length > 0) server.args = args.map(sub);
  const mappedEnv: Record<string, string> = {};
  for (const [k, v] of Object.entries(env)) mappedEnv[k] = sub(v);
  if (Object.keys(mappedEnv).length > 0) server.env = mappedEnv;

  // The command/args still reference the bundle's own runtime vars — flag it (mcpfold doesn't extract).
  const text = [server.command, ...(server.args ?? []), ...Object.values(server.env ?? {})].join(
    ' ',
  );
  if (/\$\{(__dirname|HOME|DESKTOP|DOCUMENTS|DOWNLOADS|pathSeparator|\/)\}/.test(text)) {
    warnings.add(
      'This server references MCPB runtime variables (${__dirname}, ${HOME}, …) — they resolve only when an MCPB-aware client runs the extracted bundle.',
    );
  }
  return { server, warnings: [...warnings] };
}

// --- Signature (S17.8) -----------------------------------------------------------------------

const SIG_HEADER = 'MCPB_SIG_V1';
const SIG_FOOTER = 'MCPB_SIG_END';

export interface McpbSignature {
  status: 'unsigned' | 'self-signed' | 'signed';
  /** Signer certificate subject CN. */
  publisher?: string;
  /** Signer certificate issuer CN. */
  issuer?: string;
  /** SHA-256 fingerprint (hex) of the signer certificate. */
  fingerprint?: string;
  validFrom?: string;
  validTo?: string;
}

/**
 * Inspect an `.mcpb` for its appended PKCS#7 signature (S17.8). Layout (src/node/sign.ts):
 *   [ ZIP ] "MCPB_SIG_V1" <uint32 LE length> [ DER PKCS#7 ] "MCPB_SIG_END"
 * We classify **unsigned** (no marker), **self-signed** (signer issuer CN == subject CN), or
 * **signed** (CA-issued). We surface the signer identity for the user; full OS-trust-store chain
 * validation is delegated (mcpfold surfaces, it does not execute the bundle).
 */
export function inspectMcpbSignature(bundle: Uint8Array): McpbSignature {
  const buf = Buffer.from(bundle);
  const footerIdx = buf.lastIndexOf(SIG_FOOTER);
  if (footerIdx === -1) return { status: 'unsigned' };
  const headerIdx = buf.lastIndexOf(SIG_HEADER, footerIdx);
  if (headerIdx === -1 || headerIdx + SIG_HEADER.length + 4 > footerIdx)
    return { status: 'unsigned' };

  const lenAt = headerIdx + SIG_HEADER.length;
  const len = buf.readUInt32LE(lenAt);
  const der = buf.subarray(lenAt + 4, lenAt + 4 + len);
  if (der.length === 0) return { status: 'signed' };

  try {
    const p7 = forge.pkcs7.messageFromAsn1(
      forge.asn1.fromDer(forge.util.createBuffer(der.toString('binary'))),
    ) as forge.pkcs7.PkcsSignedData;
    const cert = p7.certificates?.[0];
    if (!cert) return { status: 'signed' };
    const cn = (c: forge.pki.Certificate['subject']): string | undefined =>
      (c.getField('CN') as { value?: string } | null)?.value;
    const subjectCN = cn(cert.subject);
    const issuerCN = cn(cert.issuer);
    const selfSigned = Boolean(subjectCN && issuerCN && subjectCN === issuerCN);
    const fingerprint = forge.md.sha256
      .create()
      .update(forge.asn1.toDer(forge.pki.certificateToAsn1(cert)).getBytes())
      .digest()
      .toHex();
    return {
      status: selfSigned ? 'self-signed' : 'signed',
      publisher: subjectCN,
      issuer: issuerCN,
      fingerprint,
      validFrom: cert.validity.notBefore.toISOString(),
      validTo: cert.validity.notAfter.toISOString(),
    };
  } catch {
    // Marker present but the PKCS#7 wouldn't parse → signed, but we can't classify the signer.
    return { status: 'signed' };
  }
}

/** SHA-256 of the whole `.mcpb`, compared to a registry `fileSha256` (hex or SRI). S17.8. */
export function verifyMcpbIntegrity(bundle: Uint8Array, expected: string): boolean {
  const actualHex = createHash('sha256').update(bundle).digest('hex');
  const want = expected.trim();
  if (/^sha256-/.test(want)) {
    const actualSri = `sha256-${createHash('sha256').update(bundle).digest('base64')}`;
    return actualSri === want;
  }
  return actualHex === want.toLowerCase();
}
