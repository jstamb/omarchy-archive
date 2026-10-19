import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { sqliteExecutor } from './lib/d1-exec.mjs';
import { canonicalJSON, describeRecord, opStatements, tableSpec } from './lib/d1-model.mjs';
import { runSync } from './sync-d1.mjs';

const schema = readFileSync(new URL('../migrations/0001_init.sql', import.meta.url), 'utf8');
const quiet = () => {};

/** In-memory "git": revisions are { file: records[] }. */
function fakeSource(revs) {
  return {
    resolve: (rev) => {
      if (!(rev in revs)) throw new Error(`bad revision ${rev}`);
      return rev;
    },
    changedFiles: (a, b) =>
      [...new Set([...Object.keys(revs[a]), ...Object.keys(revs[b])])]
        .filter((f) => JSON.stringify(revs[a][f] ?? []) !== JSON.stringify(revs[b][f] ?? []))
        .map((f) => `data/${f}`),
    load: (rev, file) => structuredClone(revs[rev][file] ?? []),
  };
}

const post = (id, extra = {}) => ({
  id,
  kind: 'setup',
  title: `Title ${id}`,
  summary: `Summary ${id}`,
  author: 'alice',
  source_platform: 'x',
  source_url: `https://x.com/a/status/${id}`,
  tags: ['hyprland'],
  related_theme_ids: [],
  related_plugin_ids: [],
  added_at: '2026-10-01',
  ...extra,
});
const plugin = (id, extra = {}) => ({ id, name: id, author: 'bob', summary: 's', category: 'System', stars: 1, tags: [], added_at: '2026-10-01', ...extra });

function base() {
  return {
    'posts.json': [post('p1'), post('p2'), post('p3', { related_plugin_ids: ['a.b'] })],
    'plugins.json': [plugin('a.b'), plugin('c.d')],
    'themes.json': [],
    'timeline.json': [],
    'sources.json': [{ id: 'x', name: 'X' }],
  };
}

async function seeded(revs, to = 'r1') {
  const exec = await sqliteExecutor(schema);
  const src = fakeSource(revs);
  const r = await runSync({ exec, src, mode: 'seed', to, perSyncBudget: 1e6, dailyBudget: 1e6, log: quiet });
  assert.equal(r.status, 'seed-complete');
  return { exec, src };
}

const count = async (exec, sql) => (await exec.query(sql))[0].n;

test('canonical JSON ignores key order', () => {
  assert.equal(canonicalJSON({ b: 1, a: [{ d: 1, c: 2 }] }), canonicalJSON({ a: [{ c: 2, d: 1 }], b: 1 }));
});

test('volatile plugin fields do not change the hash', () => {
  const spec = tableSpec('plugins');
  assert.equal(describeRecord(spec, plugin('a.b', { stars: 1 }), 0).hash, describeRecord(spec, plugin('a.b', { stars: 999, last_seen_at: 'x' }), 0).hash);
  assert.notEqual(describeRecord(spec, plugin('a.b'), 0).hash, describeRecord(spec, plugin('a.b', { summary: 'new' }), 0).hash);
});

test('non-text post change skips FTS and writes only the ref delta', () => {
  const spec = tableSpec('posts');
  const before = describeRecord(spec, post('p', { related_plugin_ids: ['a'] }), 0);
  const after = describeRecord(spec, post('p', { related_plugin_ids: ['b'] }), 0);
  const sql = opStatements(spec, { type: 'update', rec: after, prev: { hash: before.hash, thash: before.thash, doc: before.doc } });
  assert.equal(sql.filter((s) => s.includes('search')).length, 0);
  assert.equal(sql.filter((s) => s.startsWith('DELETE FROM post_refs')).length, 1);
  assert.equal(sql.filter((s) => s.startsWith('INSERT OR IGNORE INTO post_refs')).length, 1);
});

test('seed loads everything and records the commit', async () => {
  const { exec } = await seeded({ r1: base() });
  assert.equal(await count(exec, 'SELECT count(*) n FROM posts'), 3);
  assert.equal(await count(exec, 'SELECT count(*) n FROM plugins'), 2);
  assert.equal(await count(exec, 'SELECT count(*) n FROM search'), 5);
  assert.equal(await count(exec, 'SELECT count(*) n FROM post_refs'), 1);
  assert.equal((await exec.query("SELECT v FROM sync_state WHERE k='commit'"))[0].v, 'r1');
});

