import { plugins, posts, themes, type Plugin, type Post, type Theme } from './content';

export interface Creator {
  slug: string;
  name: string;
  themes: Theme[];
  plugins: Plugin[];
  posts: Post[];
}

/** Frozen signature for author URLs. Empty / punctuation-only names become `author`. */
export function slugifyAuthor(name: string): string {
  const slug = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'author';
}

function uniqueSlug(base: string, taken: Set<string>) {
  if (!taken.has(base)) {
    taken.add(base);
    return base;
  }
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  const slug = `${base}-${n}`;
  taken.add(slug);
  return slug;
}

function groupByAuthor<T extends { author: string | null }>(items: T[]) {
  const groups = new Map<string, T[]>();
  for (const item of items) {
    const name = item.author?.trim();
    if (!name) continue;
    const list = groups.get(name) ?? [];
    list.push(item);
    groups.set(name, list);
  }
  return groups;
}

let cached: Creator[] | null = null;
let bySlug: Map<string, Creator> | null = null;
let hrefByName: Map<string, string> | null = null;

function build() {
  const themeGroups = groupByAuthor(themes);
  const pluginGroups = groupByAuthor(plugins);
  const postGroups = groupByAuthor(posts);
  const names = new Set([...themeGroups.keys(), ...pluginGroups.keys(), ...postGroups.keys()]);
  const taken = new Set<string>();
  const list: Creator[] = [...names]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({
      slug: uniqueSlug(slugifyAuthor(name), taken),
      name,
      themes: themeGroups.get(name) ?? [],
      plugins: pluginGroups.get(name) ?? [],
      posts: postGroups.get(name) ?? [],
    }));
  cached = list;
  bySlug = new Map(list.map((creator) => [creator.slug, creator]));
  hrefByName = new Map(list.map((creator) => [creator.name, `/creators/${creator.slug}/`]));
}

export function allCreators(): Creator[] {
  if (!cached) build();
  return cached!;
}

export function creatorBySlug(slug: string): Creator | undefined {
  if (!bySlug) build();
  return bySlug!.get(slug);
}

export function creatorHref(name: string | null | undefined): string | null {
  if (!name?.trim()) return null;
  if (!hrefByName) build();
  return hrefByName!.get(name.trim()) ?? null;
}

export function creatorCount(creator: Creator) {
  return creator.themes.length + creator.plugins.length + creator.posts.length;
}
