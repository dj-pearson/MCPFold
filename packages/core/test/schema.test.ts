import { describe, expect, it } from 'vitest';
import {
  CLIENT_IDS,
  ConfigSchema,
  ServerSchema,
  ProfileSchema,
  SECRET_REF_RE,
} from '../src/schema.js';

// S17.3/S19.1/S19.2: the doc comment on CLIENT_IDS claims a count ("eighteen clients"); keep it honest.
describe('CLIENT_IDS (S17.3, S19.1, S19.2)', () => {
  it('has exactly eighteen clients (matches the "eighteen clients" comment)', () => {
    expect(CLIENT_IDS).toHaveLength(18);
    expect(new Set(CLIENT_IDS).size).toBe(CLIENT_IDS.length); // no duplicates
  });

  it('includes the wave-1 adapters (S19.1)', () => {
    for (const id of ['jetbrains', 'visual-studio', 'continue', 'roo-code'] as const) {
      expect(CLIENT_IDS).toContain(id);
    }
  });

  it('includes the wave-2 adapters (S19.2)', () => {
    for (const id of [
      'goose',
      'codex-cli',
      'lm-studio',
      'warp',
      'opencode',
      'copilot-cli',
    ] as const) {
      expect(CLIENT_IDS).toContain(id);
    }
  });
});

/** A minimal valid config used as a base for negative variants. */
const validConfig = {
  version: 2,
  servers: {
    github: {
      transport: 'streamable-http',
      url: 'https://api.githubcopilot.com/mcp/',
      auth: { type: 'bearer', token: '${infisical:dev/mcp/GITHUB_PAT}' },
      tools: { mode: 'allow', list: ['create_issue'] },
      tags: ['work'],
    },
    playwright: {
      transport: 'stdio',
      command: 'npx',
      args: ['-y', '@playwright/mcp@latest'],
      pin: '1.4.2',
      env: { HEADLESS: 'true' },
      tags: ['code'],
    },
  },
  profiles: {
    'work-cursor': { client: 'cursor', scope: 'user', include: ['work', 'code'] },
    projectX: {
      client: 'claude-code',
      scope: 'project',
      path: '~/repos/projectX',
      include: ['code'],
    },
  },
};

describe('ConfigSchema (S1.1)', () => {
  it('accepts a valid spec-shaped config', () => {
    const parsed = ConfigSchema.parse(validConfig);
    expect(parsed.version).toBe(2);
    expect(Object.keys(parsed.servers)).toEqual(['github', 'playwright']);
  });

  it('accepts `http` as an alias, canonicalizing it to `streamable-http` (S17.5)', () => {
    const parsed = ServerSchema.parse({ transport: 'http', url: 'https://x.test/mcp' });
    expect(parsed.transport).toBe('streamable-http');
  });

  it('accepts the declarative `oauth` auth marker with no token (S17.5)', () => {
    const parsed = ServerSchema.parse({
      transport: 'streamable-http',
      url: 'https://x.test/mcp',
      auth: { type: 'oauth' },
    });
    expect(parsed.auth?.type).toBe('oauth');
    expect(parsed.auth?.token).toBeUndefined();
  });

  it('defaults tags to [] when omitted', () => {
    const parsed = ServerSchema.parse({ transport: 'http', url: 'https://x.test/mcp' });
    expect(parsed.tags).toEqual([]);
  });

  it('defaults auth.type to "none"', () => {
    const parsed = ServerSchema.parse({ transport: 'http', url: 'https://x.test/mcp', auth: {} });
    expect(parsed.auth?.type).toBe('none');
  });

  it('rejects a bad version (not literal 2)', () => {
    const res = ConfigSchema.safeParse({ ...validConfig, version: 3 });
    expect(res.success).toBe(false);
    if (!res.success) {
      expect(res.error.issues.some((i) => i.path.join('.') === 'version')).toBe(true);
    }
  });

  describe('Server refine: transport ↔ command/url', () => {
    it('rejects a stdio server missing `command`', () => {
      const res = ServerSchema.safeParse({ transport: 'stdio', tags: [] });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('stdio servers need `command`');
      }
    });

    it('rejects an http server missing `url`', () => {
      const res = ServerSchema.safeParse({ transport: 'http', tags: [] });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('http/sse servers need `url`');
      }
    });

    it('rejects an sse server missing `url`', () => {
      const res = ServerSchema.safeParse({ transport: 'sse', tags: [] });
      expect(res.success).toBe(false);
    });
  });

  describe('SecretRef', () => {
    it('regex matches well-formed refs and rejects bare tokens', () => {
      expect(SECRET_REF_RE.test('${env:GITHUB_PAT}')).toBe(true);
      expect(SECRET_REF_RE.test('${infisical:dev/mcp/X}')).toBe(true);
      expect(SECRET_REF_RE.test('ghp_hardcodedtoken')).toBe(false);
      expect(SECRET_REF_RE.test('${nocolon}')).toBe(false);
    });

    it('rejects a hardcoded (non-ref) token in auth', () => {
      const res = ServerSchema.safeParse({
        transport: 'http',
        url: 'https://x.test/mcp',
        auth: { type: 'bearer', token: 'ghp_hardcoded' },
      });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues.some((i) => i.message.includes('secret reference'))).toBe(true);
      }
    });
  });

  describe('Profile refine: path required for project/workspace', () => {
    it('rejects a project-scope profile with no path', () => {
      const res = ProfileSchema.safeParse({ client: 'vscode', scope: 'project', include: ['x'] });
      expect(res.success).toBe(false);
      if (!res.success) {
        expect(res.error.issues[0]?.message).toContain('`path` is required');
      }
    });

    it('allows a user-scope profile with no path', () => {
      const res = ProfileSchema.safeParse({ client: 'cursor', scope: 'user', include: ['x'] });
      expect(res.success).toBe(true);
    });

    it('rejects an unknown client', () => {
      const res = ProfileSchema.safeParse({ client: 'emacs', include: ['x'] });
      expect(res.success).toBe(false);
    });
  });

  it('rejects unknown keys (strict) — catches typos like `mcpServers`', () => {
    const res = ConfigSchema.safeParse({ ...validConfig, mcpServers: {} });
    expect(res.success).toBe(false);
  });

  it('accepts an optional `$schema` pointer (editor autocomplete)', () => {
    const res = ConfigSchema.safeParse({
      ...validConfig,
      $schema: 'https://mcpfold.com/schema.json',
    });
    expect(res.success).toBe(true);
  });
});
