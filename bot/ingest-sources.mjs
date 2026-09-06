#!/usr/bin/env node
/**
 * Pull records from the public Omarchy catalogs into data/*.json.
 *
 * Usage:
 *   node bot/ingest-sources.mjs themes-bundled
 *   node bot/ingest-sources.mjs themes-extra  --limit 12
 *   node bot/ingest-sources.mjs plugins       --limit 20
 *   node bot/ingest-sources.mjs plugins       --id omamail --id robzolkos.github
 *   node bot/ingest-sources.mjs setups        --limit 16
 *
 * Rules this script enforces so the bot cannot break them:
 *   - install commands are copied from the upstream catalog or from the verified
 *     table in AGENTS.md. Nothing is composed from guesswork.
 *   - dedup on repo_url / source_url; existing ids are never rewritten.
 *   - hosted images are re-encoded to WebP, max edge 1200px, quality 80.
 *   - listing thumbnails we do not host are recorded with image_hosted: false.
 */
import { join } from 'node:path';
import {
  DATA_DIR,
  asList,
  dedupKey,
  fetchJson,
  fetchText,
  nowIso,
  parseArgs,
  readJson,
  slugify,
  storeImage,
  today,
  uniqueSlug,
  writeJson,
} from './lib/util.mjs';

const OMARCHY_REPO = 'omacom/omarchy';
const PLUGIN_CATALOG = 'https://plugins.omarchy.org/catalog.json';
const PLUGIN_LISTING = 'https://plugins.omarchy.org/plugin.html?id=';
const EXTRA_THEMES_PAGE = 'https://omarchy.org/themes/';
const HUB_SETUPS = 'https://raw.githubusercontent.com/deepakness/omarchy-hub/main/data/setups.json';
const HUB_RESOURCES = 'https://raw.githubusercontent.com/deepakness/omarchy-hub/main/data/resources.json';
const HUB_ASSETS = 'https://omarchy.deepakness.com/';

const flags = parseArgs(process.argv.slice(2));
const [command] = flags._;
const limit = flags.limit ? Number(flags.limit) : undefined;
const onlyIds = new Set(asList(flags.id));
const onlyNames = new Set(asList(flags.name));

const commands = {
  'themes-bundled': ingestBundledThemes,
  'themes-extra': ingestExtraThemes,
  themes: async () => {
    await ingestBundledThemes();
    await ingestExtraThemes();
  },
  plugins: ingestPlugins,
  setups: ingestSetups,
  ideas: ingestIdeas,
};

if (!command || !commands[command]) {
  console.error(`usage: node bot/ingest-sources.mjs <${Object.keys(commands).join('|')}> [--limit N] [--id ID]`);
  process.exit(1);
}

await commands[command]();
await touchMeta();

// ---------------------------------------------------------------- bundled themes

async function ingestBundledThemes() {
  const branch = await defaultBranch();
  const entries = await fetchJson(`https://api.github.com/repos/${OMARCHY_REPO}/contents/themes?ref=${branch}`);
  const slugs = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();

  const file = join(DATA_DIR, 'themes.json');
  const themes = await readJson(file, []);
  const byId = new Map(themes.map((t) => [t.id, t]));
  let added = 0;
  let updated = 0;

  for (const slug of slugs) {
    if (onlyIds.size && !onlyIds.has(slug)) continue;
    const raw = `https://raw.githubusercontent.com/${OMARCHY_REPO}/${branch}/themes/${slug}`;
    const colors = parseColorsToml(await fetchText(`${raw}/colors.toml`));

    let image = byId.get(slug)?.image ?? null;
    if (!image || flags.force) {
      const stored = await storeImage('themes', slug, `${raw}/preview.png`);
      image = stored.path;
      console.log(`  image ${stored.path} (${Math.round(stored.bytes / 1024)}KB)`);
    }

    const record = {
      id: slug,
      name: titleize(slug),
      author: 'Omarchy',
      official: true,
      bundled: true,
      repo_url: `https://github.com/${OMARCHY_REPO}/tree/${branch}/themes/${slug}`,
      listing_url: 'https://omarchy.org/manual/themes/',
      image,
      image_hosted: true,
      tone: colors.mode === 'light' ? 'light' : 'dark',
      palette: colors.palette,
      tags: ['official', 'bundled', colors.mode === 'light' ? 'light' : 'dark'],
      install: { type: 'theme-set', command: `omarchy theme set ${slug}` },
      added_at: byId.get(slug)?.added_at ?? today(),
    };

    if (byId.has(slug)) {
      Object.assign(byId.get(slug), record);
      updated++;
    } else {
      themes.push(record);
      byId.set(slug, record);
      added++;
    }
  }

  await writeJson(file, sortThemes(themes));
  console.log(`themes-bundled: +${added} added, ${updated} updated (${slugs.length} upstream)`);
}

