/**
 * The `mcp-remote` bridge spec (S17.1).
 *
 * `mcp-remote` bridges a client that can't natively speak authenticated remote MCP to an
 * http/sse server. Versions 0.0.5–0.1.15 carried a CVSS 9.6 OS-command-injection RCE
 * (CVE-2025-6514: a malicious server's OAuth `authorization_endpoint` could execute arbitrary
 * commands on the client host), fixed in 0.1.16. Because mcpfold both *spawns* the bridge (the
 * `run` shim) and *writes* it into client configs (the Windsurf adapter), an unpinned
 * `npx -y mcp-remote` would let npm resolve whatever's newest — including a yanked/compromised
 * build — and violates our own "no unpinned @latest where pin semantics apply" rule.
 *
 * Every emission site MUST use {@link MCP_REMOTE_SPEC}. `doctor` uses {@link findMcpRemoteArg} +
 * {@link isVulnerableMcpRemoteVersion} to flag unpinned or below-floor references it finds in
 * existing client configs. NEVER lower {@link MCP_REMOTE_MIN_VERSION} below the CVE fix.
 */

/** The npm package name of the bridge. */
export const MCP_REMOTE_PACKAGE = 'mcp-remote';

/** CVE-2025-6514 fix floor — the lowest non-vulnerable version. Do not lower this. */
export const MCP_REMOTE_MIN_VERSION = '0.1.16';

/** The exact version mcpfold pins, spawns, and writes (current known-good upstream). */
export const MCP_REMOTE_PINNED_VERSION = '0.1.38';

/** The `name@version` spec emitted at every call site: `mcp-remote@0.1.38`. */
export const MCP_REMOTE_SPEC = `${MCP_REMOTE_PACKAGE}@${MCP_REMOTE_PINNED_VERSION}`;

/**
 * Locate an `mcp-remote` reference in an npx-style args array (e.g. `['-y','mcp-remote@0.1.38',url]`
 * or the legacy unpinned `['-y','mcp-remote',url]`). Returns its index and parsed version (null
 * when unpinned), or null if the array contains no mcp-remote token.
 */
export function findMcpRemoteArg(
  args: readonly string[],
): { index: number; version: string | null } | null {
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === MCP_REMOTE_PACKAGE) return { index: i, version: null };
    if (a && a.startsWith(`${MCP_REMOTE_PACKAGE}@`)) {
      return { index: i, version: a.slice(MCP_REMOTE_PACKAGE.length + 1) };
    }
  }
  return null;
}

/** Compare two dotted numeric versions (pre-release/build metadata ignored). -1 | 0 | 1. */
export function compareVersions(a: string, b: string): number {
  const norm = (v: string) =>
    v
      .replace(/^[^\d]*/, '') // drop a leading range operator like ^ or ~
      .split(/[-+]/)[0]! // drop pre-release / build
      .split('.')
      .map((n) => parseInt(n, 10) || 0);
  const pa = norm(a);
  const pb = norm(b);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d < 0 ? -1 : 1;
  }
  return 0;
}

/**
 * True if an mcp-remote version reference is unsafe to spawn: unpinned (null), a non-exact range
 * (`^0.1.16`, `~0.1`, `latest`), or below the CVE-2025-6514 fix floor. An unpinned or ranged spec
 * counts as unsafe because npm can resolve it to a vulnerable build.
 */
export function isVulnerableMcpRemoteVersion(version: string | null | undefined): boolean {
  if (!version) return true;
  // Only an exact x.y.z (optionally with pre-release) is considered pinned.
  if (!/^\d+\.\d+\.\d+([-+].*)?$/.test(version)) return true;
  return compareVersions(version, MCP_REMOTE_MIN_VERSION) < 0;
}
