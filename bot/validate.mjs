#!/usr/bin/env node
/**
 * Gate on data/*.json before anything is built. Runs first in `npm run build`,
 * so a bad bot commit fails the Cloudflare build instead of shipping.
 *
 * Dependency-free on purpose: this file must run on a clean checkout with
 * nothing installed, which is exactly the state a content-only commit is in.
 *
 * Fails on:
 *   - schema violations (bot/schema.json, the subset documented in `check`)
 *   - duplicate ids, or ids that collide once slugified into a URL
 *   - duplicate source_url / repo_url — the dedup keys
 *   - install.command that is not an `omarchy` command
 *   - a hosted image path that does not exist, is not WebP, or exceeds 400KB
 *   - image_hosted that disagrees with the image path
 *   - seen_on / related_*_ids that point at nothing
 *   - public/images growing past a total budget, not just per-file
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, PUBLIC_DIR, ROOT } from './lib/util.mjs';

const MAX_IMAGE_BYTES = 400 * 1024;

/*
 * A ceiling on the whole hosted collection, not just each file.
 *
 * The per-image cap above cannot catch the failure that actually matters: the
 * scraper's quality bar eroding and it hosting a hundred junk screenshots a
 * day. Every image individually passes; the repo quietly doubles every month.
 *
 * 250MB is chosen against a real number, not a round one. Mirroring every
 * upstream asset this archive knows about — all ~1,975 theme and plugin
 * thumbnails on top of the posts — lands near 155MB. So the warn line at 60%
 * is roughly "you have hosted everything that exists", which is the point a
 * human should be deciding, and the fail line is unreachable by any honest
 * growth. Getting there means something is wrong, not that the archive got
 * popular.
 */
const IMAGE_BUDGET_BYTES = 250 * 1024 * 1024;

const schema = JSON.parse(readFileSync(join(ROOT, 'bot', 'schema.json'), 'utf8'));
const errors = [];
const warnings = [];

/** Sibling pages that would shadow a record with the same slug. */
const RESERVED_SLUGS = {
  plugins: { all: true, index: true },
  themes: { index: true },
  posts: { index: true },
};

const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

const files = {
  meta: read('meta.json'),
  sources: read('sources.json'),
  posts: read('posts.json'),
  themes: read('themes.json'),
  plugins: read('plugins.json'),
  apps: read('apps.json'),
  timeline: read('timeline.json'),
};

function read(name) {
  const path = join(DATA_DIR, name);
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    fail(`data/${name}`, `unreadable or invalid JSON — ${error.message}`);
    return null;
  }
}

// ------------------------------------------------------------------ schema pass