function parseColorsToml(text) {
  const values = new Map();
  for (const line of text.split('\n')) {
    const match = /^\s*([a-z_]+)\s*=\s*"([^"]*)"/.exec(line);
    if (match) values.set(match[1], match[2]);
  }
  // A swatch a human can read at card size: background, accent, then the hues.
  const order = ['background', 'accent', 'red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'foreground'];
  const palette = order
    .map((key) => values.get(key))
    .filter((hex) => typeof hex === 'string' && /^#[0-9a-fA-F]{6}$/.test(hex));
  return { mode: values.get('mode') ?? 'dark', palette: [...new Set(palette)] };
}

// ------------------------------------------------------------------ extra themes

async function ingestExtraThemes() {
  const html = await fetchText(EXTRA_THEMES_PAGE);
  const upstream = parseExtraThemes(html);

  const file = join(DATA_DIR, 'themes.json');
  const themes = await readJson(file, []);
  const seen = new Set(themes.map((t) => dedupKey(t.repo_url)).filter(Boolean));
  const ids = new Set(themes.map((t) => t.id));
  let added = 0;
  let skipped = 0;
  // With --name, pick exactly those themes in the order given: a curated cut
  // beats the first N alphabetically for a gallery.
  const wanted = onlyNames.size
    ? [...onlyNames].map((name) => upstream.find((t) => t.name.toLowerCase() === name.toLowerCase()))
    : upstream;
  for (const theme of wanted) {
    if (!theme) continue;
    if (limit !== undefined && added >= limit) break;
    if (onlyIds.size && !onlyIds.has(slugify(theme.name))) continue;
    if (seen.has(dedupKey(theme.repo_url))) {
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(theme.name), ids);
    ids.add(id);
    seen.add(dedupKey(theme.repo_url));
    themes.push({
      id,
      name: theme.name,
      author: theme.author,
      official: false,
      bundled: false,
      repo_url: theme.repo_url,
      listing_url: EXTRA_THEMES_PAGE,
      image: theme.image,
      image_hosted: false,
      tone: null,
      palette: [],
      tags: ['community'],
      install: { type: 'theme-install', command: `omarchy theme install ${theme.repo_url}.git` },
      seen_on: 'omarchy-org-themes',
      added_at: today(),
    });
    added++;
  }

  await writeJson(file, sortThemes(themes));
  console.log(`themes-extra: +${added} added, ${skipped} already present (${upstream.length} upstream)`);
}

function parseExtraThemes(html) {
  const out = [];
  const figure = /<figure class="themes__theme">([\s\S]*?)<\/figure>/g;
  for (const [, block] of html.matchAll(figure)) {
    const repo = /href="(https:\/\/github\.com\/[^"]+)"/.exec(block)?.[1];
    const image = /<img src="([^"]+)"/.exec(block)?.[1];
    const name = /<figcaption>\s*<a[^>]*>([\s\S]*?)<\/a>/.exec(block)?.[1];
    if (!repo || !name) continue;
    out.push({
      name: decodeEntities(name.trim()),
      repo_url: repo.replace(/\.git$/, ''),
      author: repo.split('/')[3] ?? null,
      image: image ? new URL(image, EXTRA_THEMES_PAGE).href : null,
    });
  }
  return out;
}

// ----------------------------------------------------------------------- plugins

