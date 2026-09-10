/**
 * Heading-outline and image audits over the prerendered HTML (SEO-11, SEO-12).
 *
 * A page's heading outline is how both a crawler and a screen reader understand its structure, and
 * nothing in the build checked it. At pSEO scale the failure mode is silent: a template change adds
 * a second <h1>, or a section drops from <h2> to <h3>, on hundreds of pages at once.
 *
 * The audit is scoped to the page's own <main> content. The shared header, the Related block and
 * the footer (which renders an <h2> per group) are shell chrome present on every page — including
 * them would drown the signal and make a real skip undetectable.
 *
 * The image audit (SEO-12) rides along on the same pass: every <img> needs alt text a screen reader
 * and an image crawler can use, and intrinsic width/height so the browser reserves the box before
 * the bytes arrive — a missing pair on an above-the-fold image is a CLS hit on Core Web Vitals.
 *
 * Run `node scripts/headings.mjs --self-test`.
 */

/** The inner HTML of the page's <main>, or the whole document if it has none. */
export function mainRegion(html) {
  const match = /<main\b[^>]*>([\s\S]*?)<\/main>/i.exec(html);
  return match ? match[1] : html;
}

/**
 * The heading outline of an HTML fragment, in document order.
 *
 * @param {string} html
 * @returns {Array<{level: number, text: string}>}
 */