/** The JSON Schema subset bot/schema.json uses. Keeps this file dependency-free. */
function check(value, node, where) {
  if (node.$ref) {
    const key = node.$ref.replace('#/$defs/', '');
    return check(value, schema.$defs[key], where);
  }

  if (node.enum && !node.enum.includes(value === undefined ? null : value)) {
    fail(where, `${JSON.stringify(value)} is not one of ${node.enum.join(', ')}`);
    return;
  }

  const types = node.type ? [].concat(node.type) : [];
  if (types.length > 0 && !types.some((type) => isType(value, type))) {
    fail(where, `expected ${types.join(' | ')}, got ${describe(value)}`);
    return;
  }

  if (typeof value === 'string') {
    if (node.pattern && !new RegExp(node.pattern).test(value)) {
      fail(where, `${JSON.stringify(value)} does not match /${node.pattern}/`);
    }
    if (node.minLength !== undefined && value.length < node.minLength) {
      fail(where, `shorter than ${node.minLength} characters`);
    }
  }

  if (Array.isArray(value)) {
    if (node.minItems !== undefined && value.length < node.minItems) {
      fail(where, `needs at least ${node.minItems} item(s)`);
    }
    if (node.items) value.forEach((item, index) => check(item, node.items, `${where}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const key of node.required ?? []) {
      if (value[key] === undefined) fail(where, `missing required field "${key}"`);
    }
    for (const [key, child] of Object.entries(node.properties ?? {})) {
      if (value[key] !== undefined) check(value[key], child, `${where}.${key}`);
    }
    if (node.additionalProperties === false) {
      for (const key of Object.keys(value)) {
        if (!(key in (node.properties ?? {}))) fail(where, `unknown field "${key}"`);
      }
    }
  }
}

function isType(value, type) {
  if (type === 'null') return value === null;
  if (type === 'array') return Array.isArray(value);
  if (type === 'integer') return Number.isInteger(value);
  if (type === 'object') return value !== null && typeof value === 'object' && !Array.isArray(value);
  return typeof value === type;
}

function describe(value) {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value;
}

for (const [name, records] of Object.entries(files)) {
  if (records === null) continue;
  if (!schema[name]) continue;
  check(records, schema[name], `data/${name}.json`);
}

// --------------------------------------------------------------- semantic rules

const sourceIds = new Set((files.sources ?? []).map((source) => source.id));
const themeIds = new Set((files.themes ?? []).map((theme) => theme.id));
const pluginIds = new Set((files.plugins ?? []).map((plugin) => plugin.id));

for (const [name, records] of Object.entries(files)) {
  if (!Array.isArray(records)) continue;
  const where = `data/${name}.json`;

  const ids = new Set();
  const slugs = new Map();
  const dedup = new Map();

  for (const [index, record] of records.entries()) {
    const at = `${where}[${index}] ${record?.id ?? '<no id>'}`;
    if (!record || typeof record !== 'object') continue;

    // ids: unique, and unique again once they become a URL segment.
    if (ids.has(record.id)) fail(at, `duplicate id "${record.id}"`);
    ids.add(record.id);

    const slug = String(record.id ?? '').replace(/\./g, '-');
    if (slugs.has(slug) && slugs.get(slug) !== record.id) {
      fail(at, `id collides with "${slugs.get(slug)}" once slugified for a URL ("${slug}")`);
    }
    slugs.set(slug, record.id);

    // A record whose slug matches a sibling page would be shadowed by it —
    // /plugins/all/ is a real page, so a plugin with the id "all" would never
    // be reachable. Cheap to check, invisible until it bites.
    if (RESERVED_SLUGS[name]?.[slug]) {
      fail(at, `id "${record.id}" slugifies to "${slug}", which is a page under /${name}/`);
    }

    if (name === 'posts' || name === 'themes') {
      if (!/^[a-z0-9][a-z0-9-]*$/.test(String(record.id ?? ''))) {
        fail(at, `id must be kebab-case with no dots — it is used verbatim as a URL segment`);
      }
    }

    // dedup keys: one record per upstream thing. Bundled themes and first-party
    // plugins all live in the omarchy repo, so their repo_url is shared by
    // design and only source_url identifies them.
    const dedupKeys = record.bundled || record.first_party ? ['source_url'] : ['source_url', 'repo_url'];
    for (const key of dedupKeys) {
      const value = normalise(record[key]);
      if (!value) continue;
      if (dedup.has(value)) fail(at, `${key} already used by "${dedup.get(value)}"`);
      else dedup.set(value, record.id);
    }

    if (name === 'posts' && !record.source_url && !record.repo_url) {
      fail(at, 'needs a source_url or a repo_url');
    }

    // install commands are copied, never composed.
    if (record.install) {
      const command = record.install.command;
      if (command !== null && command !== undefined) {
        if (!/^omarchy[- ]/.test(command)) {
          fail(at, `install.command must start with "omarchy" — got ${JSON.stringify(command)}`);
        }
        if (/[\n\r;&|`$]/.test(command)) {
          fail(at, 'install.command contains shell metacharacters');
        }
      } else if (!record.listing_url && !record.install.hint) {
        fail(at, 'install.command is null, so listing_url or install.hint is required');
      }
    }

    // images: hosted files must exist and obey the house rules.
    if (record.image) {
      const hosted = record.image.startsWith('/');
      if (hosted !== (record.image_hosted ?? false)) {
        fail(
          at,
          `image_hosted is ${record.image_hosted} but image is ${hosted ? 'a local path' : 'a remote URL'}`,
        );
      }
      if (hosted) checkHostedImage(at, record.image);
    } else if (record.image_hosted) {
      fail(at, 'image_hosted is true but there is no image');
    }

    // cross-file references must resolve.
    if (record.seen_on && !sourceIds.has(record.seen_on)) {
      fail(at, `seen_on "${record.seen_on}" is not an id in data/sources.json`);
    }
    for (const id of record.related_theme_ids ?? []) {
      if (!themeIds.has(id)) fail(at, `related_theme_ids "${id}" is not in data/themes.json`);
    }
    for (const id of record.related_plugin_ids ?? []) {
      if (!pluginIds.has(id)) fail(at, `related_plugin_ids "${id}" is not in data/plugins.json`);
    }

    if (record.bundled && !record.official) fail(at, 'bundled themes are official by definition');
  }
}

