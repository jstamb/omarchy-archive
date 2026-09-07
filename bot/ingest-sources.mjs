#!/usr/bin/env node
/**
 * Pull records from the public Omarchy catalogs into data/*.json.
 *
 * Usage:
 *   node bot/ingest-sources.mjs themes-bundled
 *   node bot/ingest-sources.mjs themes-extra  --limit 12
 *   node bot/ingest-sources.mjs themes-colors --id dracula --force
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
import {
  asList,
  dedupKey,
  fetchJson,
  fetchText,
  parseArgs,
  requireArray,
  slugify,
  today,
  uniqueSlug,
} from './lib/util.mjs';
import { paletteFrom, parseThemeColors } from './lib/colors.mjs';
import { applyNew, applySeen, markMissing, recordSourceStatus } from './lib/reconcile.mjs';
import { runStagedIngest, stampContentUpdate } from './lib/staging.mjs';

const OMARCHY_REPO = 'omacom/omarchy';
const PLUGIN_CATALOG = process.env.ARCHIVE_PLUGIN_CATALOG ?? 'https://plugins.omarchy.org/catalog.json';
const PLUGIN_LISTING = process.env.ARCHIVE_PLUGIN_LISTING ?? 'https://plugins.omarchy.org/plugin.html?id=';
const EXTRA_THEMES_PAGE = process.env.ARCHIVE_EXTRA_THEMES_PAGE ?? 'https://omarchy.org/themes/';
const HUB_SETUPS =
  process.env.ARCHIVE_HUB_SETUPS ?? 'https://raw.githubusercontent.com/deepakness/omarchy-hub/main/data/setups.json';
const HUB_RESOURCES =
  process.env.ARCHIVE_HUB_RESOURCES ??
  'https://raw.githubusercontent.com/deepakness/omarchy-hub/main/data/resources.json';
const HUB_ASSETS = process.env.ARCHIVE_HUB_ASSETS ?? 'https://omarchy.deepakness.com/';

const flags = parseArgs(process.argv.slice(2));
const [command] = flags._;
const limit = flags.limit ? Number(flags.limit) : undefined;
const onlyIds = new Set(asList(flags.id));
const onlyNames = new Set(asList(flags.name));

const commands = {
  'themes-bundled': ingestBundledThemes,
  'themes-extra': ingestExtraThemes,
  'themes-colors': ingestThemeColors,
  themes: async (ctx) => {
    await ingestBundledThemes(ctx);
    await ingestExtraThemes(ctx);
    await ingestThemeColors(ctx);
  },
  plugins: ingestPlugins,
  setups: ingestSetups,
  ideas: ingestIdeas,
};

if (!command || !commands[command]) {
  console.error(`usage: node bot/ingest-sources.mjs <${Object.keys(commands).join('|')}> [--limit N] [--id ID]`);
  process.exit(1);
}

// Every write lands in an owned staging tree; the whole candidate collection is
// validated and checked for preservation there, and only a fully clean run is
// published into the working tree.
const { published } = await runStagedIngest(async (ctx) => {
  await commands[command](ctx);
  await stampContentUpdate(ctx);
});
console.log(
  published.length
    ? `ingest: published ${published.length} artifact(s) — ${published.join(', ')}`
    : 'ingest: candidate matched the live tree, nothing to publish',
);

async function commitSourceStatus(ctx, sourceId, stats, { complete }) {
  const day = today();
  const current = await ctx.readData('source-status.json', {});
  await ctx.writeData(
    'source-status.json',
    recordSourceStatus(current, sourceId, {
      last_attempt_at: day,
      last_success_at: day,
      upstream_count: stats.upstream_count,
      indexed_count: stats.indexed_count,
      excluded_count: stats.excluded_count,
      note: complete ? null : 'partial fetch; missing records not marked unavailable',
    }),
  );
}

// ---------------------------------------------------------------- bundled themes

async function ingestBundledThemes(ctx) {
  const branch = await defaultBranch();
  const entries = requireArray(
    await fetchJson(`https://api.github.com/repos/${OMARCHY_REPO}/contents/themes?ref=${branch}`),
    'omarchy themes directory listing',
  );
  const slugs = entries.filter((e) => e.type === 'dir').map((e) => e.name).sort();

  const themes = await ctx.readData('themes.json', []);
  const byId = new Map(themes.map((t) => [t.id, t]));
  const seenIds = new Set();
  const day = today();
  let added = 0;
  let updated = 0;

  for (const slug of slugs) {
    if (onlyIds.size && !onlyIds.has(slug)) continue;
    const raw = `https://raw.githubusercontent.com/${OMARCHY_REPO}/${branch}/themes/${slug}`;
    const colors = parseThemeColors(await fetchText(`${raw}/colors.toml`));
    const preview = `${raw}/preview.png`;

    let image = byId.get(slug)?.image ?? null;
    if (!image || flags.force) {
      const stored = await ctx.storeImage('themes', slug, preview);
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
      palette: paletteFrom(colors.colors),
      colors: colors.colors,
      tags: ['official', 'bundled', colors.mode === 'light' ? 'light' : 'dark'],
      install: { type: 'theme-set', command: `omarchy theme set ${slug}` },
      original_asset_url: byId.get(slug)?.original_asset_url ?? preview,
      upstream_rev: branch,
    };

    if (byId.has(slug)) {
      const next = applySeen(byId.get(slug), record, day);
      Object.assign(byId.get(slug), next);
      seenIds.add(slug);
      updated++;
    } else {
      const created = applyNew({ ...record, added_at: day }, day);
      themes.push(created);
      byId.set(slug, created);
      seenIds.add(slug);
      added++;
    }
  }

  const complete = onlyIds.size === 0;
  const marked = markMissing(themes, {
    seenIds,
    complete,
    today: day,
    inScope: (record) => record.bundled,
  });
  await ctx.writeData('themes.json', sortThemes(marked.records));
  await commitSourceStatus(ctx, 'omarchy-org', marked.stats, { complete });
  console.log(`themes-bundled: +${added} added, ${updated} updated (${slugs.length} upstream)`);
}

/**
 * Raw-file base for a GitHub repo URL, including the `tree/<ref>/<path>`
 * form bundled themes use. `HEAD` resolves to the default branch without an
 * API call, which keeps a 170-theme run inside the anonymous rate limit.
 */
