import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  launchedNamespace,
  launchedPackage,
  parsePolicy,
  type McpfoldPolicy,
  type PolicyTarget,
} from '../src/policy.js';

const stdio = (name: string, args: string[], command = 'npx'): PolicyTarget => ({
  name,
  transport: 'stdio',
  command,
  args,
});
const remote = (name: string, url: string): PolicyTarget => ({ name, transport: 'http', url });

const policy = (p: Partial<McpfoldPolicy>): McpfoldPolicy => ({
  version: 1,
  mode: 'permissive',
  allow: [],
  deny: [],
  ...p,
});

describe('launchedPackage / launchedNamespace (S18.3)', () => {
  it('extracts the npx package spec and its namespace', () => {
    expect(launchedPackage({ command: 'npx', args: ['-y', '@acme/mcp@1.2.3'] })).toBe(
      '@acme/mcp@1.2.3',
    );
    expect(launchedNamespace({ command: 'npx', args: ['-y', '@acme/mcp@1.2.3'] })).toBe('@acme');
    expect(launchedNamespace({ command: 'npx', args: ['-y', 'io.github.foo/bar@2.0.0'] })).toBe(
      'io.github.foo',
    );
    expect(launchedPackage({ command: 'npx', args: ['mcp-remote', 'https://x'] })).toBe(
      'mcp-remote',
    );
    expect(launchedNamespace({ command: 'npx', args: ['-y', 'mcp-remote'] })).toBeUndefined();
    expect(launchedPackage({ command: 'my-server', args: [] })).toBeUndefined();
  });
});

describe('evaluatePolicy — deny rules (S18.3)', () => {
  it('denies by name glob, with rule provenance', () => {
    const d = evaluatePolicy(
      remote('evil-server', 'https://x'),
      policy({ deny: [{ match: 'name', pattern: 'evil-*', reason: 'blocked vendor' }] }),
    );
    expect(d.allowed).toBe(false);
    expect(d.rule?.match).toBe('name');
    expect(d.reason).toContain('blocked vendor');
  });

  it('denies by package prefix', () => {
    const d = evaluatePolicy(
      stdio('x', ['-y', '@evilcorp/mcp@1.0.0']),
      policy({ deny: [{ match: 'package', pattern: '@evilcorp/' }] }),
    );
    expect(d.allowed).toBe(false);
    expect(d.rule?.match).toBe('package');
  });

  it('denies by namespace', () => {
    const d = evaluatePolicy(
      stdio('x', ['-y', '@evilcorp/mcp@1.0.0']),
      policy({ deny: [{ match: 'namespace', pattern: '@evilcorp' }] }),
    );
    expect(d.allowed).toBe(false);
  });

  it('denies by url glob', () => {
    const d = evaluatePolicy(
      remote('x', 'https://api.evil.com/mcp'),
      policy({ deny: [{ match: 'url', pattern: 'https://*.evil.com/*' }] }),
    );
    expect(d.allowed).toBe(false);
    expect(d.rule?.match).toBe('url');
  });

  it('permits a server no deny rule matches (permissive)', () => {
    const d = evaluatePolicy(
      stdio('ok', ['-y', '@good/mcp@1.0.0']),
      policy({ deny: [{ match: 'namespace', pattern: '@evilcorp' }] }),
    );
    expect(d.allowed).toBe(true);
    expect(d.reason).toContain('no deny rule');
  });
});

describe('evaluatePolicy — strict allow-list mode (S18.3)', () => {
  const strict = policy({
    mode: 'strict',
    allow: [
      { match: 'namespace', pattern: '@modelcontextprotocol' },
      { match: 'name', pattern: 'github' },
    ],
  });

  it('permits a server matching an allow rule', () => {
    expect(
      evaluatePolicy(stdio('x', ['-y', '@modelcontextprotocol/server@1.0.0']), strict).allowed,
    ).toBe(true);
    expect(evaluatePolicy(remote('github', 'https://api.github.com/mcp'), strict).allowed).toBe(
      true,
    );
  });

  it('denies a server matching no allow rule, naming the allow-list', () => {
    const d = evaluatePolicy(stdio('random', ['-y', '@other/mcp@1.0.0']), strict);
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('allow-list');
  });
});

describe('evaluatePolicy — precedence: deny wins over allow (S18.3)', () => {
  it('denies even when an allow rule also matches', () => {
    const p = policy({
      mode: 'strict',
      allow: [{ match: 'namespace', pattern: '@acme' }],
      deny: [{ match: 'name', pattern: 'acme-legacy' }],
    });
    const d = evaluatePolicy(stdio('acme-legacy', ['-y', '@acme/legacy@1.0.0']), p);
    expect(d.allowed).toBe(false);
    expect(d.rule?.match).toBe('name');
  });
});

describe('parsePolicy (S18.3)', () => {
  it('parses a valid policy and defaults mode/allow/deny', () => {
    const r = parsePolicy(JSON.stringify({ version: 1, deny: [{ match: 'name', pattern: 'x' }] }));
    expect(r.ok).toBe(true);
    expect(r.policy?.mode).toBe('permissive');
    expect(r.policy?.allow).toEqual([]);
  });

  it('rejects invalid JSON and invalid shapes with a clear error', () => {
    expect(parsePolicy('{not json').ok).toBe(false);
    const bad = parsePolicy(JSON.stringify({ version: 2 }));
    expect(bad.ok).toBe(false);
    expect(bad.error).toContain('version');
    const badRule = parsePolicy(
      JSON.stringify({ version: 1, deny: [{ match: 'nope', pattern: 'x' }] }),
    );
    expect(badRule.ok).toBe(false);
  });

  it('rejects unknown top-level keys (strict)', () => {
    expect(parsePolicy(JSON.stringify({ version: 1, extra: true })).ok).toBe(false);
  });
});
