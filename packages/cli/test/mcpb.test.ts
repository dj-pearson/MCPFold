import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { zipSync, strToU8 } from 'fflate';
import forge from 'node-forge';
import { UsageError } from '@mcpfold/core';
import {
  inspectMcpbSignature,
  mapMcpbManifest,
  parseMcpbManifest,
  verifyMcpbIntegrity,
  type McpbManifest,
} from '../src/registry/mcpb.js';
import { runAdd } from '../src/commands/add.js';

/** A minimal but realistic manifest: a sensitive key + a non-sensitive default + a platform override. */
const MANIFEST: McpbManifest = {
  manifest_version: '0.3',
  name: 'io.github.acme/weather-mcp',
  version: '1.2.0',
  description: 'Weather MCP',
  server: {
    type: 'node',
    entry_point: 'server/index.js',
    mcp_config: {
      command: 'node',
      args: ['${__dirname}/server/index.js'],
      env: { API_KEY: '${user_config.api_key}', DATA_DIR: '${user_config.data_dir}' },
      platform_overrides: { win32: { command: 'node.exe' } },
    },
  },
  user_config: {
    api_key: { type: 'string', title: 'API key', sensitive: true, required: true },
    data_dir: { type: 'directory', default: '/var/data', required: false },
  },
};

/** Build a `.mcpb` (a ZIP with manifest.json), optionally with an appended PKCS#7 signature. */
function buildBundle(
  manifest: McpbManifest,
  sign?: { subjectCN: string; issuerCN: string },
): Uint8Array {
  const zip = zipSync({ 'manifest.json': strToU8(JSON.stringify(manifest)) });
  if (!sign) return zip;
  const keys = forge.pki.rsa.generateKeyPair(512);
  const cert = forge.pki.createCertificate();
  cert.publicKey = keys.publicKey;
  cert.serialNumber = '01';
  cert.validity.notBefore = new Date();
  cert.validity.notAfter = new Date(Date.now() + 365 * 24 * 3600 * 1000);
  cert.setSubject([{ name: 'commonName', value: sign.subjectCN }]);
  cert.setIssuer([{ name: 'commonName', value: sign.issuerCN }]);
  cert.sign(keys.privateKey, forge.md.sha256.create());
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(Buffer.from(zip).toString('binary'));
  p7.addCertificate(cert);
  p7.addSigner({
    key: keys.privateKey,
    certificate: cert,
    digestAlgorithm: forge.pki.oids.sha256!,
  });
  p7.sign({ detached: true });
  const der = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  const len = Buffer.alloc(4);
  len.writeUInt32LE(der.length);
  return new Uint8Array(
    Buffer.concat([
      Buffer.from(zip),
      Buffer.from('MCPB_SIG_V1'),
      len,
      der,
      Buffer.from('MCPB_SIG_END'),
    ]),
  );
}

describe('mcpb mapping (S17.8)', () => {
  it('maps mcp_config to a canonical stdio server; sensitive user_config → keychain ref', () => {
    const { server } = mapMcpbManifest(MANIFEST, { platform: 'linux' });
    expect(server.transport).toBe('stdio');
    expect(server.command).toBe('node');
    // Sensitive → a ref (never a value); default keychain scheme.
    expect(server.env?.API_KEY).toBe('${keychain:api_key}');
    // Non-sensitive with a default → the default value.
    expect(server.env?.DATA_DIR).toBe('/var/data');
  });

  it('applies platform_overrides for the target OS', () => {
    expect(mapMcpbManifest(MANIFEST, { platform: 'win32' }).server.command).toBe('node.exe');
    expect(mapMcpbManifest(MANIFEST, { platform: 'linux' }).server.command).toBe('node');
  });

  it('honors a user-chosen secret scheme for sensitive fields', () => {
    const { server } = mapMcpbManifest(MANIFEST, { platform: 'linux', secretScheme: 'op' });
    expect(server.env?.API_KEY).toBe('${op:api_key}');
  });

  it('warns about unresolved MCPB runtime variables (${__dirname})', () => {
    const { warnings } = mapMcpbManifest(MANIFEST, { platform: 'linux' });
    expect(warnings.join(' ')).toContain('runtime variable');
  });

  it('rejects an unsupported server type with a clear, list-of-supported error', () => {
    const bad = { ...MANIFEST, server: { ...MANIFEST.server, type: 'wasm' } };
    expect(() => mapMcpbManifest(bad)).toThrow(UsageError);
    try {
      mapMcpbManifest(bad);
    } catch (e) {
      expect((e as Error).message).toContain('wasm');
    }
  });

  it('parses manifest.json out of a real .mcpb ZIP (even with an appended signature)', () => {
    const signed = buildBundle(MANIFEST, { subjectCN: 'Acme', issuerCN: 'Acme' });
    expect(parseMcpbManifest(signed).name).toBe('io.github.acme/weather-mcp');
  });
});

