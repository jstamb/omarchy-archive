import appsJson from '../../data/apps.json';
import metaJson from '../../data/meta.json';
import pluginsJson from '../../data/plugins.json';
import postsJson from '../../data/posts.json';
import sourcesJson from '../../data/sources.json';
import themesJson from '../../data/themes.json';
import timelineJson from '../../data/timeline.json';

export type InstallType =
  | 'theme-set'
  | 'theme-install'
  | 'plugin-add'
  | 'plugin-enable'
  | 'bar-use'
  | 'pkg'
  | 'menu'
  | 'webapp';

export interface Install {
  type: InstallType;
  command: string | null;
  hint?: string | null;
}

export interface Meta {
  site_name: string;
  site_url: string;
  tagline: string;
  positioning: string;
  disclaimer: string;
  repo_url: string;
  updated_at: string;
}

export interface Source {
  id: string;
  name: string;
  url: string;
  kinds: string[];
  blurb?: string | null;
  official?: boolean;
  ingest: string;
  catalog_url?: string;
}

export type PostKind = 'setup' | 'theme' | 'plugin' | 'idea' | 'hardware' | 'other';

export interface Post {
  id: string;
  kind: PostKind;
  title: string;
  summary: string | null;
  author: string | null;
  author_url: string | null;
  source_platform: string;
  source_url: string;
  image: string | null;
  image_hosted?: boolean;
  device?: string | null;
  form_factor?: string | null;
  tags: string[];
  related_theme_ids: string[];
  related_plugin_ids: string[];
  created_at: string | null;
  added_at: string;
  featured?: boolean;
  seen_on?: string | null;
}

export interface Theme {
  id: string;
  name: string;
  author: string | null;
  official: boolean;
  bundled: boolean;
  repo_url: string | null;
  listing_url: string | null;
  image: string | null;
  image_hosted?: boolean;
  tone: 'dark' | 'light' | null;
  palette: string[];
  tags: string[];
  install: Install;
  seen_on?: string | null;
  added_at: string;
}

export interface Plugin {
  id: string;
  name: string;
  author: string | null;
  summary: string | null;
  repo_url: string | null;
  listing_url: string | null;
  image: string | null;
  image_hosted?: boolean;
  tags: string[];
  kinds: string[];
  category: string | null;
  first_party: boolean;
  stars: number | null;
  install: Install;
  warning: string | null;
  seen_on?: string | null;
  added_at: string;
}

export interface App {
  id: string;
  name: string;
  channel: 'omarchy-menu' | 'pkg' | 'webapp' | string;
  menu_path?: string | null;
  install: Install;
  added_at?: string;
}

export interface Contributor {
  handle: string;
  /** GitHub's own "made their first contribution" line — the release they joined. */
  first_time?: boolean;
  pull_request?: string | null;
}

export interface Release {
  id: string;
  version: string;
  major: number;
  date: string;
  published_at: string;
  /** node = worth stopping at, rendered in full. tick = a mark on the line. */
  tier: 'node' | 'tick';
  score: number;
  headline: string | null;
  summary: string | null;
  highlights: string[];
  contributors: Contributor[];
  release_url: string;
  notes_chars: number;
}

export const meta = metaJson as Meta;
export const sources = sourcesJson as Source[];
export const posts = postsJson as Post[];
export const themes = themesJson as Theme[];
export const plugins = pluginsJson as Plugin[];
export const apps = appsJson as App[];
export const timeline = timelineJson as Release[];

export const sourceById = new Map(sources.map((source) => [source.id, source]));
export const themeById = new Map(themes.map((theme) => [theme.id, theme]));
export const pluginById = new Map(plugins.map((plugin) => [plugin.id, plugin]));

/**
 * Plugin ids are reverse-DNS (`io.github.user.thing`). Dots in a URL segment
 * make static hosts guess "file" over "directory", so routes use a dashed slug
 * while the record keeps its catalog id.
 */
export function pluginSlug(id: string) {
  return id.replace(/\./g, '-');
}

/** Newest first. `created_at` when the source dated it, else the day we added it. */
export function byNewest<T extends { created_at?: string | null; added_at?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => dateKey(b).localeCompare(dateKey(a)));
}

function dateKey(item: { created_at?: string | null; added_at?: string }) {
  return item.created_at ?? item.added_at ?? '';
}

export const setups = posts.filter((post) => post.kind === 'setup');
export const featuredPosts = byNewest(posts.filter((post) => post.featured));

/** Posts that name a theme or plugin, for the "seen in the wild" block. */
export function postsForTheme(themeId: string) {
  return byNewest(posts.filter((post) => post.related_theme_ids.includes(themeId)));
}

export function postsForPlugin(pluginId: string) {
  return byNewest(posts.filter((post) => post.related_plugin_ids.includes(pluginId)));
}