function rawBase(repoUrl) {
  const match = /^https:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?(?:\/tree\/([^/]+)(\/.*)?)?\/?$/.exec(repoUrl ?? '');
  if (!match) return null;
  const [, owner, repo, ref = 'HEAD', path = ''] = match;
  return `https://raw.githubusercontent.com/${owner}/${repo}/${ref}${path}`;
}

/**
 * Fetch a theme's colours from its repo: colors.toml first, alacritty.toml
 * for the pre-colors.toml layout. Null when the repo ships neither, or when
 * what it ships has no background — a palette without one is not a theme.
 */
async function fetchThemeColors(repoUrl) {
  const base = rawBase(repoUrl);
  if (!base) return null;
  for (const file of ['colors.toml', 'alacritty.toml']) {
    let text;
    try {
      text = await fetchText(`${base}/${file}`);
    } catch {
      continue;
    }
    const parsed = parseThemeColors(text);
    if (parsed.colors.background) return parsed;
  }
  return null;
}

// ------------------------------------------------------------------ theme colours

/**
 * Backfill `colors` / `palette` / `tone` on every theme that has a repo. The
 * site's theme switcher is built from this field, so a theme without it is
 * listed but cannot be applied. Idempotent: a theme that already carries
 * colours is skipped unless --force or --id names it. Never marks anything
 * missing: a repo that has dropped its colour file keeps the last good set.
 */
async function ingestThemeColors(ctx) {
  const themes = await ctx.readData('themes.json', []);
  const day = today();
  let filled = 0;
  let unchanged = 0;
  let none = 0;
  for (const theme of themes) {
    if (onlyIds.size && !onlyIds.has(theme.id)) continue;
    if (!theme.repo_url) continue;
    const have = theme.colors && Object.keys(theme.colors).length > 0;
    if (have && !flags.force && !onlyIds.size) continue;
    if (limit !== undefined && filled >= limit) break;
    const fetched = await fetchThemeColors(theme.repo_url);
    if (!fetched) {
      none++;
      console.log(`  ${theme.id}: no colour file`);
      continue;
    }
    const update = {
      colors: fetched.colors,
      palette: paletteFrom(fetched.colors),
      // A tone the catalog stated stays; the derived one only fills a blank.
      tone: theme.tone ?? fetched.mode,
    };
    const next = applySeen(theme, update, day);
    if (JSON.stringify(next.colors) === JSON.stringify(theme.colors)) {
      unchanged++;
      continue;
    }
    Object.assign(theme, next);
    filled++;
  }
  await ctx.writeData('themes.json', sortThemes(themes));
  console.log(`themes-colors: ${filled} filled, ${unchanged} unchanged, ${none} without a colour file`);
}

