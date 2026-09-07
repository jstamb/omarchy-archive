/**
 * The one preservation rule, stated once so every gate agrees on it.
 *
 * data/*.json is append-mostly: relative to a baseline a file may stay the same
 * length or grow, and every id that was ever published must still be present. A
 * shorter file or a vanished id is a clobbered write, not an edit — which is the
 * exact failure both real breaks were (a scrape run wrote a single sentinel
 * string over data/posts.json, twice, under a message claiming new posts).
 *
 * This module is pure: no filesystem, no git, no process. Callers gather the two
 * sides — precommit.mjs from the working tree vs HEAD, preserve.mjs from an
 * explicit base ref, the staged ingest from pre-run vs candidate records — and
 * hand them here to turn into a refusal message or a counted commit line.
 *
 * Frozen contract (imported by bot/preserve.mjs, bot/precommit.mjs, and the
 * Task 5 staged ingest):
 *   comparePreservation(before, after, { label }) -> { ok, delta, lost, goneIds, count, problem }
 *   checkFile(label, beforeText, afterText)       -> { ok, label, delta, count, problem }
 *   preserveAll(entries)                          -> { ok, problems, changed, lines, results }
 *   parseBaseline(text)                           -> array | null
 *   countedLabel(name, delta)                     -> string
 *   PRESERVED_FILES                               -> string[]
 */

/**
 * The array files the gates guard. meta.json is deliberately absent: it is an
 * object, it is rewritten every run, and it publishes no ids to preserve.
 */
export const PRESERVED_FILES = ['posts', 'themes', 'plugins', 'sources', 'apps', 'timeline'];

/** Ids present in `before` that no record in `after` still carries. */
function droppedIds(before, after) {
  const present = new Set(after.map((record) => record && record.id).filter(Boolean));
  return before.map((record) => record && record.id).filter((id) => id && !present.has(id));
}

/**
 * Core comparison on already-parsed arrays. This is the export the staged
 * ingest imports; it never touches the filesystem and never throws for a data
 * reason (a shape problem is a caller error and does throw).
 *
 * @param {unknown[]|null} before  Baseline records, or null when there is no
 *   baseline (a new file, or a first commit). null means "nothing to preserve".
 * @param {unknown[]} after  Candidate records. Must be an array.
 * @returns {{ok:boolean, delta:number|null, lost:number, goneIds:string[], count:number, problem:string|null}}
 *   delta is after.length-before.length (null when before is null); lost is the
 *   count-drop magnitude (0 unless the file shrank); goneIds are published ids
 *   missing from after; ok === (lost === 0 && goneIds.length === 0).
 */
export function comparePreservation(before, after, { label = 'records' } = {}) {
  if (!Array.isArray(after)) {
    throw new TypeError('comparePreservation: after must be an array of records');
  }
  const count = after.length;

  if (before === null || before === undefined) {
    return { ok: true, delta: null, lost: 0, goneIds: [], count, problem: null };
  }
  if (!Array.isArray(before)) {
    throw new TypeError('comparePreservation: before must be an array of records or null');
  }

  const delta = count - before.length;
  const lost = delta < 0 ? -delta : 0;
  if (lost > 0) {
    return {
      ok: false,
      delta,
      lost,
      goneIds: droppedIds(before, after),
      count,
      problem:
        `${label} lost ${lost} records (${before.length} → ${count}). ` +
        'These files are added to, not rewritten. Read the file, push onto the array, ' +
        'write it back.',
    };
  }

  const goneIds = droppedIds(before, after);
  if (goneIds.length > 0) {
    return {
      ok: false,
      delta,
      lost: 0,
      goneIds,
      count,
      problem:
        `${label} dropped published ids: ${goneIds.slice(0, 5).join(', ')}` +
        `${goneIds.length > 5 ? ` and ${goneIds.length - 5} more` : ''}. Ids are permanent.`,
    };
  }

  return { ok: true, delta, lost: 0, goneIds: [], count, problem: null };
}

/**
 * Parse a data file's text leniently for use as a BASELINE. A baseline that is
 * itself broken — a bad file already in history, or a file that does not exist
 * at the base — cannot constrain the candidate, so this returns null rather
 * than throwing. The candidate still has to parse and be an array on its own.
 */
export function parseBaseline(text) {
  if (text === null || text === undefined) return null;
  try {
    const value = JSON.parse(text);
    return Array.isArray(value) ? value : null;
  } catch {
    return null;
  }
}

/**
 * Text-level check for one file: the candidate must parse and be an array, then
 * it is compared to the (leniently parsed) baseline. `beforeText`/`afterText`
 * are raw file text or null (null after = the candidate no longer has the file).
 */
export function checkFile(label, beforeText, afterText) {
  if (afterText === null || afterText === undefined) {
    const baseline = parseBaseline(beforeText);
    if (baseline === null) {
      // Absent on both sides: the file simply is not part of this repo.
      return { ok: true, label, delta: null, count: 0, problem: null };
    }
    return {
      ok: false,
      label,
      delta: null,
      count: 0,
      problem:
        `${label} is missing from the candidate — it held ${baseline.length} record(s) at ` +
        'the baseline. A published file cannot be deleted; restore it and write the full ' +
        'array back.',
    };
  }

  let after;
  try {
    after = JSON.parse(afterText);
  } catch {
    /*
     * The exact shape of both real failures. Show what is actually in the file,
     * because "invalid JSON" sent someone looking for a syntax error when the
     * file was 21 bytes of placeholder.
     */
    const preview = String(afterText).trim().slice(0, 60);
    return {
      ok: false,
      label,
      delta: null,
      count: 0,
      problem:
        `${label} does not parse — the file now begins ${JSON.stringify(preview)}. ` +
        'If that is a path or a placeholder, the write replaced the file instead of ' +
        'adding to it. Restore it from the committed baseline and write the full array ' +
        'back, not a fragment.',
    };
  }

  if (!Array.isArray(after)) {
    return {
      ok: false,
      label,
      delta: null,
      count: 0,
      problem: `${label} is a ${typeof after}, expected an array`,
    };
  }

  const verdict = comparePreservation(parseBaseline(beforeText), after, { label });
  return { ok: verdict.ok, label, delta: verdict.delta, count: verdict.count, problem: verdict.problem };
}

/** `posts` + 3 → `3 posts`; `posts` + 1 → `1 post`. Reads like English in a commit message. */
export function countedLabel(name, delta) {
  return `${delta} ${delta === 1 ? name.replace(/s$/, '') : name}`;
}

/**
 * Run checkFile across a set of files and accumulate the way both gates need:
 * every problem collected (not just the first), total added records, and one
 * counted English fragment per grown file. `entries` is
 * `{ name, label?, before, after }[]` where before/after are file text or null.
 */
export function preserveAll(entries) {
  const problems = [];
  const lines = [];
  const results = [];
  let changed = 0;

  for (const entry of entries) {
    const label = entry.label ?? `data/${entry.name}.json`;
    const result = checkFile(label, entry.before, entry.after);
    results.push(result);
    if (!result.ok) {
      problems.push(result.problem);
      continue;
    }
    // A new file (delta null) is safe but not counted: the commit message counts
    // growth against a known baseline only, matching the local gate.
    if (typeof result.delta === 'number' && result.delta > 0) {
      changed += result.delta;
      lines.push(countedLabel(entry.name, result.delta));
    }
  }

  return { ok: problems.length === 0, problems, changed, lines, results };
}