export function headingOutline(html) {
  const out = [];
  for (const m of html.matchAll(/<h([1-6])\b[^>]*>([\s\S]*?)<\/h\1>/gi)) {
    out.push({
      level: Number(m[1]),
      // Strip nested markup and collapse whitespace so "text" means what a reader sees.
      text: (m[2] ?? '')
        .replace(/<[^>]*>/g, '')
        .replace(/&[a-z]+;|&#\d+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim(),
    });
  }
  return out;
}

/**
 * @param {Array<{route: string, html: string}>} pages
 * @returns {string[]} problems (empty = clean)
 */
export function auditHeadings(pages) {
  const problems = [];
  for (const { route, html } of pages) {
    const outline = headingOutline(mainRegion(html));
    const h1s = outline.filter((h) => h.level === 1);

    if (h1s.length === 0) {
      problems.push(`${route}: no <h1> in <main>`);
    } else if (h1s.length > 1) {
      problems.push(`${route}: ${h1s.length} <h1> elements in <main> (expected 1)`);
    } else if (!h1s[0].text) {
      problems.push(`${route}: <h1> is empty`);
    }

    for (const [i, heading] of outline.entries()) {
      if (!heading.text) {
        problems.push(`${route}: empty <h${heading.level}> at position ${i + 1}`);
      }
    }

    // A level may only descend one step at a time; it may jump back up any number of steps.
    let previous = 0;
    for (const heading of outline) {
      if (previous !== 0 && heading.level > previous + 1) {
        problems.push(
          `${route}: heading level jumps h${previous} → h${heading.level} ("${heading.text}")`,
        );
      }
      previous = heading.level;
    }
  }
  return problems;
}

/** Every <img> tag in an HTML fragment, with its parsed attributes. */
export function imagesFromHtml(html) {
  return [...html.matchAll(/<img\b([^>]*)>/gi)].map((m) => {
    const attrs = {};
    for (const a of (m[1] ?? '').matchAll(/([a-zA-Z-]+)(?:="([^"]*)")?/g)) {
      attrs[a[1].toLowerCase()] = a[2] ?? '';
    }
    return attrs;
  });
}

/**
 * @param {Array<{route: string, html: string}>} pages
 * @returns {{problems: string[], warnings: string[]}}
 */
export function auditImages(pages) {
  const problems = [];
  const warnings = [];
  for (const { route, html } of pages) {
    // Scoped to <main> like the heading audit — the shell's logo is audited once via the home page.
    for (const [i, img] of imagesFromHtml(mainRegion(html)).entries()) {
      const where = `${route}: <img src="${img.src ?? '?'}">`;

      // alt="" is a valid, deliberate signal for a decorative image; a missing attribute is not.
      if (img.alt === undefined) {
        problems.push(`${where} has no alt attribute`);
      } else if (!img.alt.trim() && img['aria-hidden'] !== 'true' && img.role !== 'presentation') {
        warnings.push(`${where} has empty alt — mark it aria-hidden if that is deliberate`);
      }

      if (!img.width || !img.height) {
        problems.push(`${where} has no intrinsic width/height — it will shift layout as it loads`);
      }

      if (img.loading === 'lazy' && img.fetchpriority === 'high') {
        problems.push(`${where} is both lazy and high priority — pick one`);
      }
      if (!img.loading && i > 0) {
        warnings.push(`${where} has no loading hint; below-the-fold images should be lazy`);
      }
    }
  }
  return { problems, warnings };
}

// --- Self-test -------------------------------------------------------------------------------
if (process.argv.includes('--self-test')) {
  const failures = [];
  const expect = (label, cond) => {
    if (!cond) failures.push(label);
  };
  const page = (route, main) => ({
    route,
    // Shell chrome the audit must ignore: a header and a footer <h2> on every page.
    html: `<header><h2>nav</h2></header><main id="main" tabindex="-1">${main}</main><footer><h2>Product</h2></footer>`,
  });

  expect(
    'scopes to <main>',
    headingOutline(mainRegion(page('/x', '<h1>Only this</h1>').html)).length === 1,
  );
  expect(
    'falls back to the whole document without <main>',
    headingOutline(mainRegion('<h1>Bare</h1>')).length === 1,
  );
  expect(
    'strips nested markup from heading text',
    headingOutline('<h1>Add <code>mcpfold</code> now</h1>')[0].text === 'Add mcpfold now',
  );

  const clean = auditHeadings([
    page('/a', '<h1>Title</h1><h2>Section</h2><h3>Detail</h3><h2>Back up</h2>'),
    page('/b', '<h1 class="x">Styled</h1><h2>One</h2>'),
  ]);
  expect(`clean outlines pass (got ${JSON.stringify(clean)})`, clean.length === 0);

  const dirty = auditHeadings([
    page('/none', '<h2>No h1 here</h2>'),
    page('/two', '<h1>First</h1><h1>Second</h1>'),
    page('/skip', '<h1>Title</h1><h3>Skipped h2</h3>'),
    page('/empty', '<h1>  </h1><h2></h2>'),
  ]);
  const has = (needle) => dirty.some((p) => p.includes(needle));
  expect('flags a missing h1', has('/none: no <h1>'));
  expect('flags a duplicate h1', has('/two: 2 <h1>'));
  expect('flags a level skip', has('h1 → h3'));
  expect('flags an empty h1', has('/empty: <h1> is empty'));
  expect('flags an empty h2', has('/empty: empty <h2>'));
  expect('does not flag the footer h2 as a skip', !dirty.some((p) => p.includes('/two: heading level')));

  // --- Images (SEO-12) ---
  const imgPage = (route, main) => ({ route, html: `<main>${main}</main>` });
  const imgClean = auditImages([
    imgPage(
      '/ok',
      '<img src="/a.svg" alt="A diagram" width="900" height="557" loading="eager" fetchpriority="high">' +
        '<img src="/b.png" alt="" aria-hidden="true" width="24" height="24" loading="lazy">',
    ),
  ]);
  expect(
    `clean images pass (got ${JSON.stringify(imgClean)})`,
    imgClean.problems.length === 0 && imgClean.warnings.length === 0,
  );

  const imgDirty = auditImages([
    imgPage('/bad', '<img src="/no-alt.png" width="10" height="10" loading="lazy">'),
    imgPage('/bad2', '<img src="/no-dims.png" alt="x" loading="lazy">'),
    imgPage(
      '/bad3',
      '<img src="/conflict.png" alt="x" width="1" height="1" loading="lazy" fetchpriority="high">',
    ),
    imgPage('/bad4', '<img src="/silent.png" alt="  " width="1" height="1" loading="lazy">'),
  ]);
  const imgHas = (needle) =>
    [...imgDirty.problems, ...imgDirty.warnings].some((p) => p.includes(needle));
  expect('flags a missing alt attribute', imgHas('no alt attribute'));
  expect('flags missing dimensions', imgHas('no intrinsic width/height'));
  expect('flags lazy + high priority', imgHas('both lazy and high priority'));
  expect('warns on an undeclared empty alt', imgHas('has empty alt'));
  expect(
    'accepts aria-hidden empty alt without warning',
    !imgClean.warnings.some((w) => w.includes('empty alt')),
  );

  if (failures.length) {
    console.error('✗ headings/images self-test FAILED:\n  ' + failures.join('\n  '));
    process.exit(1);
  }
  console.log(
    '✓ headings/images self-test passed (single h1, level skips, main scoping; alt text, dimensions, loading hints)',
  );
}
