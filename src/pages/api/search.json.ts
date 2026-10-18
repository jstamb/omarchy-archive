import type { APIRoute } from 'astro';
import { cacheHeaders, env } from '../../lib/db';
import { renderSnippet, toMatch } from '../../lib/search-query';

// D1 FTS5 search, replacing the Pagefind index (which was thousands of files).
//   /api/search.json?q=tailscale[&type=plugin]  -> { total, unfiltered, results: [...] }
//   /api/search.json?facets=1                   -> { counts: { post: n, plugin: n, ... } }
export const prerender = false;

const TYPES = new Set(['setup', 'guide', 'post', 'theme', 'plugin', 'release', 'page']);
const MAX_RESULTS = 200;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json; charset=utf-8' } });

export const GET: APIRoute = async ({ url, locals }) => {
  const { DB } = env(locals);
  if (url.searchParams.get('facets')) {
    const { results } = await DB.prepare('SELECT type, count(*) AS n FROM search GROUP BY type').all<{ type: string; n: number }>();
    const res = json({ counts: Object.fromEntries(results.map((r: { type: string; n: number }) => [r.type, r.n])) });
    cacheHeaders(res.headers, ['search'], 3600);
    return res;
  }

  const q = (url.searchParams.get('q') ?? '').slice(0, 200);
  const type = url.searchParams.get('type') ?? '';
  const match = toMatch(q);
  if (!match) return json({ total: 0, unfiltered: 0, results: [] });

  const filter = TYPES.has(type) ? type : '';
  const [countRows, hits] = await DB.batch<{ type?: string; n?: number; url?: string; title?: string; snip?: string }>([
    DB.prepare('SELECT type, count(*) AS n FROM search WHERE search MATCH ?1 GROUP BY type').bind(match),
    DB.prepare(
      `SELECT type, url, title, snippet(search, 5, char(1), char(2), '…', 18) AS snip
       FROM search WHERE search MATCH ?1 ${filter ? 'AND type = ?2' : ''}
       ORDER BY bm25(search, 0, 0, 0, 0, 8.0, 1.0) LIMIT ${MAX_RESULTS}`,
    ).bind(...(filter ? [match, filter] : [match])),
  ]);
  const byType = Object.fromEntries(countRows.results.map((r: { type?: string; n?: number }) => [r.type, r.n ?? 0]));
  const unfiltered = Object.values(byType as Record<string, number>).reduce((a, b) => a + b, 0);
  const res = json({
    total: filter ? (byType[filter] ?? 0) : unfiltered,
    unfiltered,
    counts: byType,
    results: hits.results.map((h: { url?: string; title?: string; type?: string; snip?: string }) => ({ url: h.url, title: h.title, type: h.type, excerpt: renderSnippet(h.snip ?? '') })),
  });
  cacheHeaders(res.headers, ['search'], 600);
  return res;
};
