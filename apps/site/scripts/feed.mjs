/**
 * Blog RSS feed generation (SEO-3), pure and dependency-free so the date handling is testable.
 *
 * The feed used to emit the raw frontmatter date (`2026-07-08`) as <pubDate>. RSS 2.0 requires
 * RFC-822 dates, so readers either dropped the item's date or rejected the item — and a feed with
 * unparseable dates cannot be ordered, which is the one thing a feed is for. It also carried none
 * of the channel metadata (self link, language, lastBuildDate) that feed validators and Google's
 * blog discovery expect.
 *
 * Run `node scripts/feed.mjs --self-test` to check the date conversion and the emitted channel.
 */

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

const pad = (n) => String(n).padStart(2, '0');

/**
 * Convert a frontmatter date to an RFC-822 timestamp in GMT, as RSS 2.0 requires.
 * Accepts `YYYY-MM-DD` (treated as midnight GMT) or anything Date can parse.
 *
 * @param {string} value
 * @returns {string|undefined} e.g. "Wed, 08 Jul 2026 00:00:00 GMT", or undefined if unparseable
 */
export function rfc822(value) {
  if (!value) return undefined;
  const raw = String(value).trim();
  // Date-only strings are parsed as UTC by spec; keep them there so the day never shifts.
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(raw) ? `${raw}T00:00:00Z` : raw);
  if (Number.isNaN(d.getTime())) return undefined;
  return (
    `${DAYS[d.getUTCDay()]}, ${pad(d.getUTCDate())} ${MONTHS[d.getUTCMonth()]} ` +
    `${d.getUTCFullYear()} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())} GMT`
  );
}

const esc = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/**
 * Render the blog RSS feed.
 *
 * @param {{siteUrl: string, posts: Array<{slug:string,title:string,date:string,description:string}>, buildDate?: Date}} opts
 * @returns {string} RSS 2.0 XML
 */
export function renderFeed({ siteUrl, posts, buildDate = new Date() }) {
  const items = posts
    .map((p) => {
      const url = `${siteUrl}/blog/${p.slug}`;
      const pubDate = rfc822(p.date);
      return [
        '    <item>',
        `      <title>${esc(p.title)}</title>`,
        `      <link>${esc(url)}</link>`,
        // isPermaLink is explicit so readers treat the guid as the canonical post URL.
        `      <guid isPermaLink="true">${esc(url)}</guid>`,
        `      <description>${esc(p.description)}</description>`,
        // Omit pubDate entirely rather than emit an unparseable one.
        ...(pubDate ? [`      <pubDate>${pubDate}</pubDate>`] : []),
        '    </item>',
      ].join('\n');
    })
    .join('\n');

  // lastBuildDate reflects the newest post, not the build clock, so a docs-only deploy doesn't
  // signal "the feed changed" to every reader polling it.
  const newest = posts.map((p) => rfc822(p.date)).find(Boolean);

  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">',
    '  <channel>',
    '    <title>mcpfold blog</title>',
    `    <link>${siteUrl}/blog</link>`,
    '    <description>Launches, deep-dives, and release notes from mcpfold.</description>',
    '    <language>en-us</language>',
    `    <atom:link href="${siteUrl}/feed.xml" rel="self" type="application/rss+xml" />`,
    `    <lastBuildDate>${newest ?? rfc822(buildDate.toISOString())}</lastBuildDate>`,
    items,
    '  </channel>',
    '</rss>',
    '',
  ].join('\n');
}

// --- Self-test -------------------------------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const failures = [];
  const eq = (label, actual, expected) => {
    if (actual !== expected) failures.push(`${label}: expected ${expected}, got ${actual}`);
  };

  eq('date-only → RFC-822 GMT', rfc822('2026-07-08'), 'Wed, 08 Jul 2026 00:00:00 GMT');
  eq('no day shift across timezones', rfc822('2026-01-01'), 'Thu, 01 Jan 2026 00:00:00 GMT');
  eq('full timestamp', rfc822('2026-07-08T13:45:02Z'), 'Wed, 08 Jul 2026 13:45:02 GMT');
  eq('unparseable → undefined', rfc822('not a date'), undefined);
  eq('empty → undefined', rfc822(''), undefined);

  const xml = renderFeed({
    siteUrl: 'https://mcpfold.com',
    posts: [
      { slug: 'a', title: 'A & B', date: '2026-07-08', description: 'first' },
      { slug: 'b', title: 'B', date: 'garbage', description: 'second' },
    ],
  });
  const has = (needle, label) => {
    if (!xml.includes(needle)) failures.push(`${label}: missing ${needle}`);
  };
  has('xmlns:atom="http://www.w3.org/2005/Atom"', 'atom namespace');
  has('rel="self"', 'atom self link');
  has('<language>en-us</language>', 'language');
  has('<pubDate>Wed, 08 Jul 2026 00:00:00 GMT</pubDate>', 'RFC-822 pubDate');
  has('<lastBuildDate>Wed, 08 Jul 2026 00:00:00 GMT</lastBuildDate>', 'lastBuildDate from newest post');
  has('<title>A &amp; B</title>', 'escaped title');
  has('isPermaLink="true"', 'guid permalink');
  // The item with an unparseable date keeps its entry but drops the bad pubDate.
  if ((xml.match(/<item>/g) ?? []).length !== 2) failures.push('both items should render');
  if ((xml.match(/<pubDate>/g) ?? []).length !== 1) {
    failures.push('an unparseable date must not emit a pubDate');
  }
  if (xml.includes('2026-07-08<')) failures.push('raw ISO date leaked into the feed');

  if (failures.length) {
    console.error('✗ feed self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log('✓ feed self-test passed (RFC-822 dates, channel metadata, escaping)');
}
