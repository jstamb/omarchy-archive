// D1 reads for the on-demand routes. Every query is a primary-key or indexed
// lookup; the record JSON in `doc` is rendered as-is.
import type { D1Database, R2Bucket } from '@cloudflare/workers-types';
import type { Plugin, Post, Theme } from './content';

export interface Env {
  DB: D1Database;
  IMAGES?: R2Bucket;
  SITE_URL?: string;
}

export function env(locals: App.Locals): Env {
  const e = (locals as { runtime?: { env?: Env } }).runtime?.env;
  if (!e?.DB) throw new Error('D1 binding DB is not configured');
  return e;
}

const docs = <T>(rows: { doc: string }[]): T[] => rows.map((r) => JSON.parse(r.doc) as T);

async function byIds<T>(db: D1Database, table: string, ids: string[]): Promise<Map<string, T>> {
  const out = new Map<string, T>();
  if (!ids.length) return out;
  const unique = [...new Set(ids)].slice(0, 90);
  const { results } = await db
    .prepare(`SELECT doc FROM ${table} WHERE id IN (${unique.map(() => '?').join(',')})`)
    .bind(...unique)
    .all<{ doc: string }>();
  for (const doc of docs<T & { id: string }>(results)) out.set(doc.id, doc);
  return out;
}

export async function getPost(db: D1Database, id: string) {
  const row = await db.prepare('SELECT doc FROM posts WHERE id = ?').bind(id).first<{ doc: string }>();
  return row ? (JSON.parse(row.doc) as Post) : null;
}

export async function postPageData(db: D1Database, post: Post) {
  const [themes, plugins, replacement, nearbyRows] = await Promise.all([
    byIds<Theme>(db, 'themes', post.related_theme_ids ?? []),
    byIds<Plugin>(db, 'plugins', post.related_plugin_ids ?? []),
    post.replaced_by ? getPost(db, post.replaced_by) : Promise.resolve(null),
    // "More like this": same kind, newest first, sharing a tag. Filtered here,
    // not in SQL, because tags live inside the JSON doc.
    db
      .prepare('SELECT doc FROM posts WHERE kind = ? AND id <> ? ORDER BY added_at DESC, ord DESC LIMIT 400')
      .bind(post.kind, post.id)
      .all<{ doc: string }>(),
  ]);
  const tags = new Set(post.tags ?? []);
  const nearby = docs<Post>(nearbyRows.results)
    .filter((other) => (other.tags ?? []).some((tag) => tags.has(tag)))
    .slice(0, 3);
  return {
    relatedThemes: (post.related_theme_ids ?? []).map((id) => themes.get(id)).filter((t): t is Theme => !!t),
    relatedPlugins: (post.related_plugin_ids ?? []).map((id) => plugins.get(id)).filter((p): p is Plugin => !!p),
    replacement,
    nearby,
  };
}

export async function getPluginBySlug(db: D1Database, slug: string) {
  const row = await db.prepare('SELECT doc FROM plugins WHERE slug = ?').bind(slug).first<{ doc: string }>();
  return row ? (JSON.parse(row.doc) as Plugin) : null;
}

export async function pluginPageData(db: D1Database, plugin: Plugin) {
  const [wild, siblings, replacement] = await Promise.all([
    db
      .prepare(
        `SELECT p.doc FROM post_refs r JOIN posts p ON p.id = r.post_id
         WHERE r.target_kind = 'plugin' AND r.target_id = ? ORDER BY p.added_at DESC, p.ord DESC`,
      )
      .bind(plugin.id)
      .all<{ doc: string }>(),
    plugin.category
      ? db
          .prepare('SELECT doc FROM plugins WHERE category = ? AND id <> ? ORDER BY ord LIMIT 3')
          .bind(plugin.category, plugin.id)
          .all<{ doc: string }>()
      : Promise.resolve({ results: [] as { doc: string }[] }),
    plugin.replaced_by
      ? db.prepare('SELECT doc FROM plugins WHERE id = ?').bind(plugin.replaced_by).first<{ doc: string }>()
      : Promise.resolve(null),
  ]);
  return {
    inTheWild: docs<Post>(wild.results),
    siblings: docs<Plugin>(siblings.results),
    replacement: replacement ? (JSON.parse(replacement.doc) as Plugin) : null,
  };
}

export async function creatorRecords(db: D1Database, name: string) {
  const [themes, plugins, posts] = await db.batch<{ doc: string }>([
    db.prepare('SELECT doc FROM themes WHERE author = ? ORDER BY ord').bind(name),
    db.prepare('SELECT doc FROM plugins WHERE author = ? ORDER BY ord').bind(name),
    db.prepare('SELECT doc FROM posts WHERE author = ? ORDER BY ord').bind(name),
  ]);
  return {
    themes: docs<Theme>(themes.results),
    plugins: docs<Plugin>(plugins.results),
    posts: docs<Post>(posts.results),
  };
}

/**
 * Edge-cache headers for an on-demand response. `tags` must match the ones
 * bot/sync-d1.mjs emits so a sync purges exactly the pages it changed.
 */
export function cacheHeaders(headers: Headers, tags: string[], sMaxAge = 86_400) {
  headers.set('Cache-Control', `public, max-age=300, s-maxage=${sMaxAge}, stale-while-revalidate=604800`);
  headers.set('Cache-Tag', tags.join(','));
}
