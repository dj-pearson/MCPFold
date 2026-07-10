import { describe, expect, it } from 'vitest';
import { buildCompatMatrix, renderMatrixMarkdown } from '../compat/matrix.js';
import type { CompatSample } from '../compat/check.js';
import { cursorAdapter } from '../src/cursor.js';
import { claudeDesktopAdapter } from '../src/claude-desktop.js';
import { gooseAdapter } from '../src/goose.js';

const sample = (client: string, over: Partial<CompatSample> = {}): CompatSample => ({
  client,
  source: { type: 'captured', capturedAt: '2026-07-09' },
  rootKeys: [],
  serverContainer: 'mcpServers',
  entryKeys: [],
  ...over,
});

describe('compat matrix (S19.5)', () => {
  it('derives per-client capability rows from adapters + samples', () => {
    const rows = buildCompatMatrix([cursorAdapter, claudeDesktopAdapter, gooseAdapter], {
      cursor: sample('cursor'),
      'claude-desktop': sample('claude-desktop'),
      goose: sample('goose', { format: 'yaml' }),
    });
    const byId = new Map(rows.map((r) => [r.client, r]));

    // Cursor: project scope, native url, native-env available.
    const cursor = byId.get('cursor')!;
    expect(cursor.scopes).toBe('user, project');
    expect(cursor.transport).toContain('url');
    expect(cursor.secretStrategy).toContain('native-env available');
    expect(cursor.lastVerified).toBe('2026-07-09');

    // Claude Desktop: user-only, stdio-only remote → mcp-remote shim, no native-env.
    const cd = byId.get('claude-desktop')!;
    expect(cd.scopes).toBe('user');
    expect(cd.transport).toBe('mcp-remote shim');
    expect(cd.secretStrategy).toBe('shim');

    // Goose: YAML format surfaced from the sample.
    expect(byId.get('goose')!.format).toBe('yaml');
  });

  it('renders a dated Markdown table', () => {
    const md = renderMatrixMarkdown(
      [
        {
          client: 'cursor',
          format: 'json',
          scopes: 'user, project',
          transport: 'native `url`',
          secretStrategy: 'shim (native-env available)',
          lastVerified: '2026-07-09',
        },
      ],
      '2026-07-09',
    );
    expect(md).toContain('# Client compatibility matrix');
    expect(md).toContain('_Generated 2026-07-09 · 1 clients._');
    expect(md).toContain('| cursor | json | user, project |');
    expect(md.endsWith('\n')).toBe(true);
  });
});
