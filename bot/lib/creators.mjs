// Creator slug rules, shared by the site (src/lib/creators.ts), the D1 sync and
// the build-time summary. Frozen signature: changing it changes public URLs.

/** Empty / punctuation-only names become `author`. */
export function slugifyAuthor(name) {
  const slug = String(name)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'author';
}

export function uniqueSlug(base, taken) {
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

/** name -> slug for every author across themes, plugins and posts. */
export function creatorSlugMap({ themes = [], plugins = [], posts = [] }) {
  const names = new Set();
  for (const list of [themes, plugins, posts]) {
    for (const item of list) {
      const name = item.author?.trim();
      if (name) names.add(name);
    }
  }
  const taken = new Set();
  const map = {};
  for (const name of [...names].sort((a, b) => a.localeCompare(b))) {
    map[name] = uniqueSlug(slugifyAuthor(name), taken);
  }
  return map;
}
