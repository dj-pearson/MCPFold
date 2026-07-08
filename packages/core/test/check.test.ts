import { describe, expect, it } from 'vitest';
import { checkRendered, hasDrift } from '../src/check.js';

const rendered = [
  { path: '/home/u/.cursor/mcp.json', contents: '{\n  "a": 1\n}\n' },
  { path: '/home/u/.vscode/mcp.json', contents: '{\n  "b": 2\n}\n' },
];

describe('checkRendered (S0.8)', () => {
  it('classifies each file as ok / drift / missing without writing', () => {
    const disk: Record<string, string> = {
      '/home/u/.cursor/mcp.json': '{\n  "a": 1\n}\n', // identical → ok
      '/home/u/.vscode/mcp.json': '{\n  "b": 999\n}\n', // different → drift
      // vscode missing? no — present but drifted; add a third missing case:
    };
    const results = checkRendered(rendered, (p) => disk[p]);
    expect(results).toEqual([
      { path: '/home/u/.cursor/mcp.json', status: 'ok' },
      { path: '/home/u/.vscode/mcp.json', status: 'drift' },
    ]);
  });

  it('reports missing when the on-disk file does not exist', () => {
    const results = checkRendered(rendered, () => undefined);
    expect(results.every((r) => r.status === 'missing')).toBe(true);
  });

  it('hasDrift is false only when every file is ok (→ exit 0)', () => {
    const clean = checkRendered(rendered, (p) => rendered.find((f) => f.path === p)?.contents);
    expect(hasDrift(clean)).toBe(false);

    const drifted = checkRendered(rendered, () => '{\n  "x": 0\n}\n');
    expect(hasDrift(drifted)).toBe(true);
  });
});
