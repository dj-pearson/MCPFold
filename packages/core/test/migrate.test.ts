import { describe, expect, it } from 'vitest';
import {
  detectVersion,
  migrateConfig,
  MigrationError,
  SCHEMA_VERSION,
} from '../src/migrate/index.js';
import { loadConfig } from '../src/load.js';

const v1 = {
  version: 1,
  servers: { gh: { transport: 'http', url: 'https://x/mcp', tags: ['work'] } },
  profiles: { c: { client: 'cursor', scope: 'user', include: ['work'] } },
};

describe('detectVersion (S0.7)', () => {
  it('reads the version, defaulting to 1', () => {
    expect(detectVersion({ version: 3 })).toBe(3);
    expect(detectVersion({})).toBe(1);
    expect(detectVersion('nope')).toBe(1);
  });
});

describe('migrateConfig (S0.7)', () => {
  it('is a no-op identity when already at the target version', () => {
    const result = migrateConfig(v1, 1);
    expect(result.applied).toEqual([]);
    expect(result.toVersion).toBe(1);
    expect(result.config).toEqual(v1);
  });

  it('applies the real 1→2 migration: http → streamable-http (S17.5)', () => {
    const result = migrateConfig(v1, 2);
    expect(result.fromVersion).toBe(1);
    expect(result.toVersion).toBe(2);
    expect(result.applied).toHaveLength(1);
    const server = (result.config.servers as Record<string, Record<string, unknown>>).gh;
    expect(server?.transport).toBe('streamable-http');
    expect(server?.url).toBe('https://x/mcp'); // no semantic loss
    expect(server?.tags).toEqual(['work']); // tags untouched
    expect(result.config.version).toBe(2);
  });

  it('leaves stdio and sse transports untouched (S17.5)', () => {
    const mixed = {
      version: 1,
      servers: {
        s: { transport: 'stdio', command: 'x', tags: [] },
        e: { transport: 'sse', url: 'https://x/sse', tags: [] },
      },
      profiles: {},
    };
    const servers = migrateConfig(mixed, 2).config.servers as Record<
      string,
      Record<string, unknown>
    >;
    expect(servers.s?.transport).toBe('stdio');
    expect(servers.e?.transport).toBe('sse');
  });

  it('round-trips: migrated v2 carries the same server names', () => {
    const migrated = migrateConfig(v1, 2).config;
    expect(Object.keys(migrated.servers as object)).toEqual(Object.keys(v1.servers));
  });

  it('throws when the config is newer than the target', () => {
    expect(() => migrateConfig({ version: 5 }, 1)).toThrow(MigrationError);
  });

  it('throws when a migration step is missing', () => {
    expect(() => migrateConfig({ version: 1 }, 3, [])).toThrow(/no migration registered/);
  });

  // S22.23: migrating a v1 that OMITS `servers` must NOT synthesize `servers: {}` — that would mask
  // the schema's required-field error.
  it('preserves the absence of servers so the required-field error still fires', () => {
    const migrated = migrateConfig({ version: 1, profiles: {} }, 2).config;
    expect('servers' in migrated).toBe(false);
    expect(loadConfig('{ "version": 1, "profiles": {} }').ok).toBe(false);
  });
});

describe('loadConfig newer-version detection (S0.7)', () => {
  it('errors with an upgrade hint for a newer-than-supported version', () => {
    const res = loadConfig(`{ "version": ${SCHEMA_VERSION + 1}, "servers": {}, "profiles": {} }`);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.errors[0]?.message).toContain('newer than this mcpfold supports');
      expect(res.errors[0]?.hint).toContain('Upgrade mcpfold');
    }
  });
});
