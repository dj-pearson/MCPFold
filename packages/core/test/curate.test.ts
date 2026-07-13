import { describe, expect, it } from 'vitest';
import { analyzeUsage, parseAuditEvents, recommendDirective, usedTools } from '../src/curate.js';

/** Build a JSONL `tools/call` line. */
function call(
  server: string,
  tool: string,
  outcome: 'ok' | 'error' | 'denied',
  ts: string,
): string {
  return JSON.stringify({ ts, server, type: 'tools/call', tool, outcome });
}

describe('parseAuditEvents (S23.1)', () => {
  it('skips blank and malformed lines and non-object JSON', () => {
    const lines = [
      '',
      '   ',
      'not json at all',
      '42',
      'null',
      '{"server":"github"}', // missing type → skipped
      call('github', 'search_code', 'ok', '2026-07-01T00:00:00.000Z'),
    ];
    const events = parseAuditEvents(lines);
    expect(events).toHaveLength(1);
    expect(events[0]).toMatchObject({
      server: 'github',
      type: 'tools/call',
      tool: 'search_code',
      outcome: 'ok',
    });
  });

  it('retains filter-drift and toolless events for later filtering', () => {
    const events = parseAuditEvents([
      JSON.stringify({ ts: 't', server: 'github', type: 'filter-drift', reason: 'x' }),
    ]);
    expect(events).toHaveLength(1);
    const e = events[0]!;
    expect(e.type).toBe('filter-drift');
    expect(e.tool).toBeUndefined();
  });
});

describe('analyzeUsage (S23.1)', () => {
  const lines = [
    call('github', 'search_code', 'ok', '2026-07-01T00:00:00.000Z'),
    call('github', 'search_code', 'error', '2026-07-05T00:00:00.000Z'),
    call('github', 'create_pr', 'ok', '2026-07-03T00:00:00.000Z'),
    call('github', 'delete_repo', 'denied', '2026-07-02T00:00:00.000Z'),
    JSON.stringify({
      ts: '2026-07-04T00:00:00.000Z',
      server: 'github',
      type: 'filter-drift',
      reason: 'x',
    }),
    call('supabase', 'run_sql', 'ok', '2026-07-06T00:00:00.000Z'),
  ];
  const events = parseAuditEvents(lines);

  it('groups by server -> tool with call counts, outcome tally, and last-seen', () => {
    const usage = analyzeUsage(events);
    expect([...usage.keys()].sort()).toEqual(['github', 'supabase']);
    const gh = usage.get('github')!;
    const sc = gh.tools.get('search_code')!;
    expect(sc.calls).toBe(2);
    expect(sc.outcomes).toEqual({ ok: 1, error: 1, denied: 0 });
    expect(sc.lastTs).toBe('2026-07-05T00:00:00.000Z'); // most recent, not first
    expect(gh.tools.get('delete_repo')!.outcomes).toEqual({ ok: 0, error: 0, denied: 1 });
    expect(gh.tools.has('x')).toBe(false); // filter-drift ignored
  });

  it('ignores non tools/call events (drift does not become a tool)', () => {
    const usage = analyzeUsage(events);
    expect(usage.get('github')!.tools.size).toBe(3); // search_code, create_pr, delete_repo
  });

  it('filters by sinceMs (drops earlier calls)', () => {
    const cutoff = Date.parse('2026-07-04T00:00:00.000Z');
    const usage = analyzeUsage(events, { sinceMs: cutoff });
    const gh = usage.get('github')!;
    expect(gh.tools.has('create_pr')).toBe(false); // 07-03, before cutoff
    expect(gh.tools.has('delete_repo')).toBe(false); // 07-02, before cutoff
    // search_code has one call at 07-05 (kept) — the 07-01 one is dropped
    expect(gh.tools.get('search_code')!.calls).toBe(1);
  });

  it('filters by minCalls after aggregation', () => {
    const usage = analyzeUsage(events, { minCalls: 2 });
    const gh = usage.get('github')!;
    expect(gh.tools.has('search_code')).toBe(true); // 2 calls
    expect(gh.tools.has('create_pr')).toBe(false); // 1 call
  });
});

describe('usedTools (S23.1)', () => {
  it('includes ok/error tools, excludes denied-only, sorted', () => {
    const events = parseAuditEvents([
      call('s', 'zed_tool', 'ok', 't'),
      call('s', 'able_tool', 'error', 't'),
      call('s', 'blocked', 'denied', 't'),
    ]);
    const usage = analyzeUsage(events).get('s')!;
    expect(usedTools(usage)).toEqual(['able_tool', 'zed_tool']);
  });
});

describe('recommendDirective (S23.1)', () => {
  it('recommends a sorted, de-duplicated allow directive', () => {
    const rec = recommendDirective({ used: ['b', 'a', 'a', 'c'] });
    expect(rec.recommended).toEqual({ mode: 'allow', list: ['a', 'b', 'c'] });
  });

  it('diffs against a current allow directive (added/removed/unchanged)', () => {
    const rec = recommendDirective({
      used: ['a', 'b'],
      current: { mode: 'allow', list: ['b', 'c'] },
    });
    expect(rec.diff.added).toEqual(['a']); // used but not currently allowed
    expect(rec.diff.unchanged).toEqual(['b']);
    expect(rec.diff.removed).toEqual(['c']); // allowed but unused
    expect(rec.unchanged).toBe(false);
  });

  it('flags unchanged when recommendation equals current allow directive', () => {
    const rec = recommendDirective({
      used: ['a', 'b'],
      current: { mode: 'allow', list: ['b', 'a'] },
    });
    expect(rec.unchanged).toBe(true);
    expect(rec.diff.added).toEqual([]);
    expect(rec.diff.removed).toEqual([]);
  });

  it('with no current directive, removed surfaces known-but-unused tools', () => {
    const rec = recommendDirective({
      used: ['a'],
      knownTools: ['a', 'b', 'c'],
    });
    expect(rec.diff.added).toEqual([]); // a is within the known/visible surface
    expect(rec.diff.removed).toEqual(['b', 'c']); // would be dropped by the tighter allow-list
    expect(rec.unusedKnown).toEqual(['b', 'c']);
  });

  it('for a deny directive, subtracts denied tools from the visible surface', () => {
    const rec = recommendDirective({
      used: ['a'],
      current: { mode: 'deny', list: ['x'] },
      knownTools: ['a', 'b', 'x'],
    });
    // visible = {a,b,x} minus denied {x} = {a,b}; recommend {a} → removed {b}
    expect(rec.diff.removed).toEqual(['b']);
    expect(rec.diff.removed).not.toContain('x');
  });
});
