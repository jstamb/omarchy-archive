#!/usr/bin/env node
// Diff-only sync of data/*.json into the D1 read model.
//
//   node bot/sync-d1.mjs                 # normal: FROM = sync_state.commit, TO = HEAD
//   node bot/sync-d1.mjs --seed          # initial load, chunked by budget, resumable
//   node bot/sync-d1.mjs --full          # drift repair: diff every record against D1
//   node bot/sync-d1.mjs --verify        # read-only drift report (exit 4 on drift)
//   flags: --dry-run --local [--persist DIR] [--env staging] --from SHA --to REV
//          --budget N --daily-budget N --force-budget N --changed-out FILE
//
// Writes scale with records changed, never with archive size:
//   1. git diff FROM..TO on data/*.json; no data change -> 0 reads, 0 writes.
//   2. per changed file, hash every record at FROM and TO; only differing ids
//      are candidates.
//   3. candidates are re-checked against the hashes stored in D1 (reads only),
//      so a re-run, or a run after a half-applied batch, writes nothing twice.
//   4. budget guard: estimated rows_written vs per-sync and daily budgets;
//      over budget -> exit 2 before any write.
//   5. statements go out in batches; sync_state.commit is written last.
//
// Exit codes: 0 ok / no-op / seed chunk done, 1 error, 2 budget abort,
// 3 not seeded or seed still in progress, 4 drift found (--verify).
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { creatorSlugMap, slugifyAuthor } from './lib/creators.mjs';
import {
  DEFAULT_COST,
  TABLES,
  describeFile,
  estimateCost,
  lit,
  opStatements,
  pluginSlug,
  stateSql,
} from './lib/d1-model.mjs';

export const DEFAULTS = {
  perSyncBudget: 20_000,
  dailyBudget: 60_000,
  safety: 1.25,
  batchStatements: 100,
  batchBytes: 400_000,
};

const DATA_FILES = new Set(TABLES.map((t) => `data/${t.file}`));

// ---------------------------------------------------------------- git helpers

