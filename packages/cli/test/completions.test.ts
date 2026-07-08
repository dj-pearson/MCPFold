import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { buildProgram } from '../src/cli.js';
import {
  buildSpec,
  completionScript,
  completionValues,
  SHELLS,
} from '../src/commands/completions.js';

const spec = buildSpec(buildProgram().program);

describe('completion scripts (S11.2)', () => {
  for (const shell of SHELLS) {
    it(`generates a stable ${shell} script from the command tree`, () => {
      const script = completionScript(shell, spec);
      expect(script).toMatchSnapshot();
      // Sanity: real commands + the dynamic hook are present.
      expect(script).toContain('sync');
      expect(script).toContain('restore');
      expect(script).toContain('mcpfold');
    });
  }

  it('the bash + fish scripts wire up dynamic profile/server completion', () => {
    expect(completionScript('bash', spec)).toContain('__complete profiles');
    expect(completionScript('fish', spec)).toContain('__complete servers');
  });
});

describe('dynamic completion values (S11.2)', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'mcpfold-comp-'));
    writeFileSync(
      join(cwd, 'mcp.config.jsonc'),
      `{
        "version": 1,
        "servers": {
          "github": { "transport": "stdio", "command": "npx", "args": ["x"] },
          "atlas": { "transport": "stdio", "command": "npx", "args": ["y"] }
        },
        "profiles": {
          "work": { "client": "cursor", "scope": "user", "include": [] },
          "home": { "client": "vscode", "scope": "user", "include": [] }
        }
      }`,
    );
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('resolves profile + server names (sorted) from the local config', () => {
    expect(completionValues('profiles', cwd)).toEqual(['home', 'work']);
    expect(completionValues('servers', cwd)).toEqual(['atlas', 'github']);
  });

  it('returns nothing (never throws) when there is no config', () => {
    const empty = mkdtempSync(join(tmpdir(), 'mcpfold-comp-empty-'));
    expect(completionValues('profiles', empty)).toEqual([]);
    rmSync(empty, { recursive: true, force: true });
  });
});
