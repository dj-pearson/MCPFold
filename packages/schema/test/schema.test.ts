import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  generatePolicySchema,
  generatePolicySchemaText,
  generateSchema,
  generateSchemaText,
} from '../src/generate.js';

// ajv is CJS; verbatimModuleSyntax + NodeNext make a default import non-constructable, so
// load it via createRequire.
const require = createRequire(import.meta.url);
const Ajv = require('ajv') as typeof import('ajv').default;

const committedPath = fileURLToPath(new URL('../mcp.config.schema.json', import.meta.url));
const policyCommittedPath = fileURLToPath(new URL('../mcp.policy.schema.json', import.meta.url));

// `pnpm --filter @mcpfold/schema generate` (WRITE_SCHEMA=1) writes the committed files;
// CI runs without the flag and the drift test fails if a committed file is stale.
beforeAll(() => {
  if (process.env.WRITE_SCHEMA === '1') {
    writeFileSync(committedPath, generateSchemaText());
    writeFileSync(policyCommittedPath, generatePolicySchemaText());
  }
});

const VALID = {
  version: 1,
  servers: {
    github: {
      transport: 'http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'bearer', token: '${infisical:dev/mcp/GITHUB_PAT}' },
      tags: ['work'],
    },
    playwright: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      pin: '1.4.2',
      tags: ['code'],
    },
  },
  profiles: {
    'work-cursor': { client: 'cursor', scope: 'user', include: ['work', 'code'] },
  },
};

describe('generated JSON Schema (S1.5)', () => {
  const ajv = new Ajv({ strict: false, allErrors: true });
  const validate = ajv.compile(generateSchema());

  it('validates the spec §4 example', () => {
    expect(validate(VALID)).toBe(true);
  });

  it('rejects a bad version (const 1)', () => {
    expect(validate({ ...VALID, version: 2 })).toBe(false);
  });

  it('rejects an unknown top-level key (strict)', () => {
    expect(validate({ ...VALID, mcpServers: {} })).toBe(false);
  });

  it('rejects a hardcoded (non-ref) token via the secret-reference pattern', () => {
    const bad = structuredClone(VALID);
    bad.servers.github.auth.token = 'ghp_hardcoded';
    expect(validate(bad)).toBe(false);
  });

  it('accepts an optional $schema pointer', () => {
    expect(validate({ ...VALID, $schema: 'https://mcpfold.com/schema/v1.json' })).toBe(true);
  });

  it('committed mcp.config.schema.json matches the generated schema (drift check)', () => {
    // Normalize CRLF → LF so the check is robust to git autocrlf on Windows checkouts.
    const committed = readFileSync(committedPath, 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(generateSchemaText());
  });
});

describe('generated org-policy JSON Schema (S18.3)', () => {
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validate = ajv.compile(generatePolicySchema());

  it('accepts a valid allow/deny policy', () => {
    expect(
      validate({
        version: 1,
        mode: 'strict',
        allow: [{ namespace: '@modelcontextprotocol' }],
        deny: [{ url: 'https://*.evil.example/*', description: 'blocked vendor' }],
      }),
    ).toBe(true);
  });

  it('rejects an unknown top-level key and an unknown mode', () => {
    expect(validate({ version: 1, bogus: true })).toBe(false);
    expect(validate({ version: 1, mode: 'loose' })).toBe(false);
  });

  it('committed mcp.policy.schema.json matches the generated schema (drift check)', () => {
    const committed = readFileSync(policyCommittedPath, 'utf8').replace(/\r\n/g, '\n');
    expect(committed).toBe(generatePolicySchemaText());
  });
});
