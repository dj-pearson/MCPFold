import { describe, expect, it } from 'vitest';
import { runUpdate } from '../src/commands/update.js';
import { EXIT } from '../src/output/exit-codes.js';

describe('runUpdate (S23.2)', () => {
  it('reports an available update with the channel-correct command', async () => {
    const out = await runUpdate({
      currentVersion: '1.0.0',
      execPath: '/usr/bin/node',
      fetchLatest: async () => '1.2.0',
    });
    expect(out.exit).toBe(EXIT.SUCCESS);
    expect(out.data.updateAvailable).toBe(true);
    expect(out.data.latest).toBe('1.2.0');
    expect(out.data.channel).toBe('npm');
    expect(out.data.upgradeCommand).toContain('npm install -g mcpfold');
    expect(out.human).toContain('Update available');
    expect(out.human).toContain('1.0.0 → 1.2.0');
  });

  it('says up to date when current is the latest', async () => {
    const out = await runUpdate({
      currentVersion: '1.2.0',
      execPath: '/usr/bin/node',
      fetchLatest: async () => '1.2.0',
    });
    expect(out.exit).toBe(EXIT.SUCCESS);
    expect(out.data.updateAvailable).toBe(false);
    expect(out.human).toContain('up to date');
  });

  it('picks the upgrade command from the detected install channel', async () => {
    const out = await runUpdate({
      currentVersion: '1.0.0',
      execPath: '/opt/homebrew/Cellar/mcpfold/1.0.0/bin/mcpfold',
      fetchLatest: async () => '1.5.0',
    });
    expect(out.data.channel).toBe('homebrew');
    expect(out.data.upgradeCommand).toBe('brew upgrade mcpfold');
  });

  it('degrades gracefully (exit 0, checkFailed) when the registry is unreachable', async () => {
    const out = await runUpdate({
      currentVersion: '1.0.0',
      execPath: '/usr/bin/node',
      fetchLatest: async () => null,
    });
    expect(out.exit).toBe(EXIT.SUCCESS);
    expect(out.data.checkFailed).toBe(true);
    expect(out.data.updateAvailable).toBe(false);
    expect(out.human).toContain("Couldn't reach the registry");
  });
});
