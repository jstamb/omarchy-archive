/**
 * Fail-closed staged ingestion.
 *
 * A run never touches the published tree until it has earned it. Every
 * candidate JSON file and asset is assembled in an owned temporary tree that is
 * seeded — by symlink, so the real 12MB of images cost nothing — as a mirror of
 * the live data/ and public/. The ingest logic writes only into that staging
 * tree. Then, in order:
 *
 *   1. the real bot/validate.mjs runs over the whole candidate collection —
 *      schema, dedup keys, cross-file references, hosted-asset existence, and
 *      the image budget, all at once;
 *   2. preservation runs the candidate arrays against the records captured
 *      before the run, so a run that would drop a published id or shrink a
 *      collection is refused even though its JSON is perfectly valid;
 *   3. only then are the changed artifacts published into the working tree,
 *      each written atomically (temp + rename).
 *
 * This is emphatically NOT a multi-file filesystem transaction: publication
 * walks several files and each rename is individually atomic, so an interruption
 * mid-publish can leave some files updated and others not. What it guarantees is
 * that (a) nothing is published unless the entire candidate collection passed
 * every check, and (b) no single file is ever left half-written — a failed write
 * leaves that file exactly as it was. The CI workflow (owned by PreserveBuild)
 * re-runs preservation + validation against the git baseline before it will
 * commit or push, which is the layer that guards the repository itself.
 *
 * Isolation is by construction: each run gets a fresh unique staging dir and is
 * always seeded from the real tree, never from a previous run's leftovers, so a
 * stranded temp from a crash can never contaminate the next run. The staging dir
 * is removed on success and on failure alike; a foreign temp is never touched.
 */
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { DATA_DIR, PUBLIC_DIR, ROOT, readJson, storeImage, writeFileAtomic, writeJson } from './util.mjs';

export const DATA_FILES = ['meta', 'sources', 'posts', 'themes', 'plugins', 'apps', 'timeline', 'source-status'];
const VALIDATOR = join(ROOT, 'bot', 'validate.mjs');
const STAGE_PREFIX = 'omarchy-ingest-';

/** Preservation the ingest defaults to; imported lazily so tests can inject. */
async function defaultPreserve(before, after, options) {
  const { comparePreservation } = await import('./preservation.mjs');
  return comparePreservation(before, after, options);
}

/**
 * Run `runner(ctx)` inside a staged tree and publish its result only if the
 * whole candidate collection validates and preserves the pre-run records.
 * `ctx` gives the runner staging-bound { dataDir, publicDir, readData, writeData,
 * storeImage } so its writes land in staging, never in the live tree.
 * Returns { published: string[], staging: string }. Throws (publishing nothing)
 * on any envelope/validation/preservation failure.
 */
export async function runStagedIngest(
  runner,
  {
    dataDir = DATA_DIR,
    publicDir = PUBLIC_DIR,
    files = DATA_FILES,
    validator = VALIDATOR,
    preserve = defaultPreserve,
    keepStaging = false,
  } = {},
) {
  const staging = mkdtempSync(join(tmpdir(), STAGE_PREFIX));
  const stageData = join(staging, 'data');
  const stagePublic = join(staging, 'public');

  try {
    seedDataDir(dataDir, stageData, files);
    seedPublicDir(publicDir, stagePublic);

    const before = captureRecords(dataDir, files);

    await runner({
      dataDir: stageData,
      publicDir: stagePublic,
      readData: (name, fallback) => readJson(join(stageData, name), fallback),
      writeData: (name, value) => writeJson(join(stageData, name), value),
      storeImage: (kind, id, sourceUrl) => storeImage(kind, id, sourceUrl, { publicDir: stagePublic }),
    });

    validateStaging(stageData, stagePublic, validator);
    await checkPreservation(before, stageData, files, preserve);

    const published = await publish(stageData, stagePublic, dataDir, publicDir, files);
    return { published, staging };
  } finally {
    if (!keepStaging) {
      try {
        rmSync(staging, { recursive: true, force: true });
      } catch {
        // Best effort: a unique per-run dir under tmp is OS-reaped regardless,
        // and the next run seeds from the real tree, so this cannot contaminate.
      }
    }
  }
}

