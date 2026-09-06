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
 */
import { readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, PUBLIC_DIR, ROOT } from './lib/util.mjs';

const MAX_IMAGE_BYTES = 400 * 1024;

const schema = JSON.parse(readFileSync(join(ROOT, 'bot', 'schema.json'), 'utf8'));
const errors = [];
const warnings = [];

const fail = (where, message) => errors.push(`${where}: ${message}`);
const warn = (where, message) => warnings.push(`${where}: ${message}`);

const files = {
  meta: read('meta.json'),
  sources: read('sources.json'),
  posts: read('posts.json'),
  themes: read('themes.json'),
  plugins: read('plugins.json'),
  apps: read('apps.json'),
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
