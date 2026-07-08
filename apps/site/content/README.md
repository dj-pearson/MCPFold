# Authoring a blog post

Adding a post is a **one-file** process:

1. Create `apps/site/content/blog/<slug>.md`.
2. Add frontmatter and write markdown:

   ```markdown
   ---
   title: Your title
   date: 2026-07-08
   description: One-line summary used for the list, OG card, and RSS.
   ---

   Your post body in markdown.
   ```

That's it. The post appears in the [blog index](../src/blog/BlogIndex.tsx) (sorted by `date`,
newest first), gets its own page with OG tags, and is added to the sitemap and the RSS feed
(`/feed.xml`) automatically at build time (see `apps/site/scripts/gen-seo.mjs`).

The [changelog](../src/blog/Changelog.tsx) is separate — it renders the repo's `CHANGELOG.md`
directly, so release notes are never maintained twice.