// ------------------------------------------------------------------ extra themes

async function ingestExtraThemes(ctx) {
  const html = await fetchText(EXTRA_THEMES_PAGE);
  const upstream = parseExtraThemes(html);
  if (upstream.length === 0) {
    throw new Error(
      `no themes parsed from ${EXTRA_THEMES_PAGE} — markup changed or the fetch failed; refusing to treat as an empty success`,
    );
  }

  const themes = await ctx.readData('themes.json', []);
  const seen = new Set(themes.map((t) => dedupKey(t.repo_url)).filter(Boolean));
  const ids = new Set(themes.map((t) => t.id));
  const seenIds = new Set();
  const day = today();
  let added = 0;
  let skipped = 0;
  // With --name, pick exactly those themes in the order given: a curated cut
  // beats the first N alphabetically for a gallery.
  const wanted = onlyNames.size
    ? [...onlyNames].map((name) => upstream.find((t) => t.name.toLowerCase() === name.toLowerCase()))
    : upstream;
  const complete = !onlyIds.size && !onlyNames.size && limit === undefined;
  for (const theme of wanted) {
    if (!theme) continue;
    if (limit !== undefined && added >= limit) break;
    if (onlyIds.size && !onlyIds.has(slugify(theme.name))) continue;
    const key = dedupKey(theme.repo_url);
    const existing = themes.find((t) => dedupKey(t.repo_url) === key);
    const update = {
      name: theme.name,
      author: theme.author,
      official: false,
      bundled: false,
      repo_url: theme.repo_url,
      listing_url: EXTRA_THEMES_PAGE,
      image: existing?.image ?? theme.image,
      image_hosted: existing?.image_hosted ?? false,
      seen_on: 'omarchy-org-themes',
      original_asset_url: existing?.original_asset_url ?? theme.image ?? null,
      install: { type: 'theme-install', command: `omarchy theme install ${theme.repo_url}.git` },
    };
    if (existing) {
      Object.assign(existing, applySeen(existing, update, day));
      seenIds.add(existing.id);
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(theme.name), ids);
    ids.add(id);
    seen.add(key);
    const created = applyNew(
      {
        id,
        ...update,
        tone: null,
        palette: [],
        tags: ['community'],
        added_at: day,
      },
      day,
    );
    themes.push(created);
    seenIds.add(id);
    added++;
  }

  const marked = markMissing(themes, {
    seenIds,
    complete,
    today: day,
    inScope: (record) => !record.bundled && record.seen_on === 'omarchy-org-themes',
  });
  await ctx.writeData('themes.json', sortThemes(marked.records));
  await commitSourceStatus(ctx, 'omarchy-org-themes', marked.stats, { complete });
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

async function ingestPlugins(ctx) {
  const catalog = await fetchJson(PLUGIN_CATALOG);
  const upstream = requireArray(catalog?.plugins, 'plugin catalog "plugins" array');

  const plugins = await ctx.readData('plugins.json', []);
  const byId = new Map(plugins.map((p) => [p.id, p]));
  const seenIds = new Set();
  const day = today();
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
      Object.assign(existing, applySeen(existing, record, day));
      seenIds.add(record.id);
      updated++;
    } else {
      const created = applyNew(record, day);
      plugins.push(created);
      byId.set(record.id, created);
      seenIds.add(record.id);
      added++;
    }
  }

  const complete = Boolean(flags.all) && onlyIds.size === 0;
  const marked = markMissing(plugins, {
    seenIds,
    complete,
    today: day,
    inScope: (record) => record.seen_on === 'omarchy-plugins',
  });
  await ctx.writeData('plugins.json', marked.records.sort((a, b) => (b.stars ?? 0) - (a.stars ?? 0)));
  await commitSourceStatus(ctx, 'omarchy-plugins', marked.stats, { complete });
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
    original_asset_url: plugin.previewThumbnail
      ? new URL(plugin.previewThumbnail, PLUGIN_CATALOG).href
      : null,
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