async function ingestPlugins() {
  const catalog = await fetchJson(PLUGIN_CATALOG);
  const upstream = catalog.plugins ?? [];

  const file = join(DATA_DIR, 'plugins.json');
  const plugins = await readJson(file, []);
  const byId = new Map(plugins.map((p) => [p.id, p]));
  let added = 0;
  let updated = 0;

  // --all takes every plugin the marketplace says is installable, plus the
  // ones that ship with Omarchy. That is the archive position: the catalogue
  // is complete, and the gallery decides how much of it to show at once.
  const installable = (p) =>
    p.sourceType === 'builtin' || (p.installAvailable && p.installCommand);

  const selected = onlyIds.size
    ? upstream.filter((p) => onlyIds.has(p.id))
    : flags.all
      ? upstream.filter(installable)
      : upstream
          .filter((p) => p.sourceType === 'community' && p.installAvailable && p.installCommand)
          .sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0))
          .slice(0, limit ?? 20);

  for (const plugin of selected) {
    const record = toPluginRecord(plugin);
    if (!record) continue;
    if (byId.has(record.id)) {
      const existing = byId.get(record.id);
      Object.assign(existing, record, { added_at: existing.added_at });
      updated++;
    } else {
      plugins.push(record);
      byId.set(record.id, record);
      added++;
    }
  }

  await writeJson(file, plugins.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)));
  console.log(`plugins: +${added} added, ${updated} updated (${upstream.length} in catalog)`);
}

function toPluginRecord(plugin) {
  const firstParty = plugin.sourceType === 'builtin';
  const isBar = plugin.kind === 'Bar';
  // Never compose an install command. Community plugins carry their own command
  // in the catalog. Bundled ones ship with Omarchy and are switched on by id —
  // a whole bar replaces the bar in use, a widget takes a place on it.
  const install = firstParty
    ? isBar
      ? { type: 'bar-use', command: `omarchy bar use ${plugin.id}` }
      : { type: 'plugin-enable', command: `omarchy plugin enable ${plugin.id}` }
    : { type: 'plugin-add', command: plugin.installCommand || null };
  if (!install.command) return null;

  const kinds = (plugin.kind ?? '')
    .split('+')
    .map((k) => slugify(k))
    .filter(Boolean);

  return {
    id: plugin.id,
    name: plugin.name,
    author: plugin.author ?? null,
    summary: plugin.description ?? null,
    repo_url: plugin.repo ?? null,
    listing_url: `${PLUGIN_LISTING}${encodeURIComponent(plugin.id)}`,
    image: plugin.previewThumbnail ? new URL(plugin.previewThumbnail, PLUGIN_CATALOG).href : null,
    image_hosted: false,
    tags: [...new Set([...(plugin.tags ?? []), slugify(plugin.category ?? '')].filter(Boolean))],
    kinds,
    category: plugin.category ?? null,
    first_party: firstParty,
    stars: plugin.stars ?? null,
    install,
    warning: firstParty
      ? null
      : 'Third-party plugins run unsandboxed. Review the repo before enabling.',
    seen_on: 'omarchy-plugins',
    added_at: plugin.addedAt ?? today(),
  };
}

// ------------------------------------------------------------------------- setups

async function ingestSetups() {
  const upstream = await fetchJson(HUB_SETUPS);

  const file = join(DATA_DIR, 'posts.json');
  const posts = await readJson(file, []);
  const seen = new Set(posts.map((p) => dedupKey(p.source_url)).filter(Boolean));
  const ids = new Set(posts.map((p) => p.id));
  let added = 0;
  let skipped = 0;

  const selected = onlyIds.size
    ? upstream.filter((s) => onlyIds.has(String(s.id)))
    : [...upstream].reverse();

  for (const setup of selected) {
    if (limit !== undefined && added >= limit) break;
    if (!setup.link || seen.has(dedupKey(setup.link))) {
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(setup.name), ids);
    ids.add(id);
    seen.add(dedupKey(setup.link));

    let image = null;
    let hosted = false;
    if (setup.screenshot) {
      const stored = await storeImage('posts', id, new URL(setup.screenshot, HUB_ASSETS).href);
      image = stored.path;
      hosted = true;
      console.log(`  image ${stored.path} (${Math.round(stored.bytes / 1024)}KB)`);
    }

    const { platform, author, authorUrl } = attribution(setup.link);
    posts.push({
      id,
      kind: 'setup',
      title: setup.name,
      summary: setup.description ?? null,
      author,
      author_url: authorUrl,
      source_platform: platform,
      source_url: setup.link,
      image,
      image_hosted: hosted,
      device: setup.device ?? null,
      form_factor: slugify(setup.category ?? '') || null,
      tags: setup.tags ?? [],
      related_theme_ids: [],
      related_plugin_ids: [],
      created_at: null,
      added_at: today(),
      featured: false,
      seen_on: 'omarchy-hub',
    });
    added++;
  }

  await writeJson(file, posts);
  console.log(`setups: +${added} added, ${skipped} skipped (${upstream.length} upstream)`);
}

