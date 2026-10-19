#!/usr/bin/env node
// Purge exactly what a sync changed: Cache-Tags from bot/sync-d1.mjs and image
// URLs from bot/sync-r2.mjs. Usage: node bot/purge-cache.mjs changed.json [more.json]
// Needs CLOUDFLARE_API_TOKEN (Zone > Cache Purge) and CF_ZONE_ID. Without them
// it prints what it would purge and exits 0, so a missing token never blocks a sync.
import { readFileSync } from 'node:fs';

const CHUNK = 30;

export async function purge({ tags = [], urls = [] }, { zoneId, token, fetchImpl = fetch, log = console.log }) {
  if (!tags.length && !urls.length) {
    log('purge: nothing changed');
    return 0;
  }
  if (!zoneId || !token) {
    log(`purge skipped (CF_ZONE_ID / CLOUDFLARE_API_TOKEN not set): ${tags.length} tags, ${urls.length} urls`);
    return 0;
  }
  let calls = 0;
  const send = async (body) => {
    const res = await fetchImpl(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    const json = await res.json().catch(() => ({}));
    calls++;
    if (!res.ok || json.success === false) throw new Error(`purge failed: ${(json.errors ?? []).map((e) => e.message).join('; ') || res.status}`);
  };
  for (let i = 0; i < tags.length; i += CHUNK) await send({ tags: tags.slice(i, i + CHUNK) });
  for (let i = 0; i < urls.length; i += CHUNK) await send({ files: urls.slice(i, i + CHUNK) });
  log(`purged ${tags.length} tags and ${urls.length} urls in ${calls} calls`);
  return calls;
}

if (process.argv[1] && import.meta.url === `file://${process.argv[1]}`) {
  const merged = { tags: new Set(), urls: new Set() };
  for (const file of process.argv.slice(2)) {
    try {
      const j = JSON.parse(readFileSync(file, 'utf8'));
      (j.tags ?? []).forEach((t) => merged.tags.add(t));
      (j.urls ?? []).forEach((u) => merged.urls.add(u));
    } catch {}
  }
  purge({ tags: [...merged.tags], urls: [...merged.urls] }, { zoneId: process.env.CF_ZONE_ID, token: process.env.CLOUDFLARE_API_TOKEN }).catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}
