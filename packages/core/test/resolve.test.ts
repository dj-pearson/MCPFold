import { describe, expect, it } from 'vitest';
import { loadConfigOrThrow } from '../src/load.js';
import {
  resolveAll,
  resolveProfile,
  resolveProfileWithDiagnostics,
  UnknownProfileError,
} from '../src/resolve.js';
import { SPEC_EXAMPLE_JSONC } from './fixtures/spec-example.js';

const config = loadConfigOrThrow(SPEC_EXAMPLE_JSONC);

describe('resolveProfile (S1.4)', () => {
  it('folds servers by tag intersection (spec §4 profiles)', () => {
    // work-cursor includes ["work","code"] → github(work,code), supabase(work), playwright(code)
    const workCursor = resolveProfile(config, 'work-cursor').map((s) => s.name);
    expect(workCursor).toEqual(['github', 'playwright', 'supabase']); // stable sorted-by-key

    // projectX includes ["code"] → github(work,code) + playwright(code)
    const projectX = resolveProfile(config, 'projectX').map((s) => s.name);
    expect(projectX).toEqual(['github', 'playwright']);

    // personal-desktop includes ["personal"] → no server carries it → empty
    expect(resolveProfile(config, 'personal-desktop')).toEqual([]);
  });

  it('carries name, client, scope, projectPath, and the tools directive', () => {
    const [github] = resolveProfile(config, 'projectX');
    expect(github?.name).toBe('github');
    expect(github?.client).toBe('claude-code');
    expect(github?.scope).toBe('project');
    expect(github?.projectPath).toBe('~/repos/projectX');
    expect(github?.tools).toEqual({
      mode: 'allow',
      list: ['create_issue', 'get_pull_request', 'search_code'],
    });
  });

  // S22.9: a server's SRI integrity must survive resolution so it can reach the fetch/install layer.
  it('carries a server integrity hash through resolution', () => {
    const cfg = loadConfigOrThrow(
      '{ "version": 2, "servers": { "s": { "transport": "stdio", "command": "npx", "pin": "1.0.0", "integrity": "sha512-abc123", "tags": ["t"] } }, "profiles": { "p": { "client": "cursor", "scope": "user", "include": ["t"] } } }',
    );
    const [s] = resolveProfile(cfg, 'p');
    expect(s?.integrity).toBe('sha512-abc123');
  });

  it('keeps secrets as references (not resolved at this stage)', () => {
    const [github] = resolveProfile(config, 'work-cursor');
    expect(github?.auth?.token).toBe('${infisical:dev/mcp/GITHUB_PAT}');
  });

  it('is deterministic — stable ordering by server key', () => {
    const a = resolveProfile(config, 'work-cursor').map((s) => s.name);
    const b = resolveProfile(config, 'work-cursor').map((s) => s.name);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
  });

  it('throws a descriptive UnknownProfileError for an unknown profile', () => {
    expect(() => resolveProfile(config, 'nope')).toThrow(UnknownProfileError);
    try {
      resolveProfile(config, 'nope');
    } catch (e) {
      expect((e as Error).message).toContain('Available profiles');
      expect((e as Error).message).toContain('work-cursor');
    }
  });
});

describe('resolveProfileWithDiagnostics (S1.4)', () => {
  it('flags an empty-intersection profile and its unmatched tags', () => {
    const { servers, diagnostics } = resolveProfileWithDiagnostics(config, 'personal-desktop');
    expect(servers).toEqual([]);
    expect(diagnostics.empty).toBe(true);
    expect(diagnostics.unmatchedTags).toEqual(['personal']);
  });

  it('reports no unmatched tags for a fully-satisfied profile', () => {
    const { diagnostics } = resolveProfileWithDiagnostics(config, 'work-cursor');
    expect(diagnostics.empty).toBe(false);
    expect(diagnostics.unmatchedTags).toEqual([]);
  });
});

describe('resolveAll (S1.4)', () => {
  it('resolves every profile, keyed and stably ordered', () => {
    const all = resolveAll(config);
    expect(Object.keys(all)).toEqual([
      'personal-desktop',
      'projectX',
      'review-vscode',
      'work-cursor',
    ]);
    expect(all['review-vscode']?.map((s) => s.name)).toEqual(['github', 'playwright', 'supabase']);
  });
});
