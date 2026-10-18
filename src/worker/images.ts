// Images live in R2 (bucket bound as IMAGES), uploaded by bot/sync-r2.mjs.
// public/images stays in git as the source, but `.assetsignore` keeps it out of
// the static-asset upload, so the image count never touches the file limit.
// Records keep their relative `/images/...` value; nothing in data/ changes.

import type { ExecutionContext, R2Bucket } from '@cloudflare/workers-types';

const TYPES: Record<string, string> = {
  webp: 'image/webp',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  svg: 'image/svg+xml',
  avif: 'image/avif',
};

export async function serveImage(request: Request, bucket: R2Bucket | undefined, ctx: ExecutionContext) {
  if (request.method !== 'GET' && request.method !== 'HEAD') return new Response('Method not allowed', { status: 405 });
  const url = new URL(request.url);
  const key = decodeURIComponent(url.pathname.slice(1)); // images/posts/x.webp
  if (!bucket || key.includes('..')) return new Response('Not found', { status: 404 });

  const cache = (globalThis as unknown as { caches: { default: globalThis.Cache } }).caches.default;
  const cacheKey = new Request(url.origin + url.pathname);
  const hit = await cache.match(cacheKey);
  if (hit) return hit;

  const object = await bucket.get(key);
  if (!object) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'public, max-age=60' } });
  const headers = new Headers();
  object.writeHttpMetadata(headers as never);
  headers.set('etag', object.httpEtag);
  if (!headers.get('content-type')) {
    headers.set('content-type', TYPES[key.split('.').pop()?.toLowerCase() ?? ''] ?? 'application/octet-stream');
  }
  // A changed image is purged by URL (bot/sync-r2.mjs -> bot/purge-cache.mjs).
  headers.set('Cache-Control', 'public, max-age=86400, s-maxage=2592000');
  headers.set('Cache-Tag', 'images');
  const res = new Response(object.body as unknown as ReadableStream, { headers });
  ctx.waitUntil(cache.put(cacheKey, res.clone()));
  return res;
}