describe('mcpb signature (S17.8)', () => {
  it('reports UNSIGNED for a plain bundle', () => {
    expect(inspectMcpbSignature(buildBundle(MANIFEST)).status).toBe('unsigned');
  });

  it('reports SELF-SIGNED when issuer CN == subject CN', () => {
    const sig = inspectMcpbSignature(
      buildBundle(MANIFEST, { subjectCN: 'Acme', issuerCN: 'Acme' }),
    );
    expect(sig.status).toBe('self-signed');
    expect(sig.publisher).toBe('Acme');
  });

  it('reports SIGNED when a distinct CA issued the cert', () => {
    const sig = inspectMcpbSignature(
      buildBundle(MANIFEST, { subjectCN: 'Acme', issuerCN: 'Trusted CA' }),
    );
    expect(sig.status).toBe('signed');
    expect(sig.issuer).toBe('Trusted CA');
  });
});

describe('mcpb integrity (S17.8)', () => {
  it('verifies a matching SHA-256 (hex) and rejects a mismatch', () => {
    const bundle = buildBundle(MANIFEST);
    const hex = createHash('sha256').update(bundle).digest('hex');
    expect(verifyMcpbIntegrity(bundle, hex)).toBe(true);
    expect(verifyMcpbIntegrity(bundle, 'f'.repeat(64))).toBe(false);
  });
});

// S22.18: reading an .mcpb must be size- and entry-bounded so a zip bomb can't exhaust memory.
describe('mcpb archive limits (S22.18)', () => {
  it('reads a normal bundle within the default caps', () => {
    expect(parseMcpbManifest(buildBundle(MANIFEST)).name).toBe(MANIFEST.name);
  });

  it('rejects a manifest larger than the cap without inflating it', () => {
    // The real manifest is a few hundred bytes; a tiny cap rejects it via the metadata filter.
    expect(() => parseMcpbManifest(buildBundle(MANIFEST), { maxManifestBytes: 10 })).toThrow(
      /exceeds the .*limit/,
    );
  });

  it('rejects an archive with more entries than the cap', () => {
    const zip = zipSync({
      'manifest.json': strToU8(JSON.stringify(MANIFEST)),
      'extra.bin': strToU8('x'),
    });
    expect(() => parseMcpbManifest(zip, { maxEntries: 1 })).toThrow(/entries/i);
  });
});

describe('runAdd --from-mcpb (S17.8)', () => {
  let cwd: string;
  const CONFIG = `{ "version": 1, "servers": {}, "profiles": {} }`;
  beforeEach(() => {
    cwd = mkdtempSync(join(tmpdir(), 'mcpfold-mcpb-'));
    writeFileSync(join(cwd, 'mcp.config.jsonc'), CONFIG);
  });
  afterEach(() => rmSync(cwd, { recursive: true, force: true }));

  it('adds a ref-only server from an .mcpb and surfaces the signature', async () => {
    const bundle = buildBundle(MANIFEST, { subjectCN: 'Acme', issuerCN: 'Acme' });
    const result = await runAdd({
      cwd,
      name: 'bundle.mcpb',
      fromMcpb: true,
      loadBundle: () => Promise.resolve(bundle),
    });
    // Reverse-DNS name → clean local key.
    expect(result.data.name).toBe('weather-mcp');
    expect(result.data.server.env?.API_KEY).toBe('${keychain:api_key}');
    expect(result.data.signature?.status).toBe('self-signed');
    // No raw secret ever lands on disk.
    const text = readFileSync(join(cwd, 'mcp.config.jsonc'), 'utf8');
    expect(text).toContain('${keychain:api_key}');
  });

  it('refuses to install when the integrity hash does not match', async () => {
    const bundle = buildBundle(MANIFEST);
    await expect(
      runAdd({
        cwd,
        name: 'bundle.mcpb',
        fromMcpb: true,
        mcpbIntegrity: 'f'.repeat(64),
        loadBundle: () => Promise.resolve(bundle),
      }),
    ).rejects.toThrow(/integrity check failed/);
  });

  // S22.9: the fetched bytes are verified against the declared integrity via the shared SRI verifier.
  it('installs when the integrity matches the fetched bytes (hex or SRI)', async () => {
    const bundle = buildBundle(MANIFEST);
    const sri = `sha256-${createHash('sha256').update(bundle).digest('base64')}`;
    const viaSri = await runAdd({
      cwd,
      name: 'bundle.mcpb',
      fromMcpb: true,
      mcpbIntegrity: sri,
      loadBundle: () => Promise.resolve(bundle),
    });
    expect(viaSri.data.wrote).toBe(true);
  });

  it('rejects a malformed integrity value as a clear error (S22.9)', async () => {
    const bundle = buildBundle(MANIFEST);
    await expect(
      runAdd({
        cwd,
        name: 'bundle.mcpb',
        fromMcpb: true,
        mcpbIntegrity: 'not-a-real-hash',
        loadBundle: () => Promise.resolve(bundle),
      }),
    ).rejects.toThrow(/not a valid/i);
  });
});
