import type { APIRoute } from 'astro';
import { cacheHeaders, env } from '../lib/db';
import { SITEMAP_CHUNK, esc, xml } from '../lib/sitemap';
import { creatorSlugs, meta } from '../lib/summary';
import { urlset } from '../lib/sitemap';

// Sitemap index plus its children. Children are chunked (5,000 URLs each) so no
// single response grows with the archive:
//   /sitemap.xml                    index
//   /sitemap.xml?part=posts-N       posts, by id
//   /sitemap.xml?part=plugins-N     plugins, by id
//   /sitemap.xml?part=creators      creator pages
//   /sitemap-static.xml             prebuilt: fixed pages + themes
export const prerender = false;

export const GET: APIRoute = async ({ locals, url }) => {
  const part = url.searchParams.get('part');
  if (part) return child(part, locals);
  const { DB } = env(locals);
  const [posts, plugins] = await DB.batch<{ n: number }>([
    DB.prepare('SELECT count(*) AS n FROM posts'),
    DB.prepare('SELECT count(*) AS n FROM plugins'),
  ]);
  const pages = (n: number) => Math.max(1, Math.ceil(n / SITEMAP_CHUNK));
  const children = [
    '/sitemap-static.xml',
    '/sitemap.xml?part=creators',
    ...Array.from({ length: pages(posts.results[0]?.n ?? 0) }, (_, i) => `/sitemap.xml?part=posts-${i + 1}`),
    ...Array.from({ length: pages(plugins.results[0]?.n ?? 0) }, (_, i) => `/sitemap.xml?part=plugins-${i + 1}`),
  ];
  const res = xml(`<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${children.map((p) => `  <sitemap><loc>${esc(new URL(p, meta.site_url).href)}</loc></sitemap>`).join('\n')}
</sitemapindex>
`);
  cacheHeaders(res.headers, ['sitemap']);
  return res;
};

async function child(part: string, locals: App.Locals) {
  const name = part;
  let entries: { path: string; lastmod?: string | null; priority?: string }[];
  if (name === 'creators') {
    entries = [...new Set(Object.values(creatorSlugs))].sort().map((slug) => ({ path: `/creators/${slug}/`, priority: '0.5' }));
  } else {
    const m = /^(posts|plugins)-(\d+)$/.exec(name);
    if (!m) return new Response('Not found', { status: 404 });
    const page = Number(m[2]);
    const { DB } = env(locals);
    const offset = (page - 1) * SITEMAP_CHUNK;
    if (m[1] === 'posts') {
      const { results } = await DB.prepare('SELECT id, added_at FROM posts ORDER BY id LIMIT ? OFFSET ?')
        .bind(SITEMAP_CHUNK, offset)
        .all<{ id: string; added_at: string }>();
      entries = results.map((r: { id: string; added_at: string }) => ({ path: `/posts/${r.id}/`, lastmod: r.added_at, priority: '0.7' }));
    } else {
      const { results } = await DB.prepare('SELECT slug, added_at FROM plugins ORDER BY id LIMIT ? OFFSET ?')
        .bind(SITEMAP_CHUNK, offset)
        .all<{ slug: string; added_at: string }>();
      entries = results.map((r: { slug: string; added_at: string }) => ({ path: `/plugins/${r.slug}/`, lastmod: r.added_at, priority: '0.6' }));
    }
    if (!entries.length && page > 1) return new Response('Not found', { status: 404 });
  }
  const res = xml(urlset(meta.site_url, entries));
  cacheHeaders(res.headers, ['sitemap']);
  return res;
}
