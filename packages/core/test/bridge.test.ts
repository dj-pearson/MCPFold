import { describe, expect, it } from 'vitest';
import {
  compareVersions,
  findMcpRemoteArg,
  isVulnerableMcpRemoteVersion,
  MCP_REMOTE_MIN_VERSION,
  MCP_REMOTE_PINNED_VERSION,
  MCP_REMOTE_SPEC,
} from '../src/bridge.js';

/** S17.1 — the mcp-remote bridge must only ever be spawned/emitted pinned to a CVE-safe version. */
describe('mcp-remote bridge spec (S17.1)', () => {
  it('pins an exact version at or above the CVE-2025-6514 fix floor (0.1.16)', () => {
    expect(MCP_REMOTE_SPEC).toBe(`mcp-remote@${MCP_REMOTE_PINNED_VERSION}`);
    expect(MCP_REMOTE_PINNED_VERSION).toMatch(/^\d+\.\d+\.\d+$/);
    expect(
      compareVersions(MCP_REMOTE_PINNED_VERSION, MCP_REMOTE_MIN_VERSION),
    ).toBeGreaterThanOrEqual(0);
    expect(MCP_REMOTE_MIN_VERSION).toBe('0.1.16'); // never lower this
  });

  it('compareVersions orders dotted numeric versions and ignores range operators', () => {
    expect(compareVersions('0.1.15', '0.1.16')).toBe(-1);
    expect(compareVersions('0.1.16', '0.1.16')).toBe(0);
    expect(compareVersions('0.2.0', '0.1.38')).toBe(1);
    expect(compareVersions('^0.1.16', '0.1.16')).toBe(0);
    expect(compareVersions('1.0.0-beta.1', '1.0.0')).toBe(0); // pre-release stripped
  });

  it('findMcpRemoteArg locates both pinned and legacy-unpinned references', () => {
    expect(findMcpRemoteArg(['-y', 'mcp-remote', 'https://x'])).toEqual({
      index: 1,
      version: null,
    });
    expect(findMcpRemoteArg(['-y', 'mcp-remote@0.1.38', 'https://x'])).toEqual({
      index: 1,
      version: '0.1.38',
    });
    expect(findMcpRemoteArg(['-y', '@playwright/mcp@1.2.3'])).toBeNull();
  });

  it('isVulnerableMcpRemoteVersion flags unpinned, ranged, and below-floor specs', () => {
    expect(isVulnerableMcpRemoteVersion(null)).toBe(true); // unpinned
    expect(isVulnerableMcpRemoteVersion('latest')).toBe(true); // ranged/tag
    expect(isVulnerableMcpRemoteVersion('^0.1.16')).toBe(true); // range → npm can resolve anything
    expect(isVulnerableMcpRemoteVersion('0.1.15')).toBe(true); // below the fix floor
    expect(isVulnerableMcpRemoteVersion('0.0.5')).toBe(true);
    expect(isVulnerableMcpRemoteVersion('0.1.16')).toBe(false); // exactly the floor is safe
    expect(isVulnerableMcpRemoteVersion(MCP_REMOTE_PINNED_VERSION)).toBe(false);
  });
});
