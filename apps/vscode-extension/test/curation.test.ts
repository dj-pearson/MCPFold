import { describe, expect, it } from 'vitest';
import {
  buildCurationLenses,
  curatableCount,
  parseCurateReport,
  type ServerAnchor,
} from '../src/curation';

/** A minimal `mcpfold curate --json` success envelope for the given servers. */
function envelope(servers: unknown[]): string {
  return JSON.stringify({
    envelopeVersion: 1,
    ok: true,
    command: 'curate',
    data: { logPath: '/tmp/audit.jsonl', minCalls: 1, servers },
    warnings: [],
    errors: [],
  });
}

const GITHUB = {
  server: 'github',
  tools: [{ tool: 'search_code', calls: 3, outcomes: { ok: 3, error: 0, denied: 0 } }],
  currentMode: 'allow',
  recommended: { mode: 'allow', list: ['create_pr', 'search_code'] },
  added: [],
  unusedAllowed: ['delete_repo', 'list_issues'],
  alreadyCurated: false,
};
const SUPABASE = {
  server: 'supabase',
  tools: [{ tool: 'run_sql', calls: 1, outcomes: { ok: 1, error: 0, denied: 0 } }],
  currentMode: 'allow',
  recommended: { mode: 'allow', list: ['run_sql'] },
  added: [],
  unusedAllowed: [],
  alreadyCurated: true,
};

describe('parseCurateReport', () => {
  it('parses a success envelope into a per-server report', () => {
    const report = parseCurateReport(envelope([GITHUB, SUPABASE]));
    expect(report).not.toBeNull();
    expect(report!.get('github')).toEqual({
      server: 'github',
      usedCount: 2,
      unusedCount: 2,
      alreadyCurated: false,
    });
    expect(report!.get('supabase')).toEqual({
      server: 'supabase',
      usedCount: 1,
      unusedCount: 0,
      alreadyCurated: true,
    });
  });

  it('ignores a leading npx banner and parses the last JSON line', () => {
    const noisy = `npm warn exec\n${envelope([GITHUB])}`;
    const report = parseCurateReport(noisy);
    expect(report?.get('github')?.usedCount).toBe(2);
  });

  it('returns null for a non-curate, error, or unparseable envelope', () => {
    expect(parseCurateReport('')).toBeNull();
    expect(parseCurateReport('not json')).toBeNull();
    expect(parseCurateReport(JSON.stringify({ ok: false, command: 'curate' }))).toBeNull();
    expect(parseCurateReport(JSON.stringify({ ok: true, command: 'doctor', data: {} }))).toBeNull();
  });
});

describe('buildCurationLenses', () => {
  const anchors: ServerAnchor[] = [
    { name: 'github', line: 3 },
    { name: 'supabase', line: 7 },
    { name: 'unlogged', line: 11 },
  ];

  it('returns no lenses without a report', () => {
    expect(buildCurationLenses(anchors, null)).toEqual([]);
  });

  it('offers an actionable lens for a curatable server, anchored to its line', () => {
    const report = parseCurateReport(envelope([GITHUB, SUPABASE]));
    const lenses = buildCurationLenses(anchors, report);

    const gh = lenses.find((l) => l.line === 3)!;
    expect(gh.title).toContain('uses 2 tools');
    expect(gh.title).toContain('2 unused');
    expect(gh.title).toContain('Curate to usage');
    expect(gh.command).toBe('mcpfold.curateServer');
    expect(gh.args).toEqual(['github']);
  });

  it('shows a dim, no-command lens for an already-curated server', () => {
    const report = parseCurateReport(envelope([GITHUB, SUPABASE]));
    const lenses = buildCurationLenses(anchors, report);
    const sb = lenses.find((l) => l.line === 7)!;
    expect(sb.title).toContain('curated to your usage');
    expect(sb.command).toBeUndefined();
  });

  it('omits servers with no usage data entirely', () => {
    const report = parseCurateReport(envelope([GITHUB, SUPABASE]));
    const lenses = buildCurationLenses(anchors, report);
    expect(lenses.find((l) => l.line === 11)).toBeUndefined();
  });
});

describe('curatableCount', () => {
  it('counts only not-yet-curated servers with unused tools', () => {
    const report = parseCurateReport(envelope([GITHUB, SUPABASE]));
    expect(curatableCount(report)).toBe(1);
    expect(curatableCount(null)).toBe(0);
  });
});
