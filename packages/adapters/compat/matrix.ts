import type { ClientAdapter, OsContext } from '../src/types.js';
import type { CompatSample } from './check.js';

/**
 * Public compat matrix (S19.5). Derives a per-client capability row from each adapter plus its
 * captured sample, and renders it as a dated Markdown table (docs) and a JSON payload (site). The
 * "last verified" date comes straight from the compat harness samples, so the published matrix is
 * evidence — it moves only when the harness re-captures against a real client format.
 */

export interface CompatMatrixRow {
  client: string;
  /** On-disk config format. */
  format: 'json' | 'yaml' | 'toml';
  /** Scopes the adapter can fold to. */
  scopes: string;
  /** How the client takes a remote server. */
  transport: string;
  /** The adapter's default secret strategy, plus whether `native-env` is available. */
  secretStrategy: string;
  /** Date the harness last verified this client's format (from the sample). */
  lastVerified: string;
}

const linuxCtx: OsContext = { platform: 'linux', home: '/home/dev', env: {} };

/** Human transport label from an adapter's remote capability. */
function transportLabel(adapter: ClientAdapter): string {
  const { fieldShape, nativeHttp, nativeOauth } = adapter.remote;
  if (fieldShape === 'shim' || !nativeHttp) return 'mcp-remote shim';
  const base = `native \`${fieldShape}\``;
  return nativeOauth ? base : `${base} (shim if authed)`;
}

/** Does the adapter fold to a project scope, or user only? Probed against a fixed context. */
function scopesLabel(adapter: ClientAdapter): string {
  try {
    adapter.resolvePath('project', '/home/dev/repo', linuxCtx);
    return 'user, project';
  } catch {
    return 'user';
  }
}

export function buildCompatMatrix(
  adapters: readonly ClientAdapter[],
  samplesByClient: Record<string, CompatSample>,
): CompatMatrixRow[] {
  return adapters
    .map((adapter) => {
      const sample = samplesByClient[adapter.id];
      const nativeEnv = adapter.envInterpolation
        ? `${adapter.secretStrategy} (native-env available)`
        : adapter.secretStrategy;
      return {
        client: adapter.id,
        format: sample?.format ?? 'json',
        scopes: scopesLabel(adapter),
        transport: transportLabel(adapter),
        secretStrategy: nativeEnv,
        lastVerified: sample?.source.capturedAt ?? '—',
      };
    })
    .sort((a, b) => a.client.localeCompare(b.client));
}

/** Render the matrix as a dated Markdown page (the docs artifact, also served on the site). */
export function renderMatrixMarkdown(rows: CompatMatrixRow[], generatedAt: string): string {
  const header = [
    '# Client compatibility matrix',
    '',
    'Generated from the mcpfold compat harness — the **last-verified** dates are the harness sample',
    'capture dates, not hand-edited. Drift is caught weekly (see',
    '[adapter coverage](./coverage.md) and `.github/workflows/adapter-compat.yml`).',
    '',
    `_Generated ${generatedAt} · ${rows.length} clients._`,
    '',
    '| Client | Format | Scopes | Remote transport | Secret strategy | Last verified |',
    '| ------ | ------ | ------ | ---------------- | --------------- | ------------- |',
  ];
  const body = rows.map(
    (r) =>
      `| ${r.client} | ${r.format} | ${r.scopes} | ${r.transport} | ${r.secretStrategy} | ${r.lastVerified} |`,
  );
  return `${[...header, ...body].join('\n')}\n`;
}
