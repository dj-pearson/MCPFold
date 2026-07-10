import type { APIRequestContext } from '@playwright/test';

/**
 * Since S15.8, `/sitemap.xml` is a sitemap INDEX and the page URLs live in typed child sitemaps
 * (sitemap-core.xml, sitemap-guides.xml, …). This fetches the index plus every child it references
 * and returns all their XML concatenated, so a membership check (`toContain('…/some-page')`) works
 * regardless of which child a page landed in.
 */
export async function allSitemaps(request: APIRequestContext): Promise<string> {
  const index = await (await request.get('/sitemap.xml')).text();
  let all = index;
  for (const m of index.matchAll(/<loc>https:\/\/mcpfold\.com\/(sitemap-[^<]+\.xml)<\/loc>/g)) {
    all += await (await request.get(`/${m[1]}`)).text();
  }
  return all;
}
