/**
 * Provenance and record-state reconciliation for ingest runs.
 *
 * Pure: no filesystem, no dates except the `today` the caller passes. Ingest
 * commands stamp seen records, mark missing ones unavailable only after a
 * complete catalog fetch, and never delete a published id.
 */

const VERIFIED_KEYS = [
  'name',
  'title',
  'author',
  'summary',
  'image',
  'image_hosted',
  'install',
  'repo_url',
  'listing_url',
  'official',
  'bundled',
  'first_party',
  'stars',
  'tags',
  'kinds',
  'category',
  'tone',
  'palette',
  'warning',
  'original_asset_url',
  'upstream_rev',
];

/** True when a verified upstream field actually changed. */
export function verifiedFieldsChanged(before, after) {
  return VERIFIED_KEYS.some((key) => {
    if (after[key] === undefined) return false;
    return JSON.stringify(before[key]) !== JSON.stringify(after[key]);
  });
}

/**
 * Merge an upstream update onto an existing record and stamp seen dates.
 * Never rewrites added_at. Never backfills first_seen_at from added_at.
 */
export function applySeen(existing, update, today) {
  const changed = verifiedFieldsChanged(existing, update);
  const next = {
    ...existing,
    ...update,
    added_at: existing.added_at,
    last_seen_at: today,
  };
  if (next.first_seen_at == null) next.first_seen_at = today;
  const revived = existing.status === 'unavailable';
  if (revived) next.status = 'active';
  else if (!next.status) next.status = 'active';
  if (changed || revived) next.last_changed_at = today;
  return next;
}

/** Stamp a brand-new record that has never been published. */
export function applyNew(record, today) {
  return {
    ...record,
    first_seen_at: today,
    last_seen_at: today,
    status: record.status ?? 'active',
  };
}

/**
 * After a complete catalog fetch, mark in-scope records that were not seen
 * as unavailable. Incomplete fetches leave them alone. Never deletes.
 *
 * @param {object[]} records
 * @param {{ seenIds: Iterable<string>, complete: boolean, today: string, inScope?: (record: object) => boolean }} opts
 */
export function markMissing(records, { seenIds, complete, today, inScope }) {
  const seen = seenIds instanceof Set ? seenIds : new Set(seenIds);
  const scope = inScope ?? (() => true);
  if (!complete) {
    return {
      records,
      stats: {
        upstream_count: seen.size,
        indexed_count: records.filter((record) => scope(record) && seen.has(record.id)).length,
        excluded_count: 0,
      },
    };
  }
  const next = records.map((record) => {
    if (!scope(record) || seen.has(record.id)) return record;
    if (record.status === 'unavailable') return record;
    return { ...record, status: 'unavailable', last_changed_at: today };
  });
  const scoped = next.filter(scope);
  return {
    records: next,
    stats: {
      upstream_count: seen.size,
      indexed_count: scoped.filter((record) => seen.has(record.id)).length,
      excluded_count: scoped.filter((record) => !seen.has(record.id)).length,
    },
  };
}

/**
 * Merge a per-source diagnostic into data/source-status.json (object, not array).
 * Absence of the file is represented as `{}`.
 */
export function recordSourceStatus(status, sourceId, patch) {
  const previous = status && typeof status === 'object' && !Array.isArray(status) ? status : {};
  return {
    ...previous,
    [sourceId]: {
      last_attempt_at: null,
      last_success_at: null,
      upstream_count: null,
      indexed_count: null,
      excluded_count: null,
      note: null,
      ...(previous[sourceId] ?? {}),
      ...patch,
    },
  };
}