/** Symlink each existing data file into the staging data dir. */
function seedDataDir(src, dst, files) {
  mkdirSync(dst, { recursive: true });
  for (const name of files) {
    const from = join(src, `${name}.json`);
    if (existsSync(from)) symlinkSync(from, join(dst, `${name}.json`));
  }
}

/**
 * Mirror the public tree into staging: real directories, symlinked files. A
 * later atomic write (temp + rename) replaces a symlink rather than writing
 * through it, so a new/re-encoded asset never mutates the real file it links to.
 */
export function seedPublicDir(src, dst) {
  mkdirSync(dst, { recursive: true });
  if (!existsSync(src)) return;
  for (const entry of readdirSync(src, { withFileTypes: true })) {
    const from = join(src, entry.name);
    const to = join(dst, entry.name);
    if (entry.isDirectory()) seedPublicDir(from, to);
    else symlinkSync(from, to);
  }
}

/** The pre-run records for each array file (null = no baseline to preserve). */
function captureRecords(dataDir, files) {
  const out = {};
  for (const name of files) {
    try {
      const parsed = JSON.parse(readFileSync(join(dataDir, `${name}.json`), 'utf8'));
      out[name] = Array.isArray(parsed) ? parsed : null;
    } catch {
      out[name] = null;
    }
  }
  return out;
}

/** Run the real validator over the staged tree; throw with its report on fail. */
function validateStaging(stageData, stagePublic, validator) {
  const result = spawnSync(process.execPath, [validator], {
    env: { ...process.env, ARCHIVE_DATA_DIR: stageData, ARCHIVE_PUBLIC_DIR: stagePublic },
    encoding: 'utf8',
  });
  if (result.status !== 0) {
    const report = `${result.stdout ?? ''}${result.stderr ?? ''}`.trim();
    throw new Error(`staged candidate failed validation:\n${report}`);
  }
}

/** Refuse a candidate that drops a published id or shrinks a collection. */
async function checkPreservation(before, stageData, files, preserve) {
  for (const name of files) {
    let after;
    try {
      after = JSON.parse(readFileSync(join(stageData, `${name}.json`), 'utf8'));
    } catch {
      continue;
    }
    if (!Array.isArray(after)) continue; // meta.json and friends are not collections
    const result = await preserve(before[name] ?? null, after, { label: name });
    if (result && result.ok === false) {
      throw new Error(`preservation refused ${name}.json: ${result.problem ?? 'a published record went missing'}`);
    }
  }
}

/**
 * Publish the changed staged artifacts into the live tree. Assets first, so a
 * record's image exists before the record file that references it; meta.json
 * last, since nothing references it. Each write is atomic; the walk across files
 * is not, by design (see the file header).
 */
async function publish(stageData, stagePublic, dataDir, publicDir, files) {
  const published = [];

  for (const staged of walkFiles(stagePublic)) {
    if (isSeededLink(staged)) continue; // untouched mirror entry
    const rel = relative(stagePublic, staged);
    const target = join(publicDir, rel);
    if (sameBytes(staged, target)) continue;
    await writeFileAtomic(target, readFileSync(staged));
    published.push(rel.split(sep).join('/'));
  }

  const ordered = [...files.filter((n) => n !== 'meta'), ...files.filter((n) => n === 'meta')];
  for (const name of ordered) {
    const staged = join(stageData, `${name}.json`);
    if (isSeededLink(staged)) continue; // the run never wrote this file
    if (!existsSync(staged)) continue;
    const target = join(dataDir, `${name}.json`);
    if (sameBytes(staged, target)) continue;
    await writeFileAtomic(target, readFileSync(staged));
    published.push(`data/${name}.json`);
  }

  return published;
}

/** A staged path still seeded as a symlink was never written by the run. */
function isSeededLink(path) {
  try {
    return lstatSync(path).isSymbolicLink();
  } catch {
    return true; // absent = nothing to publish
  }
}

function sameBytes(a, b) {
  try {
    return readFileSync(a).equals(readFileSync(b));
  } catch {
    return false;
  }
}

/** Every regular file (recursively) under `dir`, symlinks included. */
function walkFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(path));
    else out.push(path);
  }
  return out;
}