test('diff sync writes only changed rows and re-runs write nothing', async () => {
  const r2 = base();
  r2['posts.json'][1].title = 'Changed';
  r2['posts.json'].push(post('p4'));
  r2['plugins.json'][0].stars = 500; // volatile only: must not be written
  r2['posts.json'] = r2['posts.json'].filter((p) => p.id !== 'p1');
  const { exec, src } = await seeded({ r1: base(), r2 });
  exec.log.length = 0;
  const r = await runSync({ exec, src, to: 'r2', log: quiet });
  assert.equal(r.status, 'applied');
  assert.deepEqual(r.ops, { 'posts:delete': 1, 'posts:insert': 1, 'posts:update': 1 });
  assert.ok(!exec.log.some((s) => s.includes("'a.b'") && s.startsWith('INSERT INTO plugins')));
  assert.ok(r.tags.includes('post:p2') && r.tags.includes('post:p4') && r.tags.includes('post:p1'));
  assert.equal(await count(exec, "SELECT count(*) n FROM search WHERE title = 'Changed'"), 1);
  assert.equal(await count(exec, "SELECT count(*) n FROM search WHERE ref_id = 'p1'"), 0);

  exec.log.length = 0;
  const again = await runSync({ exec, src, to: 'r2', log: quiet });
  assert.equal(again.status, 'noop');
  assert.equal(exec.log.length, 0);

  // Replaying the same range (e.g. after a crash before the cursor moved) writes no records.
  exec.log.length = 0;
  const replay = await runSync({ exec, src, to: 'r2', from: 'r1', log: quiet });
  assert.equal(replay.selected, 0);
  assert.equal(exec.log.length, 0);
});

test('budget guard aborts before any write', async () => {
  const r2 = base();
  for (let i = 0; i < 50; i++) r2['posts.json'].push(post(`n${i}`));
  const { exec, src } = await seeded({ r1: base(), r2 });
  exec.log.length = 0;
  const r = await runSync({ exec, src, to: 'r2', perSyncBudget: 100, log: quiet });
  assert.equal(r.status, 'budget-abort');
  assert.equal(r.exitCode, 2);
  assert.equal(exec.log.length, 0);
  assert.equal((await exec.query("SELECT v FROM sync_state WHERE k='commit'"))[0].v, 'r1');

  const daily = await runSync({ exec, src, to: 'r2', perSyncBudget: 1e6, dailyBudget: 1e6, usedToday: async () => 1e6 - 10, log: quiet });
  assert.equal(daily.status, 'budget-abort');
  assert.equal(exec.log.length, 0);
});

test('seed is chunked by budget and resumes where it stopped', async () => {
  const r1 = base();
  for (let i = 0; i < 40; i++) r1['posts.json'].push(post(`s${String(i).padStart(2, '0')}`));
  const exec = await sqliteExecutor(schema);
  const src = fakeSource({ r1 });
  const statuses = [];
  for (let i = 0; i < 20; i++) {
    const r = await runSync({ exec, src, mode: 'seed', to: 'r1', perSyncBudget: 200, dailyBudget: 1e6, log: quiet });
    statuses.push(r.status);
    if (r.status === 'seed-complete') break;
  }
  assert.ok(statuses.length > 1, 'needed more than one chunk');
  assert.equal(statuses.at(-1), 'seed-complete');
  assert.ok(statuses.slice(0, -1).every((s) => s === 'seed-partial'));
  assert.equal(await count(exec, 'SELECT count(*) n FROM posts'), 43);
  // A normal sync is refused while a seed is unfinished, and works after.
  const after = await runSync({ exec, src, to: 'r1', log: quiet });
  assert.equal(after.status, 'noop');
});

test('normal sync refuses an unseeded database', async () => {
  const exec = await sqliteExecutor(schema);
  const r = await runSync({ exec, src: fakeSource({ r1: base() }), to: 'r1', log: quiet });
  assert.equal(r.exitCode, 3);
});

test('verify reports drift without writing', async () => {
  const { exec, src } = await seeded({ r1: base() });
  exec.db.exec("UPDATE posts SET hash='x' WHERE id='p2'");
  exec.log.length = 0;
  const r = await runSync({ exec, src, mode: 'verify', to: 'r1', log: quiet });
  assert.equal(r.status, 'drift');
  assert.equal(exec.log.length, 0);
  const fix = await runSync({ exec, src, mode: 'full', to: 'r1', log: quiet });
  assert.deepEqual(fix.ops, { 'posts:update': 1 });
});
