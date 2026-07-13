import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createAuditRecorder, fileAuditSink } from '@mcpfold/proxy';
import type { Config } from '@mcpfold/core';
import {
  auditLogSizeBytes,
  auditOptedOut,
  defaultAuditLogPath,
  resolveActiveAuditLog,
} from '../src/util/audit-log.js';

/**
 * Default-on local audit trail (S24.8). Records tool-call NAMES to a per-user data dir by default so
 * `mcpfold curate` has data with zero setup; opt out via config or env; never a secret value.
 */

const cfg = (audit?: Config['audit']): Pick<Config, 'audit'> => ({ audit });

describe('defaultAuditLogPath (per-OS)', () => {
  it('uses %LOCALAPPDATA%\\mcpfold on Windows', () => {
    expect(
      defaultAuditLogPath('C:\\Users\\me', 'win32', {
        LOCALAPPDATA: 'C:\\Users\\me\\AppData\\Local',
      }),
    ).toBe('C:\\Users\\me\\AppData\\Local\\mcpfold\\audit.log');
    // Falls back under the home dir when LOCALAPPDATA is unset.
    expect(defaultAuditLogPath('C:\\Users\\me', 'win32', {})).toBe(
      'C:\\Users\\me\\AppData\\Local\\mcpfold\\audit.log',
    );
  });

  it('uses $XDG_STATE_HOME (else ~/.local/state) on POSIX', () => {
    expect(defaultAuditLogPath('/home/me', 'linux', { XDG_STATE_HOME: '/home/me/.state' })).toBe(
      '/home/me/.state/mcpfold/audit.log',
    );
    expect(defaultAuditLogPath('/home/me', 'linux', {})).toBe(
      '/home/me/.local/state/mcpfold/audit.log',
    );
  });
});

describe('auditOptedOut', () => {
  it('is opted out via the env var or `audit.enabled: false`; on by default', () => {
    expect(auditOptedOut(cfg(), {})).toBe(false);
    expect(auditOptedOut(cfg({ enabled: true }), {})).toBe(false);
    expect(auditOptedOut(cfg({ enabled: false }), {})).toBe(true);
    expect(auditOptedOut(cfg(), { MCPFOLD_NO_AUDIT: '1' })).toBe(true);
  });
});

describe('resolveActiveAuditLog', () => {
  it('prefers explicit, then MCPFOLD_AUDIT_LOG, then the default path', () => {
    expect(resolveActiveAuditLog({ explicit: '/x/a.log', env: {} })).toBe('/x/a.log');
    expect(resolveActiveAuditLog({ env: { MCPFOLD_AUDIT_LOG: '/y/b.log' } })).toBe('/y/b.log');
    expect(resolveActiveAuditLog({ env: {}, home: '/home/me', platform: 'linux' })).toBe(
      '/home/me/.local/state/mcpfold/audit.log',
    );
  });

  it('returns undefined only when opted out and no explicit path is given', () => {
    expect(resolveActiveAuditLog({ config: cfg({ enabled: false }), env: {} })).toBeUndefined();
    expect(resolveActiveAuditLog({ env: { MCPFOLD_NO_AUDIT: '1' } })).toBeUndefined();
    // An explicit path still wins over the opt-out.
    expect(
      resolveActiveAuditLog({ explicit: '/x/a.log', config: cfg({ enabled: false }), env: {} }),
    ).toBe('/x/a.log');
  });
});

describe('auditLogSizeBytes', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-auditsize-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('sums the primary log and its rotated siblings, 0 when none exist', () => {
    const primary = join(dir, 'audit.log');
    expect(auditLogSizeBytes(primary)).toBe(0);
    writeFileSync(primary, 'x'.repeat(100));
    writeFileSync(`${primary}.123.0.abcd`, 'y'.repeat(50)); // a rotated sibling
    writeFileSync(join(dir, 'unrelated.txt'), 'z'.repeat(999)); // ignored
    expect(auditLogSizeBytes(primary)).toBe(150);
  });
});

describe('ref-only invariant: no secret value in the audit file (S24.8)', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'mcpfold-auditinv-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('records the tool name and arg SHAPE, never the secret argument value', () => {
    const path = join(dir, 'audit.log');
    const rec = createAuditRecorder({
      server: 'gh',
      sink: fileAuditSink(path),
      now: () => 0,
    });
    // A tools/call whose arguments carry a secret value.
    rec.callStart(1, 'create_pr', {
      name: 'create_pr',
      arguments: { token: 'supersecret-abc123' },
    });
    rec.callEnd(1, 'ok');

    const raw = readFileSync(path, 'utf8');
    expect(raw).toContain('"tool":"create_pr"'); // the name is recorded
    expect(raw).toContain('"token":"string"'); // the arg SHAPE (key → type) is recorded
    expect(raw).not.toContain('supersecret-abc123'); // the VALUE never is
  });
});
