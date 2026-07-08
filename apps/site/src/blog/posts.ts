import { marked } from 'marked';

/**
 * Blog posts (S13.7) — authored as markdown in apps/site/content/blog/*.md with `title`, `date`,
 * and `description` frontmatter. Adding a post is a one-file process: drop a new `.md` there. Vite
 * inlines them at build (import.meta.glob ?raw); the RSS feed + sitemap are generated from the same
 * files in gen-seo.mjs.
 */
const files = import.meta.glob('../../content/blog/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>;

export interface Post {
  slug: string;
  title: string;
  date: string;
  description: string;
  html: string;
}

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const m = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(raw);
  if (!m) return { meta: {}, body: raw };
  const meta: Record<string, string> = {};
  for (const line of m[1]!.split('\n')) {
    const i = line.indexOf(':');
    if (i > 0) meta[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { meta, body: m[2] ?? '' };
}

export const POSTS: Post[] = Object.entries(files)
  .map(([path, raw]) => {
    const slug = (path.split('/').pop() ?? '').replace(/\.md$/, '');
    const { meta, body } = parseFrontmatter(raw);
    return {
      slug,
      title: meta.title ?? slug,
      date: meta.date ?? '',
      description: meta.description ?? '',
      html: marked.parse(body, { async: false }) as string,
    };
  })
  .sort((a, b) => b.date.localeCompare(a.date));

export function postBySlug(slug: string | undefined): Post | undefined {
  return POSTS.find((p) => p.slug === slug);
}