async function ingestSetups(ctx) {
  const upstream = requireArray(await fetchJson(HUB_SETUPS), 'omarchy-hub setups feed');

  const posts = await ctx.readData('posts.json', []);
  const seen = new Set(posts.map((p) => dedupKey(p.source_url)).filter(Boolean));
  const ids = new Set(posts.map((p) => p.id));
  const seenIds = new Set();
  const day = today();
  let added = 0;
  let skipped = 0;

  const selected = onlyIds.size
    ? upstream.filter((s) => onlyIds.has(String(s.id)))
    : [...upstream].reverse();
  const complete = !onlyIds.size && limit === undefined;

  for (const setup of selected) {
    if (limit !== undefined && added >= limit) break;
    if (!setup.link) {
      skipped++;
      continue;
    }
    const existing = posts.find((p) => dedupKey(p.source_url) === dedupKey(setup.link));
    if (existing) {
      Object.assign(existing, applySeen(existing, { title: setup.name, summary: setup.description ?? existing.summary }, day));
      seenIds.add(existing.id);
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(setup.name), ids);
    ids.add(id);
    seen.add(dedupKey(setup.link));

    let image = null;
    let hosted = false;
    if (setup.screenshot) {
      const stored = await ctx.storeImage('posts', id, new URL(setup.screenshot, HUB_ASSETS).href);
      image = stored.path;
      hosted = true;
      console.log(`  image ${stored.path} (${Math.round(stored.bytes / 1024)}KB)`);
    }

    const { platform, author, authorUrl } = attribution(setup.link);
    const remoteImage = setup.screenshot ? new URL(setup.screenshot, HUB_ASSETS).href : null;
    const created = applyNew(
      {
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
        added_at: day,
        featured: false,
        seen_on: 'omarchy-hub',
        original_asset_url: remoteImage,
      },
      day,
    );
    posts.push(created);
    seenIds.add(id);
    added++;
  }

  const marked = markMissing(posts, {
    seenIds,
    complete,
    today: day,
    inScope: (record) => record.kind === 'setup' && record.seen_on === 'omarchy-hub',
  });
  await ctx.writeData('posts.json', marked.records);
  await commitSourceStatus(ctx, 'omarchy-hub', marked.stats, { complete });
  console.log(`setups: +${added} added, ${skipped} skipped (${upstream.length} upstream)`);
}

// -------------------------------------------------------------------------- ideas

/**
 * Articles, guides, tools, and discussions — the non-desk half of the feed.
 * These have no screenshot of their own, so the card renders text-forward.
 */
async function ingestIdeas(ctx) {
  const upstream = requireArray(await fetchJson(HUB_RESOURCES), 'omarchy-hub resources feed');

  const posts = await ctx.readData('posts.json', []);
  const seen = new Set(posts.map((p) => dedupKey(p.source_url)).filter(Boolean));
  const ids = new Set(posts.map((p) => p.id));
  const seenIds = new Set();
  const day = today();
  let added = 0;
  let skipped = 0;

  const kindFor = { Application: 'other', Development: 'other', Tool: 'other' };
  const complete = !onlyIds.size && limit === undefined;

  for (const item of upstream) {
    if (limit !== undefined && added >= limit) break;
    if (onlyIds.size && !onlyIds.has(String(item.id))) continue;
    if (!item.link) {
      skipped++;
      continue;
    }
    const existing = posts.find((p) => dedupKey(p.source_url) === dedupKey(item.link));
    if (existing) {
      Object.assign(
        existing,
        applySeen(existing, { title: item.name, summary: item.description ?? existing.summary, author: item.author ?? existing.author }, day),
      );
      seenIds.add(existing.id);
      skipped++;
      continue;
    }
    const id = uniqueSlug(slugify(item.name), ids);
    ids.add(id);
    seen.add(dedupKey(item.link));

    const { platform, authorUrl } = attribution(item.link);
    const created = applyNew(
      {
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
        added_at: day,
        featured: false,
        seen_on: 'omarchy-hub',
      },
      day,
    );
    posts.push(created);
    seenIds.add(id);
    added++;
  }

  const marked = markMissing(posts, {
    seenIds,
    complete,
    today: day,
    inScope: (record) => record.seen_on === 'omarchy-hub' && record.kind !== 'setup',
  });
  await ctx.writeData('posts.json', marked.records);
  await commitSourceStatus(ctx, 'omarchy-hub', marked.stats, { complete });
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
