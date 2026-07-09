import { describe, expect, it } from 'vitest';
import type { ResolvedServer } from '@mcpfold/core';
import { createMcpServersAdapter, type OsContext } from '@mcpfold/adapters';
import { cursorAdapter } from '@mcpfold/adapters';
import { vscodeAdapter } from '@mcpfold/adapters';
import { InlineNotIgnoredError, renderWithStrategy } from '../src/sync/strategy.js';

const ctx: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
const SECRET_REF = '${infisical:dev/mcp/GITHUB_PAT}';

const githubSecret: ResolvedServer = {
  name: 'github',
  transport: 'http',
  url: 'https://api.githubcopilot.com/mcp/',
  auth: { type: 'bearer', token: SECRET_REF },
  tags: ['work'],
  client: 'cursor',
  scope: 'user',
};

const plainStdio: ResolvedServer = {
  name: 'playwright',
  transport: 'stdio',
  command: 'npx',
  args: ['-y', '@playwright/mcp@latest'],
  tags: ['code'],
  client: 'cursor',
  scope: 'user',
};

describe('renderWithStrategy — shim (S4.6)', () => {
  it('rewrites a secret-bearing server to `mcpfold run <name>` with NO token on disk', async () => {
    const file = await renderWithStrategy(cursorAdapter, [githubSecret], { osContext: ctx });
    expect(file.contents).not.toContain('GITHUB_PAT');
    expect(file.contents).not.toContain('infisical');
    expect(file.contents).not.toContain('api.githubcopilot.com');
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.github).toEqual({ command: 'mcpfold', args: ['run', 'github'] });
  });

  it('leaves a secret-free server rendered natively', async () => {
    const file = await renderWithStrategy(cursorAdapter, [plainStdio], { osContext: ctx });
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.playwright.command).toBe('npx');
  });
});

describe('renderWithStrategy — pin at fold time (S8.3)', () => {
  const pinned: ResolvedServer = { ...plainStdio, pin: '1.4.2' };

  it('rewrites @latest to the pinned version in the rendered client file', async () => {
    const file = await renderWithStrategy(cursorAdapter, [pinned], { osContext: ctx });
    expect(file.contents).toContain('@playwright/mcp@1.4.2');
    expect(file.contents).not.toContain('@playwright/mcp@latest');
    expect(JSON.parse(file.contents).mcpServers.playwright.args).toEqual([
      '-y',
      '@playwright/mcp@1.4.2',
    ]);
  });

  it('leaves @latest untouched when no pin is declared', async () => {
    const file = await renderWithStrategy(cursorAdapter, [plainStdio], { osContext: ctx });
    expect(file.contents).toContain('@playwright/mcp@latest');
  });
});

describe('renderWithStrategy — native-input (S4.6)', () => {
  it('emits VS Code ${input:} indirection, never a raw token', async () => {
    const file = await renderWithStrategy(vscodeAdapter, [{ ...githubSecret, client: 'vscode' }], {
      osContext: ctx,
    });
    expect(file.contents).not.toContain('GITHUB_PAT');
    expect(file.contents).not.toContain('infisical');
    expect(file.contents).toContain('${input:github-token}');
    expect(file.contents).toContain('"inputs"');
  });
});

describe('renderWithStrategy — inline (S4.6)', () => {
  const inlineAdapter = createMcpServersAdapter({
    id: 'cursor',
    secretStrategy: 'inline',
    remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
    resolvePath: () => '/home/dev/.cursor/mcp.json',
  });
  const fakeResolve = async (servers: ResolvedServer[]): Promise<ResolvedServer[]> =>
    servers.map((s) =>
      s.auth?.token ? { ...s, auth: { ...s.auth, token: 'RESOLVED_VALUE_XYZ' } } : s,
    );

  it('writes the resolved value ONLY when the target is gitignored', async () => {
    const file = await renderWithStrategy(inlineAdapter, [githubSecret], {
      osContext: ctx,
      resolve: fakeResolve,
      isGitignored: () => true,
      onWarn: () => {},
    });
    expect(file.contents).toContain('RESOLVED_VALUE_XYZ');
  });

  it('refuses (and warns) when the target is NOT gitignored', async () => {
    let warned = false;
    await expect(
      renderWithStrategy(inlineAdapter, [githubSecret], {
        osContext: ctx,
        resolve: fakeResolve,
        isGitignored: () => false,
        onWarn: () => {
          warned = true;
        },
      }),
    ).rejects.toBeInstanceOf(InlineNotIgnoredError);
    expect(warned).toBe(false); // it refuses before warning/writing
  });

  it('errors clearly if inline is used with no resolver', async () => {
    await expect(
      renderWithStrategy(inlineAdapter, [githubSecret], { osContext: ctx }),
    ).rejects.toThrow(/requires a secret resolver/);
  });
});