/** Platforms where the author string is a handle, so it reads with an @. */
const HANDLE_PLATFORMS: Record<string, true> = {
  x: true,
  reddit: true,
  mastodon: true,
  github: true,
};

/**
 * How to credit a post. On social platforms the author is a handle; on a blog
 * or a news site it is a name or a hostname, and "@willem.com" reads wrong.
 */
export function authorLabel(post: Pick<Post, 'author' | 'source_platform'>) {
  if (!post.author) return null;
  return HANDLE_PLATFORMS[post.source_platform] ? `@${post.author}` : post.author;
}

/**
 * The timeline as the history page draws it: each node, followed by the ticks
 * released between it and the next node down. Input is newest first and stays
 * that way — the page never re-sorts.
 */
export function releaseGroups() {
  const groups: { node: Release; ticks: Release[] }[] = [];
  let pending: Release[] = [];

  for (const release of timeline) {
    if (release.tier === 'node') {
      groups.push({ node: release, ticks: pending });
      pending = [];
    } else {
      pending.push(release);
    }
  }
  // Anything older than the last node has no node to hang from; the oldest
  // group absorbs it so no release is silently dropped from the page.
  if (pending.length > 0 && groups.length > 0) {
    groups[groups.length - 1].ticks.push(...pending);
  }
  return groups;
}

/** Everyone credited across the whole history, most-credited first. */
export function topContributors(limit = 24) {
  const counts = new Map<string, { handle: string; releases: number; firstTime: boolean }>();
  for (const release of timeline) {
    for (const person of release.contributors) {
      const existing = counts.get(person.handle.toLowerCase());
      if (existing) existing.releases++;
      else {
        counts.set(person.handle.toLowerCase(), {
          handle: person.handle,
          releases: 1,
          firstTime: Boolean(person.first_time),
        });
      }
    }
  }
  return [...counts.values()]
    .sort((a, b) => b.releases - a.releases || a.handle.localeCompare(b.handle))
    .slice(0, limit);
}

/** Tag counts, most used first — the chip row on every gallery page. */
export function tagFacets(items: { tags: string[] }[], min = 1) {
  const counts = new Map<string, number>();
  for (const item of items) {
    for (const tag of item.tags) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts.entries()]
    .filter(([, count]) => count >= min)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: value.replace(/-/g, ' '), count }));
}

export function valueFacets<T>(
  items: T[],
  pick: (item: T) => string | null | undefined,
  label: (value: string) => string = (value) => value.replace(/-/g, ' '),
) {
  const counts = new Map<string, number>();
  for (const item of items) {
    const value = pick(item);
    if (!value) continue;
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([value, count]) => ({ value, label: label(value), count }));
}

/** The mixed feed: everything that has a page, newest first. */
export type FeedItem =
  | { type: 'post'; item: Post }
  | { type: 'theme'; item: Theme }
  | { type: 'plugin'; item: Plugin };

export function mixedFeed(limit?: number): FeedItem[] {
  const all: FeedItem[] = [
    ...posts.map((item) => ({ type: 'post' as const, item })),
    ...themes.map((item) => ({ type: 'theme' as const, item })),
    ...plugins.map((item) => ({ type: 'plugin' as const, item })),
  ];
  all.sort((a, b) => dateKey(b.item).localeCompare(dateKey(a.item)));
  return limit ? all.slice(0, limit) : all;
}

export const counts = {
  posts: posts.length,
  setups: setups.length,
  themes: themes.length,
  bundledThemes: themes.filter((theme) => theme.bundled).length,
  extraThemes: themes.filter((theme) => !theme.bundled).length,
  plugins: plugins.length,
  sources: sources.length,
  apps: apps.length,
  releases: timeline.length,
  milestones: timeline.filter((release) => release.tier === 'node').length,
};

/** Human label for an install command, shown above the copy box. */
export const installLabels: Record<InstallType, string> = {
  'theme-set': 'Apply this bundled theme',
  'theme-install': 'Install this theme from git',
  'plugin-add': 'Add this plugin from git',
  'plugin-enable': 'Enable this bundled plugin',
  'bar-use': 'Use this bar',
  pkg: 'Install this package',
  menu: 'Install from the Omarchy menu',
  webapp: 'Install as a web app',
};

/** Menu path that reaches the same place as the command, shown underneath. */
export const installMenuPaths: Record<InstallType, string | null> = {
  'theme-set': 'Super + Space → Style → Theme',
  'theme-install': 'Super + Space → Install → Style → Theme',
  'plugin-add': 'Super + Space → Setup → Plugins → Add',
  'plugin-enable': 'Super + Space → Setup → Plugins',
  'bar-use': 'Super + Space → Setup → Bar',
  pkg: 'Super + Space → Install → Package',
  menu: null,
  webapp: 'Super + Space → Install → Web App',
};

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

export function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const date = new Date(value.length === 10 ? `${value}T00:00:00Z` : value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  });
}
