/**
 * Doctor check contract (S3.7). Every check returns findings that each name the exact
 * file, the issue, and the fix — no vague "something is wrong".
 */

export type Severity = 'error' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  /** The file the finding is about (canonical config or an on-disk client file). */
  file: string;
  /** Optional JSON path / server name within the file. */
  where?: string;
  message: string;
  /** The concrete fix, as a human-readable instruction. */
  fix: string;
  /**
   * Id of the `mcpfold explain` entry that teaches why this finding matters (E25, S25.5). doctor
   * renders it as a `see: mcpfold explain <id>` pointer. Every id must resolve to a catalog entry
   * (a test enforces no orphans); a finding without one simply shows no pointer.
   */
  explain?: string;
  /**
   * A deterministic, machine-applicable form of `fix` (E25). Present only when the repair is
   * unambiguous — a repair engine (`doctor --fix`, S25.2) can apply it without re-deriving anything
   * from the prose. Ambiguous findings (which version to pin, which scheme to use, arbitrary schema
   * errors) carry no `autofix` and stay advisory. `fix` is always populated regardless.
   */
  autofix?: FixAction;
}

/**
 * The set of deterministic repairs a doctor finding can carry (E25, S25.1). A discriminated union so
 * each variant holds exactly the data needed to apply it — no re-parsing of the `fix` string. Every
 * variant is plain JSON (serializes losslessly) so it survives the `doctor --json` boundary.
 */
export type FixAction = ResyncClientFix | ExtractSecretFix | RewriteTransportFix;

/**
 * Re-fold one client's on-disk file from the canonical config. The blessed, deterministic fix for the
 * VS Code `mcpServers`-vs-`servers` root-key trap, inert curation (a curated server pointed at its real
 * command instead of the `mcpfold run` shim), a malformed client file, and an unpinned/vulnerable
 * `mcp-remote` bridge — every one of which `sync` regenerates correctly and byte-stably. Auto-applicable.
 */
export interface ResyncClientFix {
  kind: 'resync-client';
  /** Canonical profile whose client file is re-rendered. */
  profile: string;
  /** Client id owning that file (for display + adapter lookup). */
  client: string;
  /** Resolved on-disk path being repaired — matches the finding's `file`. */
  path: string;
}

/**
 * Move a hardcoded secret value out of the config into a `${scheme:path}` reference. NOT auto-applicable:
 * it needs a provider choice and moves a value, so it is applied only by the guided S25.3 flow (never
 * under `doctor --fix --yes`). S25.1 populates the descriptor; downstream consumes it.
 */
export interface ExtractSecretFix {
  kind: 'extract-secret';
  /** Canonical server name holding the value. */
  server: string;
  /** Which secret-bearing record the value lives in. */
  field: 'env' | 'auth.headers';
  /** The key within that record. */
  key: string;
  /** The `${env:...}` reference mcpfold suggests by default (the user may pick another provider). */
  suggestedRef: string;
}

/**
 * Rewrite a server's deprecated `sse` transport to `streamable-http` in the canonical config. The edit
 * itself is deterministic, but the target server may not yet speak Streamable HTTP — so this is guided
 * (surfaced for review, never applied under `--yes`), not auto-applicable.
 */
export interface RewriteTransportFix {
  kind: 'rewrite-transport';
  /** Canonical server name whose `transport` is rewritten. */
  server: string;
  from: 'sse';
  to: 'streamable-http';
}

/**
 * True when a fix needs no human decision and can be applied unattended under `doctor --fix --yes`.
 * Guided fixes (extract-secret needs a provider choice; rewrite-transport may break an unsupporting
 * server) return false. Note: unpinned `@latest` carries NO autofix at all — pinning requires resolving
 * a concrete version over the network, which is neither deterministic nor offline, so it stays advisory.
 */
export function isAutoApplicable(action: FixAction): boolean {
  return action.kind === 'resync-client';
}
