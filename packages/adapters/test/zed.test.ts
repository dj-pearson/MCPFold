import { describe, expect, it } from 'vitest';
import { zedAdapter } from '../src/zed.js';
import { sampleServers } from './fixtures/servers.js';
import type { OsContext } from '../src/types.js';

const linux: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const win: OsContext = { platform: 'win32', home: 'C:\\Users\\dev', env: {} };

describe('zedAdapter (S2.7)', () => {
  it('uses root key `context_servers` (the divergence), no restart', async () => {
    expect(zedAdapter.needsRestart).toBe(false);
    const file = zedAdapter.render(sampleServers('zed'), linux);
    const parsed = JSON.parse(file.contents) as Record<string, unknown>;
    expect('context_servers' in parsed).toBe(true);
    expect('mcpServers' in parsed).toBe(false);
    await expect(file.contents).toMatchFileSnapshot('fixtures/zed/settings.json');
  });

  it('resolves settings path per OS', () => {
    expect(zedAdapter.resolvePath('user', undefined, linux)).toBe(
      '/home/dev/.config/zed/settings.json',
    );
    expect(zedAdapter.resolvePath('user', undefined, win)).toBe(
      'C:\\Users\\dev\\AppData\\Roaming\\Zed\\settings.json',
    );
  });

  it('resolves and renders a project-scope .zed/settings.json (S19.3)', () => {
    expect(zedAdapter.resolvePath('project', '/repos/x', linux)).toBe(
      '/repos/x/.zed/settings.json',
    );
    expect(() => zedAdapter.resolvePath('project', undefined, linux)).toThrow(/project path/);
    const projectServers = sampleServers('zed', 'project', '/repos/x');
    const file = zedAdapter.render(projectServers, linux);
    expect(file.path).toBe('/repos/x/.zed/settings.json');
    const parsed = JSON.parse(file.contents) as Record<string, unknown>;
    expect('context_servers' in parsed).toBe(true);
  });

  it('parses context_servers back to canonical', () => {
    const file = zedAdapter.render(sampleServers('zed'), linux);
    expect(zedAdapter.parse(file.contents).servers?.playwright?.command).toBe('npx');
  });

  // S22.2 (BLOCKER): ~/.config/zed/settings.json is ALL of the user's editor settings; a sync must
  // replace only `context_servers` and preserve theme, fonts, keymap, and comments.
  it('merges into settings.json — preserves editor settings and comments', () => {
    const existing = [
      '{',
      '  // my editor',
      '  "theme": "One Dark",',
      '  "buffer_font_size": 15,',
      '  "context_servers": { "stale": { "command": "old" } }',
      '}',
      '',
    ].join('\n');
    const file = zedAdapter.render(sampleServers('zed'), linux, existing);
    expect(file.contents).toContain('// my editor');
    const doc = JSON.parse(file.contents.replace(/^\s*\/\/.*$/gm, '')) as {
      theme: string;
      buffer_font_size: number;
      context_servers: Record<string, unknown>;
    };
    expect(doc.theme).toBe('One Dark');
    expect(doc.buffer_font_size).toBe(15);
    expect(Object.keys(doc.context_servers).sort()).toEqual(['github', 'playwright']);
    expect(doc.context_servers.stale).toBeUndefined();
  });
});
