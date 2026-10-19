// Record -> D1 row mapping, hashing and SQL rendering for bot/sync-d1.mjs.
// Pure functions only, so they are unit-tested without a database.
import { createHash } from 'node:crypto';

/** Stable JSON: object keys sorted at every depth. */
export function canonicalJSON(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJSON).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value)
      .sort()
      .filter((k) => value[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJSON(value[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export const sha256 = (text) => createHash('sha256').update(text).digest('hex');

export const pluginSlug = (id) => id.replace(/\./g, '-');

/** FTS rowid: stable 48-bit integer per (kind, id), so deletes hit the rowid. */
export function ftsRowid(kind, id) {
  return parseInt(sha256(`${kind}:${id}`).slice(0, 12), 16);
}

const postType = (post) => (post.kind === 'setup' ? 'setup' : post.kind === 'idea' ? 'guide' : 'post');
const words = (...parts) => parts.flat().filter((p) => p !== null && p !== undefined && p !== '').join(' ');

/**
 * Table specs, in seed order (small tables first, the plugin catalog last).
 * `volatile` fields are left out of the change hash: the plugin catalog ingest
 * refreshes stars / last_seen_at on thousands of records, and rewriting every
 * row for a star count would make writes scale with catalog size.
 */
export const TABLES = [
  {
    table: 'sources',
    file: 'sources.json',
    kind: 'source',
    volatile: [],
    columns: (r, ord) => ({ id: r.id, ord }),
    search: null,
  },
  {
    table: 'timeline',
    file: 'timeline.json',
    kind: 'release',
    volatile: [],
    columns: (r, ord) => ({ id: r.id, date: r.date ?? null, ord }),
    search: (r) => ({
      type: 'release',
      url: `/history/#${r.id}`,
      title: r.headline ? `${r.version ?? r.id}: ${r.headline}` : String(r.version ?? r.id),
      body: words(r.summary, r.highlights),
    }),
  },
  {
    table: 'themes',
    file: 'themes.json',
    kind: 'theme',
    volatile: ['last_seen_at'],
    columns: (r, ord) => ({ id: r.id, author: r.author?.trim() || null, added_at: r.added_at ?? null, ord }),
    search: (r) => ({
      type: 'theme',
      url: `/themes/${r.id}/`,
      title: r.name ?? r.id,
      body: words(r.author, r.tone, r.tags),
    }),
  },
  {
    table: 'posts',
    file: 'posts.json',
    kind: 'post',
    volatile: [],
    columns: (r, ord) => ({
      id: r.id,
      author: r.author?.trim() || null,
      kind: r.kind ?? null,
      source_platform: r.source_platform ?? null,
      created_at: r.created_at ?? null,
      added_at: r.added_at ?? null,
      featured: r.featured ? 1 : 0,
      ord,
    }),
    search: (r) => ({
      type: postType(r),
      url: `/posts/${r.id}/`,
      title: r.title ?? r.id,
      body: words(r.summary, r.author, r.device, r.tags),
    }),
    refs: (r) => [
      ...(r.related_theme_ids ?? []).map((id) => ['theme', id]),
      ...(r.related_plugin_ids ?? []).map((id) => ['plugin', id]),
    ],
  },
  {
    table: 'plugins',
    file: 'plugins.json',
    kind: 'plugin',
    volatile: ['stars', 'last_seen_at'],
    columns: (r, ord) => ({
      id: r.id,
      slug: pluginSlug(r.id),
      author: r.author?.trim() || null,
      category: r.category ?? null,
      added_at: r.added_at ?? null,
      ord,
    }),
    search: (r) => ({
      type: 'plugin',
      url: `/plugins/${pluginSlug(r.id)}/`,
      title: r.name ?? r.id,
      body: words(r.summary, r.author, r.category, r.tags),
    }),
  },
];

export const tableSpec = (name) => TABLES.find((t) => t.table === name);

/** Everything the sync needs to know about one record. */
export function describeRecord(spec, record, ord) {
  const stable = { ...record };
  for (const field of spec.volatile) delete stable[field];
  const search = spec.search ? spec.search(record) : null;
  return {
    id: record.id,
    columns: spec.columns(record, ord),
    doc: JSON.stringify(record),
    hash: sha256(canonicalJSON(stable)),
    thash: sha256(canonicalJSON(search)),
    search,
    refs: spec.refs ? spec.refs(record) : [],
  };
}

export function describeFile(spec, records) {
  const map = new Map();
  (records ?? []).forEach((record, ord) => map.set(record.id, describeRecord(spec, record, ord)));
  return map;
}

// ---- SQL rendering (literals inlined: wrangler --file takes no bind params) ----

export function lit(value) {
  if (value === null || value === undefined) return 'NULL';
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL';
  if (typeof value === 'boolean') return value ? '1' : '0';
  return `'${String(value).replace(/'/g, "''")}'`;
}

export function upsertSql(spec, rec) {
  const cols = { ...rec.columns, doc: rec.doc, hash: rec.hash, thash: rec.thash };
  const names = Object.keys(cols);
  const sets = names.filter((n) => n !== 'id').map((n) => `${n}=excluded.${n}`);
  return `INSERT INTO ${spec.table} (${names.join(',')}) VALUES (${names
    .map((n) => lit(cols[n]))
    .join(',')}) ON CONFLICT(id) DO UPDATE SET ${sets.join(',')};`;
}

export const deleteSql = (spec, id) => `DELETE FROM ${spec.table} WHERE id=${lit(id)};`;

export const ftsDeleteSql = (spec, id) => `DELETE FROM search WHERE rowid=${ftsRowid(spec.kind, id)};`;

export function ftsInsertSql(spec, rec) {
  const s = rec.search;
  return `INSERT INTO search (rowid,kind,ref_id,type,url,title,body) VALUES (${ftsRowid(spec.kind, rec.id)},${lit(
    spec.kind,
  )},${lit(rec.id)},${lit(s.type)},${lit(s.url)},${lit(s.title)},${lit(s.body)});`;
}

export const refInsertSql = (postId, [kind, id]) =>
  `INSERT OR IGNORE INTO post_refs (target_kind,target_id,post_id) VALUES (${lit(kind)},${lit(id)},${lit(postId)});`;

export const refDeleteSql = (postId, [kind, id]) =>
  `DELETE FROM post_refs WHERE target_kind=${lit(kind)} AND target_id=${lit(id)} AND post_id=${lit(postId)};`;

export const stateSql = (k, v) =>
  `INSERT INTO sync_state (k,v) VALUES (${lit(k)},${lit(v)}) ON CONFLICT(k) DO UPDATE SET v=excluded.v;`;

/**
 * Turn one planned op into statements. `prev` is the D1 row as read during
 * verification ({hash, thash, doc}) or undefined for an insert.
 * Second-level skips: FTS only when the searchable text changed; refs only by delta.
 */
export function opStatements(spec, op) {
  const out = [];
  if (op.type === 'delete') {
    out.push(deleteSql(spec, op.id));
    if (spec.search) out.push(ftsDeleteSql(spec, op.id));
    if (spec.refs) out.push(`DELETE FROM post_refs WHERE post_id=${lit(op.id)};`);
    return out;
  }
  const { rec, prev } = op;
  out.push(upsertSql(spec, rec));
  if (spec.search && (!prev || prev.thash !== rec.thash)) {
    if (prev) out.push(ftsDeleteSql(spec, rec.id));
    out.push(ftsInsertSql(spec, rec));
  }
  if (spec.refs) {
    const key = ([k, i]) => `${k}\u0000${i}`;
    const before = new Map((prev?.doc ? spec.refs(JSON.parse(prev.doc)) : []).map((r) => [key(r), r]));
    const after = new Map(rec.refs.map((r) => [key(r), r]));
    for (const [k, r] of before) if (!after.has(k)) out.push(refDeleteSql(rec.id, r));
    for (const [k, r] of after) if (!before.has(k)) out.push(refInsertSql(rec.id, r));
  }
  return out;
}

/** Pessimistic default rows-written per op; refined by measured averages. */
export const DEFAULT_COST = {
  insert: 15,
  update: 15,
  delete: 15,
};

export function estimateCost(ops, model = DEFAULT_COST) {
  let total = 0;
  for (const op of ops) {
    const per = model[`${op.table}:${op.type}`] ?? model[op.type] ?? DEFAULT_COST[op.type];
    total += Math.ceil(per);
  }
  return total;
}
