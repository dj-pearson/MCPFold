import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { UsageError } from '@mcpfold/core';
import type { CommandOutput } from '../output/render.js';

/**
 * `mcpfold scaffold-adapter <name>` (S0.5) — generate a new client adapter module + test +
 * fixture skeleton so adding a client is a one-PR contribution. The generated adapter
 * compiles and its test proves the registry picks it up; the printed checklist covers the
 * two edits the human still makes (register the id in CLIENT_IDS and ALL_ADAPTERS).
 */

const NAME_RE = /^[a-z][a-z0-9-]*$/;

export interface ScaffoldDeps {
  writeFile?: (path: string, contents: string) => void;
  exists?: (path: string) => boolean;
  mkdir?: (path: string) => void;
}

export interface ScaffoldAdapterOptions extends ScaffoldDeps {
  name: string;
  /** Path to the packages/adapters directory. */
  adaptersRoot: string;
}

export interface ScaffoldData {
  name: string;
  files: string[];
  checklist: string[];
}

function adapterModule(name: string): string {
  return `import { createMcpServersAdapter } from './shared.js';
import { joinFor, realOsContext } from './paths.js';
import type { ClientId } from '@mcpfold/core';
import type { OsContext } from './types.js';

/**
 * ${name} adapter (scaffolded — TODO: fill in the real per-OS path, root key, and strategy).
 * If ${name} uses the \`mcpServers\` shape this factory is all you need; otherwise implement
 * ClientAdapter directly (see vscode.ts / zed.ts for divergent root keys).
 */
export const ${name}Adapter = createMcpServersAdapter({
  // TODO: add '${name}' to CLIENT_IDS in packages/core/src/schema.ts, then drop this cast.
  id: '${name}' as ClientId,
  secretStrategy: 'shim',
  needsRestart: false,
  // TODO (S17.2): verify ${name}'s remote support. nativeHttp=false shims ALL remotes;
  // nativeOauth=false shims only authenticated ones; fieldShape is how it names the url field.
  remote: { nativeHttp: true, nativeOauth: true, fieldShape: 'url' },
  resolvePath(_scope, _projectPath, ctx: OsContext = realOsContext()) {
    // TODO: return the real ${name} config path for user (and project) scope, per OS.
    return joinFor(ctx, ctx.home, '.${name}', 'mcp.json');
  },
});
`;
}

function adapterTest(name: string): string {
  return `import { afterEach, describe, expect, it } from 'vitest';
import { ${name}Adapter } from '../src/${name}.js';
import { clearAdapters, getAdapter, registerAdapter } from '../src/registry.js';
import type { OsContext } from '../src/types.js';

const ctx: OsContext = { platform: 'linux', home: '/home/dev', env: {} };
afterEach(() => clearAdapters());

describe('${name}Adapter (scaffolded — replace these with real assertions)', () => {
  it('is picked up by the registry', () => {
    registerAdapter(${name}Adapter);
    expect(getAdapter('${name}')).toBe(${name}Adapter);
  });

  it('renders deterministic output with a trailing newline', () => {
    const file = ${name}Adapter.render([], ctx);
    expect(file.contents.endsWith('\\n')).toBe(true);
    // TODO: add a fixture snapshot: await expect(file.contents).toMatchFileSnapshot('fixtures/${name}/mcp.json');
  });
});
`;
}

export function scaffoldAdapter(options: ScaffoldAdapterOptions): CommandOutput<ScaffoldData> {
  const { name, adaptersRoot } = options;
  if (!NAME_RE.test(name)) {
    throw new UsageError(`Invalid adapter name "${name}".`, {
      hint: 'Use a lowercase kebab-case id, e.g. "continue" or "jetbrains-ai".',
    });
  }
  const exists = options.exists ?? existsSync;
  const write = options.writeFile ?? ((p, c) => writeFileSync(p, c, 'utf8'));
  const mkdir = options.mkdir ?? ((p) => mkdirSync(p, { recursive: true }));

  const modulePath = join(adaptersRoot, 'src', `${name}.ts`);
  const testPath = join(adaptersRoot, 'test', `${name}.test.ts`);
  const fixtureDir = join(adaptersRoot, 'test', 'fixtures', name);

  if (!exists(join(adaptersRoot, 'src'))) {
    throw new UsageError(`Adapters package not found at ${adaptersRoot}.`, {
      hint: 'Run this from the mcpfold repo root (packages/adapters must exist).',
    });
  }
  for (const p of [modulePath, testPath]) {
    if (exists(p)) throw new UsageError(`${p} already exists — refusing to overwrite.`);
  }

  mkdir(dirname(modulePath));
  mkdir(dirname(testPath));
  mkdir(fixtureDir);
  write(modulePath, adapterModule(name));
  write(testPath, adapterTest(name));
  write(join(fixtureDir, '.gitkeep'), '');

  const checklist = [
    `Add '${name}' to CLIENT_IDS in packages/core/src/schema.ts`,
    `Add ${name}Adapter to ALL_ADAPTERS in packages/adapters/src/all.ts`,
    `Implement resolvePath (per OS), render, and parse in ${modulePath}`,
    `pnpm --filter @mcpfold/adapters test -u  # write & review the golden fixture`,
  ];

  const human = [
    `Scaffolded the "${name}" adapter:`,
    `  ${modulePath}`,
    `  ${testPath}`,
    `  ${fixtureDir}/`,
    '',
    'Next steps:',
    ...checklist.map((c, i) => `  ${i + 1}. ${c}`),
  ].join('\n');

  return {
    data: { name, files: [modulePath, testPath], checklist },
    human,
  };
}
