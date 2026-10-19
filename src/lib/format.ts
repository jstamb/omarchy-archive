// Pure helpers with no data imports. SSR routes (Worker bundle) import from
// here so the 8 MB of data/*.json never ships in the Worker.
import type { InstallType, Post } from './content';

/**
 * Plugin ids are reverse-DNS (`io.github.user.thing`). Dots in a URL segment
 * make static hosts guess "file" over "directory", so routes use a dashed slug
 * while the record keeps its catalog id.
 */
export function pluginSlug(id: string) {
  return id.replace(/\./g, '-');
}

/**
 * Newest first by when the archive indexed the record.
 * `added_at` is a day, and ingest appends, so two records on the same day
 * break the tie by file position — later in the array was indexed later.
 */
export function byNewest<T extends { created_at?: string | null; added_at?: string }>(items: T[]): T[] {
  return items
    .map((item, index) => ({ item, index }))
    .sort((a, b) => dateKey(b.item).localeCompare(dateKey(a.item)) || b.index - a.index)
    .map((entry) => entry.item);
}

export function dateKey(item: { created_at?: string | null; added_at?: string }) {
  return item.added_at ?? item.created_at ?? '';
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

/** Absent or active is the default; only non-active states are labeled. */
export function statusLabel(status?: string | null) {
  if (!status || status === 'active') return null;
  if (status === 'unavailable') return 'Historical — no longer listed upstream';
  if (status === 'deprecated') return 'Deprecated';
  if (status === 'replaced') return 'Replaced';
  return status;
}

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

/** Index timestamp in Pacific Time, for the live masthead stamp. */
export function formatIndexStamp(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const zone = 'America/Los_Angeles';
  const day = date.toLocaleDateString('en-US', {
    timeZone: zone,
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const time = date.toLocaleTimeString('en-US', {
    timeZone: zone,
    hour: 'numeric',
    minute: '2-digit',
  });
  return `${day}, ${time} (Pacific Time)`;
}