// -------------------------------------------------------------------------- ideas

/**
 * Articles, guides, tools, and discussions — the non-desk half of the feed.
 * These have no screenshot of their own, so the card renders text-forward.
 */
async function ingestIdeas() {
  const upstream = await fetchJson(HUB_RESOURCES);

  const file = join(DATA_DIR, 'posts.json');
  const posts = await readJson(file, []);
  const seen = new Set(posts.map((p) => dedupKey(p.source_url)).filter(Boolean));
  const ids = new Set(posts.map((p) => p.id));
  let added = 0;
  let skipped = 0;

  const kindFor = { Application: 'other', Development: 'other', Tool: 'other' };

  for (const item of upstream) {
    if (limit !== undefined && added >= limit) break;
    if (onlyIds.size && !onlyIds.has(String(item.id))) continue;
    if (!item.link || seen.has(dedupKey(item.link))) {
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(item.name), ids);
    ids.add(id);
    seen.add(dedupKey(item.link));

    const { platform, authorUrl } = attribution(item.link);
    posts.push({
      id,
      kind: kindFor[item.category] ?? 'idea',
      title: item.name,
      summary: item.description ?? null,
      author: item.author ?? null,
      author_url: item.author ? authorUrl : null,
      source_platform: platform,
      source_url: item.link,
      image: null,
      image_hosted: false,
      device: null,
      form_factor: null,
      tags: [...new Set([...(item.tags ?? []), slugify(item.category ?? '')].filter(Boolean))],
      related_theme_ids: [],
      related_plugin_ids: [],
      created_at: null,
      added_at: today(),
      featured: false,
      seen_on: 'omarchy-hub',
    });
    added++;
  }

  await writeJson(file, posts);
  console.log(`ideas: +${added} added, ${skipped} skipped (${upstream.length} upstream)`);
}

function attribution(url) {
  try {
    const parsed = new URL(url);
    const host = parsed.hostname.replace(/^www\./, '');
    if (host === 'x.com' || host === 'twitter.com') {
      const handle = parsed.pathname.split('/').filter(Boolean)[0];
      return { platform: 'x', author: handle ?? null, authorUrl: handle ? `https://x.com/${handle}` : null };
    }
    if (host === 'github.com') {
      const user = parsed.pathname.split('/').filter(Boolean)[0];
      return { platform: 'github', author: user ?? null, authorUrl: user ? `https://github.com/${user}` : null };
    }
    if (host === 'reddit.com') return { platform: 'reddit', author: null, authorUrl: null };
    if (host === 'youtube.com' || host === 'youtu.be') {
      return { platform: 'youtube', author: null, authorUrl: null };
    }
    return { platform: 'web', author: host, authorUrl: `${parsed.protocol}//${parsed.host}` };
  } catch {
    return { platform: 'web', author: null, authorUrl: null };
  }
}

// -------------------------------------------------------------------------- misc

async function defaultBranch() {
  const repo = await fetchJson(`https://api.github.com/repos/${OMARCHY_REPO}`);
  return repo.default_branch;
}

function sortThemes(themes) {
  return themes.sort((a, b) => {
    if (a.bundled !== b.bundled) return a.bundled ? -1 : 1;
    return a.name.localeCompare(b.name);
  });
}

function titleize(slug) {
  const exceptions = { 'retro-82': 'Retro 82', 'rose-pine': 'Rosé Pine' };
  if (exceptions[slug]) return exceptions[slug];
  return slug
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

function decodeEntities(text) {
  return text
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>');
}

async function touchMeta() {
  const file = join(DATA_DIR, 'meta.json');
  const meta = await readJson(file, null);
  if (!meta) return;
  meta.updated_at = nowIso();
  await writeJson(file, meta);
}
