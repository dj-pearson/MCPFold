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
  transport: 'streamable-http',
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

  it('embeds the config location as `--cwd` when configDir is provided', async () => {
    // GUI clients (Claude Desktop, etc.) launch MCP servers from an arbitrary working
    // directory; the embedded --cwd is what lets `mcpfold run` find the canonical config.
    const file = await renderWithStrategy(cursorAdapter, [githubSecret], {
      osContext: ctx,
      configDir: '/home/dev/project',
    });
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.github).toEqual({
      command: 'mcpfold',
      args: ['run', 'github', '--cwd', '/home/dev/project'],
    });
  });

  it('keeps PROJECT-scope shims bare — committed client files must stay machine-portable', async () => {
    // The S12.1 team workflow commits project-scope client files and gates them with
    // `sync --check` in CI; an absolute --cwd would make them differ on every machine.
    const file = await renderWithStrategy(
      cursorAdapter,
      [{ ...githubSecret, scope: 'project', projectPath: '/home/dev/project' }],
      { osContext: ctx, configDir: '/home/dev/project' },
    );
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.github.args).toEqual(['run', 'github']);
  });

  it('leaves a secret-free server rendered natively', async () => {
    const file = await renderWithStrategy(cursorAdapter, [plainStdio], { osContext: ctx });
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.playwright.command).toBe('npx');
  });
});

describe('renderWithStrategy — tools directive forces the shim (S5.3)', () => {
  const curated: ResolvedServer = {
    ...plainStdio,
    tools: { mode: 'allow', list: ['browser_click', 'browser_snapshot'] },
  };

  it('shims a secret-less server that carries a tools directive', async () => {
    const file = await renderWithStrategy(cursorAdapter, [curated], { osContext: ctx });
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.playwright).toEqual({
      command: 'mcpfold',
      args: ['run', 'playwright'],
    });
    // The real launch never reaches the client file — curation happens inside `mcpfold run`.
    expect(file.contents).not.toContain('@playwright/mcp');
    expect(file.contents).not.toContain('"tools"');
  });

  it('shims a tools-bearing server on a native-input adapter too', async () => {
    const file = await renderWithStrategy(vscodeAdapter, [{ ...curated, client: 'vscode' }], {
      osContext: ctx,
    });
    const parsed = JSON.parse(file.contents);
    expect(parsed.servers.playwright.command).toBe('mcpfold');
    expect(parsed.servers.playwright.args).toEqual(['run', 'playwright']);
  });

  it('shims a tools-bearing server with env-only refs even under a native-env override (S24.1)', async () => {
    // native-env would let the client resolve the ${env:} ref itself — but curation only runs
    // inside `mcpfold run`, so the tools directive forces the shim regardless of the override.
    const file = await renderWithStrategy(
      cursorAdapter,
      [{ ...curated, env: { TOKEN: '${env:GH_TOKEN}' } }],
      { osContext: ctx, strategyOverride: 'native-env' },
    );
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.playwright).toEqual({ command: 'mcpfold', args: ['run', 'playwright'] });
    // The native-env placeholder never reaches the file — the launch goes through the proxy.
    expect(file.contents).not.toContain('GH_TOKEN');
  });

  it('honors an explicit secretStrategy "shim" even with zero secret refs', async () => {
    const file = await renderWithStrategy(
      cursorAdapter,
      [{ ...plainStdio, secretStrategy: 'shim' }],
      { osContext: ctx },
    );
    expect(JSON.parse(file.contents).mcpServers.playwright).toEqual({
      command: 'mcpfold',
      args: ['run', 'playwright'],
    });
  });

  it('still renders a server with no tools and no secret directly', async () => {
    const file = await renderWithStrategy(cursorAdapter, [plainStdio], { osContext: ctx });
    const parsed = JSON.parse(file.contents);
    expect(parsed.mcpServers.playwright.command).toBe('npx');
    expect(parsed.mcpServers.playwright.args).toEqual(['-y', '@playwright/mcp@latest']);
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