function normalise(url) {
  if (!url) return null;
  return String(url)
    .trim()
    .toLowerCase()
    .replace(/^http:/, 'https:')
    .replace(/^https:\/\/www\./, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

function checkHostedImage(at, image) {
  if (!image.endsWith('.webp')) {
    fail(at, `hosted images must be .webp — got ${image}`);
    return;
  }
  try {
    const { size } = statSync(join(PUBLIC_DIR, image));
    if (size > MAX_IMAGE_BYTES) {
      fail(at, `${image} is ${Math.round(size / 1024)}KB, over the 400KB limit`);
    }
  } catch {
    fail(at, `${image} is missing from public/`);
  }
}

// ------------------------------------------------------------------- timeline

/*
 * data/timeline.json is written by a scheduled Action that commits straight to
 * main with nobody reading the diff first, so the shape checks below are the
 * only thing standing between a GitHub API change and a broken history page.
 */
if (Array.isArray(files.timeline)) {
  const timeline = files.timeline;
  const where = 'data/timeline.json';

  if (timeline.length === 0) {
    fail(where, 'is empty — the release fetch produced nothing');
  }

  const nodes = timeline.filter((entry) => entry.tier === 'node');
  if (timeline.length > 0 && nodes.length === 0) {
    fail(where, 'has no nodes — the tiering scored every release as a tick, so the parser broke');
  }
  if (nodes.length > timeline.length / 2) {
    fail(where, `${nodes.length} of ${timeline.length} releases scored as nodes — the tiering is not discriminating`);
  }

  let previous = null;
  for (const [index, entry] of timeline.entries()) {
    const at = `${where}[${index}] ${entry?.id ?? '<no id>'}`;

    // Newest first. The page renders in array order and never re-sorts.
    if (previous && entry.published_at > previous) {
      fail(at, 'is out of order — the timeline must be newest first');
    }
    previous = entry.published_at;

    if (entry.tier === 'node' && !entry.headline && !entry.summary) {
      fail(at, 'is a node with neither a headline nor a summary — nothing to render');
    }
    for (const person of entry.contributors ?? []) {
      if (person.pull_request && !/^https:\/\/github\.com\/[\w.-]+\/[\w.-]+\/pull\/\d+$/.test(person.pull_request)) {
        fail(at, `contributor @${person.handle} has a malformed pull_request URL`);
      }
    }
  }
}

// ----------------------------------------------------------------------- meta

if (files.meta) {
  if (Number.isNaN(Date.parse(files.meta.updated_at))) {
    fail('data/meta.json', `updated_at "${files.meta.updated_at}" is not a parseable date`);
  }
  for (const name of ['og.png', 'favicon.svg']) {
    try {
      statSync(join(PUBLIC_DIR, name));
    } catch {
      fail('public/', `${name} is missing — run node bot/make-og.mjs`);
    }
  }
}

const featured = (files.posts ?? []).filter((post) => post.featured);
if (featured.length === 0) warn('data/posts.json', 'no featured posts — the homepage strip is empty');
for (const post of featured) {
  if (!post.image) warn(`data/posts.json ${post.id}`, 'featured but has no image');
}

// ------------------------------------------------------------- image budget

const imageDir = join(PUBLIC_DIR, 'images');
let imageBytes = 0;
let imageCount = 0;
const walkImages = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      walkImages(path);
    } else {
      imageBytes += statSync(path).size;
      imageCount++;
    }
  }
};
try {
  walkImages(imageDir);
} catch {
  // No images yet is a legitimate state for a fresh checkout.
}

const mb = (bytes) => `${(bytes / 1024 / 1024).toFixed(1)}MB`;
const offload =
  'set image_hosted:false with an absolute URL and serve from R2 or ' +
  'Cloudflare Images — the schema already allows it, so this is a data ' +
  'migration and not a rewrite';

if (imageBytes > IMAGE_BUDGET_BYTES) {
  fail(
    'public/images',
    `${imageCount} files totalling ${mb(imageBytes)}, over the ${mb(IMAGE_BUDGET_BYTES)} budget. ` +
      `Either the scraper is hosting junk, or it is genuinely time to ${offload}`,
  );
} else if (imageBytes > IMAGE_BUDGET_BYTES * 0.6) {
  warn(
    'public/images',
    `${imageCount} files totalling ${mb(imageBytes)} — past 60% of the ${mb(IMAGE_BUDGET_BYTES)} budget. ` +
      `Decide now, with room to spare: tighten what gets hosted, or ${offload}`,
  );
}

// --------------------------------------------------------------------- report

for (const message of warnings) console.warn(`warn  ${message}`);

if (errors.length > 0) {
  for (const message of errors) console.error(`error ${message}`);
  console.error(`\nvalidate: ${errors.length} error(s). Nothing was built.`);
  process.exit(1);
}

const counted = Object.entries(files)
  .filter(([, value]) => Array.isArray(value))
  .map(([name, value]) => `${value.length} ${name}`)
  .join(', ');
console.log(`validate: ok — ${counted}${warnings.length ? `, ${warnings.length} warning(s)` : ''}`);
