import { defineMiddleware } from 'astro:middleware';

/**
 * Edge cache for on-demand pages. A hit costs no D1 read and almost no CPU.
 * Responses opt in by sending `s-maxage` (see lib/db.ts cacheHeaders), and
 * carry `Cache-Tag` so bot/purge-cache.mjs can purge exactly what a sync
 * changed. The key carries the build id so a code deploy never serves HTML
 * rendered against the previous build's JS/CSS.
 */
export const onRequest = defineMiddleware(async (context, next) => {
  const cache = (globalThis as { caches?: { default?: Cache } }).caches?.default;
  const runtime = context.locals.runtime;
  if (context.isPrerendered || context.request.method !== 'GET' || !cache || !runtime?.ctx) return next();

  const url = new URL(context.request.url);
  url.searchParams.set('__b', __BUILD_ID__);
  const key = new Request(url.toString(), { method: 'GET' });
  const hit = await cache.match(key);
  if (hit) {
    const res = new Response(hit.body, hit);
    res.headers.set('x-edge-cache', 'HIT');
    return res;
  }
  const res = await next();
  if (res.status === 200 && /s-maxage=\d+/.test(res.headers.get('Cache-Control') ?? '')) {
    runtime.ctx.waitUntil(cache.put(key, res.clone()));
    res.headers.set('x-edge-cache', 'MISS');
  }
  return res;
});