export function gitSource(repoDir) {
  const git = (...args) =>
    execFileSync('git', args, { cwd: repoDir, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return {
    resolve: (rev) => git('rev-parse', '--verify', `${rev}^{commit}`).trim(),
    changedFiles: (from, to) =>
      git('diff', '--name-only', from, to, '--', 'data/')
        .split('\n')
        .filter((f) => DATA_FILES.has(f)),
    load(rev, file) {
      try {
        return JSON.parse(git('show', `${rev}:data/${file}`));
      } catch (error) {
        if (/does not exist|exists on disk, but not in|bad revision|invalid object/.test(String(error.stderr ?? error.message)))
          return [];
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------- D1 helpers

async function readState(exec) {
  const rows = await exec.query('SELECT k, v FROM sync_state');
  const state = Object.fromEntries(rows.map((r) => [r.k, r.v]));
  const json = (k, fallback) => {
    try {
      return state[k] ? JSON.parse(state[k]) : fallback;
    } catch {
      return fallback;
    }
  };
  return {
    commit: state.commit ?? null,
    seed: json('seed', null),
    ledger: json('ledger', null),
    costModel: json('cost_model', {}),
  };
}

function chunk(list, size) {
  const out = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/** D1 rows for the given ids (or the whole table when ids is null). Reads only. */
async function readStored(exec, spec, ids, withDoc) {
  const cols = `id, hash, thash${withDoc ? ', doc' : ''}`;
  const out = new Map();
  if (ids === null) {
    for (const r of await exec.query(`SELECT ${cols} FROM ${spec.table}`)) out.set(r.id, r);
    return out;
  }
  for (const part of chunk([...ids], 100)) {
    const rows = await exec.query(`SELECT ${cols} FROM ${spec.table} WHERE id IN (${part.map(lit).join(',')})`);
    for (const r of rows) out.set(r.id, r);
  }
  return out;
}

export async function usedTodayFromAnalytics({ accountId, databaseId, token, now = new Date(), fetchImpl = fetch }) {
  if (!accountId || !databaseId || !token) return null;
  const date = now.toISOString().slice(0, 10);
  const query = `query($a:String!,$d:String!,$date:Date!){viewer{accounts(filter:{accountTag:$a}){d1AnalyticsAdaptiveGroups(limit:10000,filter:{databaseId:$d,date_geq:$date}){sum{rowsWritten}}}}}`;
  try {
    const res = await fetchImpl('https://api.cloudflare.com/client/v4/graphql', {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({ query, variables: { a: accountId, d: databaseId, date } }),
    });
    const body = await res.json();
    const groups = body?.data?.viewer?.accounts?.[0]?.d1AnalyticsAdaptiveGroups;
    if (!Array.isArray(groups)) return null;
    return groups.reduce((sum, g) => sum + (g.sum?.rowsWritten ?? 0), 0);
  } catch {
    return null;
  }
}

// ---------------------------------------------------------------- planning

function costModelWithSafety(model, safety) {
  const out = { ...DEFAULT_COST };
  for (const [k, v] of Object.entries(model ?? {})) if (typeof v?.avg === 'number') out[k] = v.avg * safety;
  return out;
}

/** Build the op list: only records whose hash differs from D1. */
async function planOps({ exec, src, toSha, fromSha, full }) {
  const toData = {};
  const ops = [];
  let candidatesTotal = 0;
  const changedFiles = full ? TABLES.map((t) => `data/${t.file}`) : src.changedFiles(fromSha, toSha);
  for (const spec of TABLES) {
    toData[spec.table] = src.load(toSha, spec.file);
  }
  for (const spec of TABLES) {
    if (!changedFiles.includes(`data/${spec.file}`)) continue;
    const toMap = describeFile(spec, toData[spec.table]);
    let candidates;
    let stored;
    if (full) {
      stored = await readStored(exec, spec, null, false);
      candidates = new Set([...toMap.keys(), ...stored.keys()]);
    } else {
      const fromMap = describeFile(spec, src.load(fromSha, spec.file));
      candidates = new Set();
      for (const [id, rec] of toMap) if (fromMap.get(id)?.hash !== rec.hash) candidates.add(id);
      for (const id of fromMap.keys()) if (!toMap.has(id)) candidates.add(id);
      stored = await readStored(exec, spec, candidates, true);
    }
    candidatesTotal += candidates.size;
    const needDoc = [];
    for (const id of [...candidates].sort()) {
      const rec = toMap.get(id);
      const prev = stored.get(id);
      if (rec && !prev) ops.push({ table: spec.table, type: 'insert', id, rec });
      else if (rec && prev.hash !== rec.hash) {
        const op = { table: spec.table, type: 'update', id, rec, prev };
        ops.push(op);
        if (prev.doc === undefined) needDoc.push(op);
      } else if (!rec && prev) ops.push({ table: spec.table, type: 'delete', id, prev });
    }
    // --full reads hashes only; fetch old docs just for the rows being updated (ref deltas).
    if (needDoc.length && spec.refs) {
      const docs = await readStored(exec, spec, new Set(needDoc.map((o) => o.id)), true);
      for (const op of needDoc) op.prev = docs.get(op.id) ?? op.prev;
    }
  }
  return { ops, toData, changedFiles, candidatesTotal };
}

/** Cache tags the Worker sets on SSR responses; purged after a sync. */
export function purgeTags(ops, toData) {
  if (!ops.length) return [];
  const slugs = creatorSlugMap(toData);
  const creator = (name) => (name?.trim() ? `creator:${slugs[name.trim()] ?? slugifyAuthor(name.trim())}` : null);
  const tags = new Set(['list', 'feed', 'sitemap', 'search']);
  for (const op of ops) {
    const now = op.rec ? JSON.parse(op.rec.doc) : null;
    let before = null;
    try {
      before = op.prev?.doc ? JSON.parse(op.prev.doc) : null;
    } catch {}
    for (const r of [now, before]) {
      if (!r) continue;
      const c = creator(r.author);
      if (c) tags.add(c);
      if (op.table === 'posts') {
        tags.add(`post:${op.id}`);
        for (const id of r.related_plugin_ids ?? []) tags.add(`plugin:${pluginSlug(id)}`);
        for (const id of r.related_theme_ids ?? []) tags.add(`theme:${id}`);
      }
    }
    if (op.table === 'posts') tags.add(`post:${op.id}`);
    if (op.table === 'plugins') tags.add(`plugin:${pluginSlug(op.id)}`);
    if (op.table === 'themes') tags.add(`theme:${op.id}`);
    if (op.table === 'timeline') tags.add('history');
  }
  return [...tags].sort();
}

function packBatches(groups, { batchStatements, batchBytes }) {
  const batches = [];
  let cur = { statements: [], owners: [], bytes: 0 };
  for (const g of groups) {
    const bytes = g.statements.reduce((n, s) => n + s.length + 1, 0);
    if (cur.statements.length && (cur.statements.length + g.statements.length > batchStatements || cur.bytes + bytes > batchBytes)) {
      batches.push(cur);
      cur = { statements: [], owners: [], bytes: 0 };
    }
    for (const s of g.statements) {
      cur.statements.push(s);
      cur.owners.push(g.op);
    }
    cur.bytes += bytes;
  }
  if (cur.statements.length) batches.push(cur);
  return batches;
}

// ---------------------------------------------------------------- main entry

export async function runSync(options) {
  const o = { ...DEFAULTS, ...options };
  const log = o.log ?? ((...a) => console.log(...a));
  const { exec, src } = o;
  const now = o.now ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const state = await readState(exec);
  const toSha = src.resolve(o.to ?? 'HEAD');
  let mode = o.mode ?? 'diff';
  if (mode === 'seed' && state.commit) {
    log(`seed already complete (commit ${state.commit.slice(0, 7)}); running a normal diff sync`);
    mode = 'diff';
  }
  if (mode === 'diff' && !state.commit && !o.from) {
    const status = state.seed ? 'seed-incomplete' : 'not-seeded';
    log(state.seed ? `seed in progress (${JSON.stringify(state.seed)}); run --seed to continue` : 'D1 is not seeded; run --seed');
    return { status, exitCode: 3, written: 0 };
  }
  const full = mode === 'seed' || mode === 'full' || mode === 'verify';
  const fromSha = full ? null : o.from ? src.resolve(o.from) : state.commit;

  if (!full && fromSha === toSha) {
    log(`up to date at ${toSha.slice(0, 7)}: 0 rows written`);
    return { status: 'noop', exitCode: 0, written: 0, from: fromSha, to: toSha, tags: [] };
  }
  if (!full && src.changedFiles(fromSha, toSha).length === 0) {
    log(`no data/*.json change ${fromSha.slice(0, 7)}..${toSha.slice(0, 7)}: 0 rows written`);
    return { status: 'noop', exitCode: 0, written: 0, from: fromSha, to: toSha, tags: [] };
  }

  const { ops, toData, candidatesTotal } = await planOps({ exec, src, toSha, fromSha, full });
  const counts = ops.reduce((acc, op) => ((acc[`${op.table}:${op.type}`] = (acc[`${op.table}:${op.type}`] ?? 0) + 1), acc), {});
  log(`plan ${full ? mode : `${fromSha.slice(0, 7)}..${toSha.slice(0, 7)}`}: ${candidatesTotal} candidate records, ${ops.length} to write ${JSON.stringify(counts)}`);

  if (mode === 'verify') {
    return { status: ops.length ? 'drift' : 'clean', exitCode: ops.length ? 4 : 0, written: 0, ops: counts };
  }

  const model = costModelWithSafety(state.costModel, o.safety);
  const ledgerUsed = state.ledger?.day === today ? state.ledger.used : 0;
  const analyticsUsed = o.usedToday ? await o.usedToday() : null;
  const used = Math.max(ledgerUsed, analyticsUsed ?? 0);
  let perSync = o.perSyncBudget;
  let daily = o.dailyBudget;
  if (o.forceBudget) {
    perSync = o.forceBudget;
    daily = used + o.forceBudget;
    log(`--force-budget ${o.forceBudget}: manual override`);
  }

  let selected = ops;
  const estimateAll = estimateCost(ops, model);
  const tail = 4; // ledger + cost model + seed cursor + commit
  if (mode === 'seed') {
    const room = Math.min(perSync, daily - used) - tail;
    selected = [];
    let cum = 0;
    for (const op of ops) {
      const c = estimateCost([op], model);
      if (cum + c > room) break;
      cum += c;
      selected.push(op);
    }
    if (!selected.length && ops.length) {
      log(`budget: used today ${used}, daily ${daily}; no room for the next seed chunk. Resume after 00:00 UTC.`);
      return { status: 'budget-abort', exitCode: 2, written: 0, estimate: estimateAll, used };
    }
  } else if (estimateAll + tail > perSync || used + estimateAll + tail > daily) {
    log(
      `BUDGET ABORT: estimated ${estimateAll} rows (per-sync budget ${perSync}; used today ${used} of daily ${daily}). Nothing written.`,
    );
    return { status: 'budget-abort', exitCode: 2, written: 0, estimate: estimateAll, used, ops: counts };
  }
  const estimate = estimateCost(selected, model);
  const complete = selected.length === ops.length;
  log(`budget ok: estimate ${estimate} rows; used today ${used}${analyticsUsed !== null ? ' (analytics)' : ' (ledger)'}`);

  const tags = purgeTags(selected, toData);
  if (o.dryRun) {
    log('dry run: nothing written');
    return { status: 'dry-run', exitCode: 0, written: 0, estimate, selected: selected.length, total: ops.length, tags };
  }

  const specByTable = Object.fromEntries(TABLES.map((t) => [t.table, t]));
  const groups = selected.map((op) => ({ op, statements: opStatements(specByTable[op.table], op) }));
  const perOp = new Map();
  let written = 0;
  let read = 0;
  const batches = packBatches(groups, o);
  for (const [i, batch] of batches.entries()) {
    const results = await exec.run(batch.statements);
    results.forEach((r, j) => {
      written += r.rows_written;
      read += r.rows_read;
      const op = batch.owners[j];
      perOp.set(op, (perOp.get(op) ?? 0) + r.rows_written);
    });
    if (batches.length > 5 && (i + 1) % 10 === 0) log(`  batch ${i + 1}/${batches.length}: ${written} rows written so far`);
  }

  // Measured averages refine the estimator (exponential moving average).
  const costModel = { ...state.costModel };
  const sums = {};
  for (const [op, w] of perOp) {
    const k = `${op.table}:${op.type}`;
    sums[k] ??= { n: 0, w: 0 };
    sums[k].n++;
    sums[k].w += w;
  }
  for (const [k, { n, w }] of Object.entries(sums)) {
    const prev = costModel[k];
    const avg = w / n;
    costModel[k] = prev?.avg ? { avg: +(prev.avg * 0.5 + avg * 0.5).toFixed(2), n: prev.n + n } : { avg: +avg.toFixed(2), n };
  }

  const last = selected.at(-1);
  const tailStatements = [stateSql('cost_model', JSON.stringify(costModel))];
  if (mode === 'seed') {
    tailStatements.push(
      stateSql('seed', JSON.stringify({ to: toSha, done: complete, last: last ? `${last.table}:${last.id}` : null, remaining: ops.length - selected.length, at: now.toISOString() })),
    );
  }
  const ledger = { day: today, used: used + written + tailStatements.length + 2 };
  tailStatements.push(stateSql('ledger', JSON.stringify(ledger)));
  if (complete) tailStatements.push(stateSql('commit', toSha)); // always last
  const tailResults = await exec.run(tailStatements);
  for (const r of tailResults) written += r.rows_written;

  const status = mode === 'seed' ? (complete ? 'seed-complete' : 'seed-partial') : 'applied';
  log(
    `${status}: ${selected.length}/${ops.length} records, ${written} rows written (estimate ${estimate}), ${read} rows read; commit ${complete ? toSha.slice(0, 7) : 'unchanged'}`,
  );
  return { status, exitCode: 0, written, read, estimate, selected: selected.length, total: ops.length, ops: counts, measured: sums, tags, to: toSha };
}

// ---------------------------------------------------------------- CLI

function parseArgs(argv) {
  const args = { mode: 'diff' };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    const next = () => argv[++i];
    if (a === '--seed') args.mode = 'seed';
    else if (a === '--full') args.mode = 'full';
    else if (a === '--verify') args.mode = 'verify';
    else if (a === '--dry-run') args.dryRun = true;
    else if (a === '--local') args.local = true;
    else if (a === '--persist') args.persist = next();
    else if (a === '--env') args.env = next();
    else if (a === '--from') args.from = next();
    else if (a === '--to') args.to = next();
    else if (a === '--budget') args.perSyncBudget = Number(next());
    else if (a === '--daily-budget') args.dailyBudget = Number(next());
    else if (a === '--force-budget') args.forceBudget = Number(next());
    else if (a === '--changed-out') args.changedOut = next();
    else throw new Error(`unknown flag ${a}`);
  }
  return args;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const env = process.env;
  const repoDir = fileURLToPath(new URL('..', import.meta.url));
  const { restExecutor, localExecutor } = await import('./lib/d1-exec.mjs');
  const remote = { accountId: env.CLOUDFLARE_ACCOUNT_ID, databaseId: env.D1_DATABASE_ID, token: env.CLOUDFLARE_API_TOKEN };
  const exec = args.local ? await localExecutor({ environment: args.env, persist: args.persist }) : restExecutor(remote);
  try {
    const result = await runSync({
      ...args,
      exec,
      src: gitSource(repoDir),
      perSyncBudget: args.perSyncBudget ?? (Number(env.PER_SYNC_BUDGET) || DEFAULTS.perSyncBudget),
      dailyBudget: args.dailyBudget ?? (Number(env.DAILY_BUDGET) || DEFAULTS.dailyBudget),
      usedToday: args.local ? null : () => usedTodayFromAnalytics(remote),
    });
    if (args.changedOut) writeFileSync(args.changedOut, `${JSON.stringify({ tags: result.tags ?? [], status: result.status, written: result.written }, null, 2)}\n`);
    if (env.GITHUB_STEP_SUMMARY) {
      writeFileSync(env.GITHUB_STEP_SUMMARY, `### D1 sync: ${result.status}\n\nRows written: ${result.written ?? 0}${result.estimate !== undefined ? ` (estimate ${result.estimate})` : ''}\n`, { flag: 'a' });
    }
    process.exitCode = result.exitCode;
  } finally {
    await exec.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((error) => {
    console.error(`sync-d1: ${error.message}`);
    process.exit(1);
  });
}
