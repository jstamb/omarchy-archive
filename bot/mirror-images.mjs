#!/usr/bin/env node
/**
 * Pull every hotlinked post image into the archive and mark it hosted.
 *
 * Usage:
 *   node bot/mirror-images.mjs             # mirror hotlinked post images
 *   node bot/mirror-images.mjs --dry-run   # list what would be pulled
 *   node bot/mirror-images.mjs --file themes.json   # another collection
 *
 * Why posts and not everything: a setup screenshot is the archive's own
 * collection and its host is somebody's social CDN — pbs.twimg.com in
 * particular rewrites and expires URLs, so a hotlinked desk is a blank card
 * waiting to happen. Theme and plugin thumbnails stay linked on purpose:
 * there are 1,800+ of them, they live on omarchy.org and plugins.omarchy.org,
 * and copying those would make this a mirror rather than an index.
 *
 * Run this after any batch that added records with remote images — the X
 * scraper produces them by default, since it only ever sees a URL.
 */
import { join } from 'node:path';
import { DATA_DIR, parseArgs, readJson, storeImage, writeJson } from './lib/util.mjs';

const flags = parseArgs(process.argv.slice(2));
const file = typeof flags.file === 'string' ? flags.file : 'posts.json';
const path = join(DATA_DIR, file);

const records = await readJson(path, null);
if (!Array.isArray(records)) throw new Error(`data/${file} is not an array of records`);

const kind = file.replace('.json', '');
const remote = records.filter(
  (record) => typeof record.image === 'string' && record.image.startsWith('http'),
);

if (remote.length === 0) {
  console.log(`mirror: nothing to do — every image in data/${file} is already hosted`);
  process.exit(0);
}

if (flags['dry-run']) {
  for (const record of remote) console.log(`  ${record.id}\n    ${record.image}`);
  console.log(`\n${remote.length} image(s) would be mirrored into public/images/${kind}/`);
  process.exit(0);
}

let mirrored = 0;
const failures = [];

for (const record of remote) {
  try {
    // storeImage re-encodes to the house rules: WebP, max edge 1200px, q80,
    // metadata stripped — so an 8MB PNG off a CDN lands as a normal card image.
    const stored = await storeImage(kind, record.id, record.image);
    console.log(`  ${record.id} — ${Math.round(stored.bytes / 1024)}KB`);
    record.image = stored.path;
    record.image_hosted = true;
    mirrored++;
  } catch (error) {
    // A dead or blocked URL should not lose the record; the page falls back to
    // the typographic placeholder and the run continues.
    failures.push(`${record.id}: ${error.message}`);
  }
}

if (mirrored > 0) await writeJson(path, records);

console.log(`\nmirror: ${mirrored} hosted, ${failures.length} failed`);
for (const failure of failures) console.warn(`  warn  ${failure}`);
if (mirrored === 0 && failures.length > 0) process.exitCode = 1;
