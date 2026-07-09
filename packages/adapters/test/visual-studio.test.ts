import { describe, expect, it } from 'vitest';
import { visualStudioAdapter } from '../src/visual-studio.js';
import { cursorAdapter } from '../src/cursor.js';
import { vscodeAdapter } from '../src/vscode.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('visualStudioAdapter (S19.1)', () => {
  it('reuses the VS Code dialect: native-input strategy, no restart', () => {
    expect(visualStudioAdapter.id).toBe('visual-studio');
    expect(visualStudioAdapter.secretStrategy).toBe('native-input');
    expect(visualStudioAdapter.needsRestart).toBe(false);
  });

  it('resolves user + solution paths per OS to VS-owned files', () => {
    expect(visualStudioAdapter.resolvePath('user', undefined, linux)).toBe('/home/dev/.mcp.json');
    expect(visualStudioAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\.mcp.json',
    );
    expect(visualStudioAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/.mcp.json',
    );
    expect(visualStudioAdapter.resolvePath('workspace', '/repos/x', linux)).toBe(
      '/repos/x/.mcp.json',
    );
  });

  it('project scope requires a solution path', () => {
    expect(() => visualStudioAdapter.resolvePath('project', undefined, linux)).toThrow(
      /solution scope requires/,
    );
  });

  it('never writes a file owned by the vscode or cursor adapters', () => {
    const forProject = (scope: 'user' | 'project') =>
      visualStudioAdapter.resolvePath(scope, '/repos/x', linux);
    const vsFiles = [forProject('user'), forProject('project')];
    const vscodeFile = vscodeAdapter.resolvePath('project', '/repos/x', linux);
    const cursorFile = cursorAdapter.resolvePath('project', '/repos/x', linux);
    expect(vsFiles).not.toContain(vscodeFile); // .vscode/mcp.json is vscode-owned
    expect(vsFiles).not.toContain(cursorFile); // .cursor/mcp.json is cursor-owned
  });

  it('renders the `servers` root (not mcpServers) with prompted inputs, and round-trips', () => {
    const file = visualStudioAdapter.render(sampleServers('visual-studio'), linux);
    // VS Code dialect: root key is `servers`, and bearer tokens become prompted `inputs`.
    expect(file.contents).toContain('"servers"');
    expect(file.contents).not.toContain('"mcpServers"');
    expect(file.contents).toContain('"inputs"');
    expect(file.contents).toContain('${input:');
    // Writes the VS-owned user file, not .vscode/mcp.json.
    expect(file.path).toBe('/home/dev/.mcp.json');

    const parsed = visualStudioAdapter.parse(file.contents);
    expect(parsed.servers?.playwright).toEqual({
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      env: { HEADLESS: 'true' },
      tags: [],
    });
    expect(parsed.servers?.github?.transport).toBe('http');
  });
});
