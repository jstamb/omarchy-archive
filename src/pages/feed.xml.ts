import type { APIRoute } from 'astro';
import type { Post } from '../lib/content';
import { cacheHeaders, env } from '../lib/db';
import { esc } from '../lib/sitemap';
import { meta } from '../lib/summary';

// RSS 2.0: the 50 newest indexed posts, from D1.
export const prerender = false;

const rfc822 = (value?: string | null) => {
  const d = value ? new Date(value.length === 10 ? `${value}T00:00:00Z` : value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toUTCString() : null;
};

export const GET: APIRoute = async ({ locals }) => {
  const { DB } = env(locals);
  const { results } = await DB.prepare('SELECT doc FROM posts ORDER BY added_at DESC, ord DESC LIMIT 50').all<{ doc: string }>();
  const posts = results.map((r: { doc: string }) => JSON.parse(r.doc) as Post);
  const site = meta.site_url;
  const items = posts
    .map((p: Post) => {
      const link = new URL(`/posts/${p.id}/`, site).href;
      const date = rfc822(p.added_at ?? p.created_at);
      return `    <item>
      <title>${esc(p.title)}</title>
      <link>${esc(link)}</link>
      <guid isPermaLink="true">${esc(link)}</guid>${date ? `\n      <pubDate>${date}</pubDate>` : ''}${
        p.summary ? `\n      <description>${esc(p.summary)}</description>` : ''
      }${p.author ? `\n      <dc:creator>${esc(p.author)}</dc:creator>` : ''}
    </item>`;
    })
    .join('\n');
  const res = new Response(
    `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${esc(meta.site_name)}</title>
    <link>${esc(site)}</link>
    <description>${esc(meta.tagline)}</description>
    <atom:link href="${esc(new URL('/feed.xml', site).href)}" rel="self" type="application/rss+xml"/>
${items}
  </channel>
</rss>
`,
    { headers: { 'content-type': 'application/rss+xml; charset=utf-8' } },
  );
  cacheHeaders(res.headers, ['feed'], 3600);
  return res;
};
