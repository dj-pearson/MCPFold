import { describe, expect, it } from 'vitest';
import {
  evaluatePolicy,
  namespaceOf,
  packageSpecOf,
  parsePolicy,
  ruleMatches,
  type Policy,
} from '../src/policy.js';

const stdio = (name: string, command: string, args: string[] = []) => ({
  name,
  transport: 'stdio' as const,
  command,
  args,
});
const remote = (name: string, url: string) => ({
  name,
  transport: 'streamable-http' as const,
  url,
});

describe('policy matchers (S18.3)', () => {
  it('extracts the package spec from a runner invocation, skipping flags', () => {
    expect(
      packageSpecOf(stdio('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem', '.'])),
    ).toBe('@modelcontextprotocol/server-filesystem');
    expect(packageSpecOf(stdio('pw', 'npx', ['-y', '@playwright/mcp@latest']))).toBe(
      '@playwright/mcp@latest',
    );
    expect(packageSpecOf(stdio('d', 'pnpm', ['dlx', 'some-mcp']))).toBe('some-mcp');
    // Non-runner command → the command itself is the package/binary.
    expect(packageSpecOf(stdio('b', '/usr/local/bin/my-mcp'))).toBe('/usr/local/bin/my-mcp');
    // Remotes have no package.
    expect(packageSpecOf(remote('gh', 'https://api.githubcopilot.com/mcp/'))).toBeNull();
  });

  it('derives the @scope namespace, versionless', () => {
    expect(namespaceOf('@modelcontextprotocol/server-github')).toBe('@modelcontextprotocol');
    expect(namespaceOf('@playwright/mcp@latest')).toBe('@playwright');
    expect(namespaceOf('left-pad')).toBeNull();
  });

  it('matches by name, package prefix, namespace, and url glob', () => {
    const fs = stdio('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem']);
    expect(ruleMatches({ name: 'fs' }, fs)).toBe(true);
    expect(ruleMatches({ name: 'other' }, fs)).toBe(false);
    expect(ruleMatches({ package: '@modelcontextprotocol/server-file' }, fs)).toBe(true); // prefix
    expect(ruleMatches({ namespace: '@modelcontextprotocol' }, fs)).toBe(true);
    expect(ruleMatches({ namespace: '@evil' }, fs)).toBe(false);

    const gh = remote('gh', 'https://api.githubcopilot.com/mcp/');
    expect(ruleMatches({ url: 'https://*.githubcopilot.com/*' }, gh)).toBe(true);
    expect(ruleMatches({ url: 'https://evil.example/*' }, gh)).toBe(false);
  });

  it('a rule with multiple matchers is an AND', () => {
    const fs = stdio('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem']);
    expect(ruleMatches({ namespace: '@modelcontextprotocol', name: 'fs' }, fs)).toBe(true);
    expect(ruleMatches({ namespace: '@modelcontextprotocol', name: 'nope' }, fs)).toBe(false);
  });
});

describe('policy evaluation (S18.3)', () => {
  const fs = stdio('fs', 'npx', ['-y', '@modelcontextprotocol/server-filesystem']);
  const evil = stdio('evil', 'npx', ['-y', '@evil/backdoor']);

  it('permissive: only denied servers are blocked; deny wins over allow', () => {
    const policy: Policy = parsePolicy({
      version: 1,
      mode: 'permissive',
      allow: [{ namespace: '@evil' }], // even if allow-listed…
      deny: [{ namespace: '@evil', description: 'unreviewed vendor' }], // …deny wins
    });
    expect(evaluatePolicy(policy, fs).allowed).toBe(true); // not denied → permitted
    const d = evaluatePolicy(policy, evil);
    expect(d.allowed).toBe(false);
    expect(d.effect).toBe('deny');
    expect(d.reason).toContain('unreviewed vendor');
  });

  it('strict: a server must match an allow rule (and no deny rule)', () => {
    const policy: Policy = parsePolicy({
      version: 1,
      mode: 'strict',
      allow: [{ namespace: '@modelcontextprotocol' }],
    });
    expect(evaluatePolicy(policy, fs).allowed).toBe(true);
    const d = evaluatePolicy(policy, evil);
    expect(d.allowed).toBe(false);
    expect(d.effect).toBe('not-allowlisted');
  });

  it('strict + explicit deny of an allow-listed server: deny still wins', () => {
    const policy: Policy = parsePolicy({
      version: 1,
      mode: 'strict',
      allow: [{ namespace: '@modelcontextprotocol' }],
      deny: [{ name: 'fs' }],
    });
    expect(evaluatePolicy(policy, fs).effect).toBe('deny');
  });

  it('defaults mode to permissive', () => {
    const policy = parsePolicy({ version: 1, deny: [{ name: 'evil' }] });
    expect(policy.mode).toBe('permissive');
    expect(evaluatePolicy(policy, fs).allowed).toBe(true);
  });

  it('rejects a rule with no matcher and an unknown key', () => {
    expect(() => parsePolicy({ version: 1, deny: [{ description: 'x' }] })).toThrow();
    expect(() => parsePolicy({ version: 1, deny: [{ name: 'x', bogus: 1 }] })).toThrow();
  });
});
