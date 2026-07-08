import { describe, expect, it } from 'vitest';
import {
  buildTelemetryEvent,
  isTelemetryEnabled,
  sendTelemetry,
  type TelemetryPayload,
} from '../src/telemetry.js';

describe('telemetry (S8.3) — opt-in only', () => {
  it('is disabled by default (no opt-in)', () => {
    expect(isTelemetryEnabled({})).toBe(false);
  });

  it('is enabled only when explicitly opted in', () => {
    expect(isTelemetryEnabled({ MCPFOLD_TELEMETRY: '1' })).toBe(true);
    expect(isTelemetryEnabled({ MCPFOLD_TELEMETRY: 'true' })).toBe(true);
    expect(isTelemetryEnabled({ MCPFOLD_TELEMETRY: '0' })).toBe(false);
  });

  it('honors opt-out (DO_NOT_TRACK / MCPFOLD_TELEMETRY=0) over an opt-in', () => {
    expect(isTelemetryEnabled({ MCPFOLD_TELEMETRY: '1', DO_NOT_TRACK: '1' })).toBe(false);
    expect(isTelemetryEnabled({ MCPFOLD_TELEMETRY: '0' })).toBe(false);
  });

  it('builds a fixed, non-identifying payload (no paths/config/secrets)', () => {
    const event = buildTelemetryEvent({
      command: 'sync',
      cliVersion: '0.1.0',
      exitCode: 0,
      durationMs: 12.7,
      platform: 'linux',
      nodeVersion: 'v20.0.0',
    });
    // Exactly the allow-listed fields — nothing more.
    expect(Object.keys(event).sort()).toEqual(
      ['cliVersion', 'command', 'durationMs', 'event', 'exitCode', 'nodeVersion', 'os'].sort(),
    );
    expect(event).toEqual({
      event: 'command',
      command: 'sync',
      cliVersion: '0.1.0',
      nodeVersion: 'v20.0.0',
      os: 'linux',
      exitCode: 0,
      durationMs: 13,
    });
  });

  it('does not send anything when disabled', async () => {
    const sent: TelemetryPayload[] = [];
    const event = buildTelemetryEvent({
      command: 'diff',
      cliVersion: '0.1.0',
      exitCode: 0,
      durationMs: 5,
    });
    const wasSent = await sendTelemetry(event, { env: {}, sink: (e) => void sent.push(e) });
    expect(wasSent).toBe(false);
    expect(sent).toHaveLength(0);
  });

  it('sends only when opted in AND a sink is configured', async () => {
    const sent: TelemetryPayload[] = [];
    const event = buildTelemetryEvent({
      command: 'diff',
      cliVersion: '0.1.0',
      exitCode: 0,
      durationMs: 5,
    });
    const wasSent = await sendTelemetry(event, {
      env: { MCPFOLD_TELEMETRY: '1' },
      sink: (e) => void sent.push(e),
    });
    expect(wasSent).toBe(true);
    expect(sent).toEqual([event]);
  });

  it('redacts any secret-shaped value before sending (belt-and-suspenders)', async () => {
    const sent: TelemetryPayload[] = [];
    // Simulate a hypothetical future field carrying a token — it must never be transmitted raw.
    const leaky = {
      ...buildTelemetryEvent({
        command: 'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123',
        cliVersion: '0.1.0',
        exitCode: 0,
        durationMs: 1,
      }),
    };
    await sendTelemetry(leaky, { env: { MCPFOLD_TELEMETRY: '1' }, sink: (e) => void sent.push(e) });
    expect(sent).toHaveLength(1);
    expect((sent[0] as { command: string }).command).not.toContain(
      'ghp_ABCDEFGHIJKLMNOPQRSTUVWXYZ0123',
    );
  });
});
