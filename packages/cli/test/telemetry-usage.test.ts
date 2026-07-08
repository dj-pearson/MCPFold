import { describe, expect, it } from 'vitest';
import { buildAdoptionEvent, sendAdoption, type TelemetryPayload } from '../src/telemetry.js';

/**
 * Adoption signal (S11.5): strictly opt-in, aggregate-only, provably non-identifying. These tests
 * prove opt-out sends nothing, the payload is a fixed allow-list of non-identifying fields, and a
 * planted secret / path / server name can never appear.
 */
describe('adoption signal (S11.5)', () => {
  it('sends nothing when not opted in or opted out', async () => {
    const sent: TelemetryPayload[] = [];
    const ev = buildAdoptionEvent({
      cliVersion: '1.0.0',
      adapters: ['cursor'],
      providerSchemes: ['env'],
      serverCount: 3,
      profileCount: 1,
    });
    // default (unset) → off
    expect(await sendAdoption(ev, { env: {}, sink: (e) => void sent.push(e) })).toBe(false);
    // DO_NOT_TRACK overrides an explicit opt-in
    expect(
      await sendAdoption(ev, {
        env: { MCPFOLD_TELEMETRY: '1', DO_NOT_TRACK: '1' },
        sink: (e) => void sent.push(e),
      }),
    ).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('opt-in payload contains ONLY allow-listed aggregate fields — planted junk is dropped', async () => {
    const sent: TelemetryPayload[] = [];
    const ev = buildAdoptionEvent({
      cliVersion: '1.0.0',
      // paths, server names, and secrets planted among the adapters/schemes must be filtered out.
      adapters: ['cursor', 'vscode', '/etc/passwd', 'my-internal-server'],
      providerSchemes: ['env', 'op', 'ghp_tokenlike', 'https://evil.example'],
      serverCount: 12,
      profileCount: 3,
      platform: 'linux',
    });

    expect(ev.adapters).toEqual(['cursor', 'vscode']); // only known client ids
    expect(ev.providerSchemes).toEqual(['env', 'op']); // only known schemes
    expect(ev.serverBucket).toBe('6-20'); // coarse, not the exact count
    expect(ev.profileBucket).toBe('1-5');

    await sendAdoption(ev, { env: { MCPFOLD_TELEMETRY: '1' }, sink: (e) => void sent.push(e) });
    expect(Object.keys(sent[0]!).sort()).toEqual([
      'adapters',
      'cliVersion',
      'event',
      'os',
      'profileBucket',
      'providerSchemes',
      'serverBucket',
    ]);

    const json = JSON.stringify(sent[0]);
    for (const planted of [
      '/etc/passwd',
      'my-internal-server',
      'ghp_tokenlike',
      'evil.example',
      '12',
    ]) {
      expect(json).not.toContain(planted);
    }
  });

  it('the redactor masks a secret-shaped value as a final guard', async () => {
    const sent: TelemetryPayload[] = [];
    const leaky = buildAdoptionEvent({
      cliVersion: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123', // hypothetical field carrying a token
      adapters: [],
      providerSchemes: [],
      serverCount: 0,
      profileCount: 0,
    });
    await sendAdoption(leaky, { env: { MCPFOLD_TELEMETRY: '1' }, sink: (e) => void sent.push(e) });
    expect(JSON.stringify(sent[0])).not.toContain('ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123');
  });
});
