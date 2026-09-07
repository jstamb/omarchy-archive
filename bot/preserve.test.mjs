/**
 * preserve.mjs is the CI preservation gate. Unlike precommit.mjs — which always
 * compares the working tree to HEAD — this one takes the baseline as an
 * explicit ref, because the right baseline in CI is not HEAD:
 *
 *   - on a pull request the checkout is the merge result, so HEAD is that merge
 *     commit and "vs HEAD" preserves nothing; the base is the target branch.
 *   - on a push the new records must be measured against event.before, the tip
 *     that was there before the push, not the tip we just landed.
 *
 * Every case here builds a real temporary git repository and runs the CLI over
 * it, because "an id disappeared between two commits" is only measurable
 * against real git objects. Run: npm test
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { ROOT } from './lib/util.mjs';

const PRESERVE = join(ROOT, 'bot', 'preserve.mjs');
const ZERO_SHA = '0000000000000000000000000000000000000000';
const temps = [];

const GIT_ENV = {
  GIT_AUTHOR_NAME: 'test',
  GIT_AUTHOR_EMAIL: 'test@example.com',
  GIT_COMMITTER_NAME: 'test',
  GIT_COMMITTER_EMAIL: 'test@example.com',
};

function git(dir, ...args) {
  return spawnSync('git', args, { cwd: dir, encoding: 'utf8', env: { ...process.env, ...GIT_ENV } });
}

/** Write a candidate/committed state to <dir>/data. Values may be arrays (JSON) or a raw string. */
function writeData(dir, state) {
  mkdirSync(join(dir, 'data'), { recursive: true });
  for (const [name, value] of Object.entries(state)) {
    const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    writeFileSync(join(dir, 'data', `${name}.json`), text);
  }
}

function initRepo() {
  const dir = mkdtempSync(join(tmpdir(), 'inspo-preserve-'));
  temps.push(dir);
  assert.equal(git(dir, 'init', '-q').status, 0, 'git init failed');
  return dir;
}

/** Commit a state and return its sha. */
function commit(dir, state, message = 'state') {
  writeData(dir, state);
  assert.equal(git(dir, 'add', '-A').status, 0, 'git add failed');
  const done = git(dir, '-c', 'commit.gpgsign=false', 'commit', '-q', '-m', message);
  assert.equal(done.status, 0, `git commit failed: ${done.stdout}${done.stderr}`);
  return git(dir, 'rev-parse', 'HEAD').stdout.trim();
}

/** Run the CLI with the temp repo as its working tree. */
function preserve(dir, ...args) {
  const result = spawnSync(process.execPath, [PRESERVE, ...args], {
    cwd: dir,
    encoding: 'utf8',
    env: { ...process.env, ...GIT_ENV, ARCHIVE_REPO_DIR: dir },
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

const posts = (...ids) => ids.map((id) => ({ id, title: id }));

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('preserve.mjs', () => {
  it('passes an addition and reports the counted delta', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    writeData(dir, { posts: posts('a', 'b', 'c', 'd') });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 0);
    assert.match(out, /ok/);
    assert.match(out, /1 new record/);
  });

  it('passes when nothing changed', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 0);
    assert.match(out, /ok/);
  });

  it('refuses a dropped published id even when the count is unchanged', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    writeData(dir, { posts: posts('a', 'b', 'renamed') });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /dropped published ids/);
    assert.match(out, /\bc\b/);
    assert.match(out, /data\/posts\.json/);
  });

  it('refuses a drop in record count', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    writeData(dir, { posts: posts('a', 'b') });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /lost 1 record/);
  });

  it('refuses a candidate file that does not parse, showing what it now holds', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    writeData(dir, { posts: 'PLACEHOLDER_WILL_FAIL' });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /does not parse/);
    assert.match(out, /PLACEHOLDER_WILL_FAIL/);
  });

  it('refuses an object where an array belongs', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    writeData(dir, { posts: '{}' });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /expected an array/);
  });

  it('refuses deleting a published file outright', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    rmSync(join(dir, 'data', 'posts.json'));
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /data\/posts\.json/);
    assert.match(out, /missing|deleted|cannot be deleted/);
  });

  // The reason this CLI exists. The candidate keeps the SAME count as the base
  // but renames a published id — the exact loss a count check cannot see and an
  // id check can. HEAD already carries the rename, so a vs-HEAD comparison (what
  // the local gate does) passes the same candidate. A test that only goes green
  // when --base is honored proves the baseline is not ignored the way precommit
  // ignores its args.
  it('honors an explicit base that differs from HEAD', () => {
    const dir = initRepo();
    const base = commit(dir, { posts: posts('a', 'b', 'c') }, 'base with c');
    commit(dir, { posts: posts('a', 'b', 'renamed') }, 'head renames c');

    const vsBase = preserve(dir, '--base', base);
    assert.equal(vsBase.code, 1, 'vs the older base the renamed id must fail');
    assert.match(vsBase.out, /dropped published ids/);
    assert.match(vsBase.out, /\bc\b/);

    const vsHead = preserve(dir, '--base', 'HEAD');
    assert.equal(vsHead.code, 0, 'the same candidate is clean against HEAD');
    assert.match(vsHead.out, /ok/);
  });

  it('reads the candidate from a ref when --candidate is given', () => {
    const dir = initRepo();
    const base = commit(dir, { posts: posts('a', 'b', 'c') }, 'base');
    const grown = commit(dir, { posts: posts('a', 'b', 'c', 'e') }, 'candidate grows');
    // Leave a clobbered working tree behind to prove the ref, not the disk, is read.
    writeData(dir, { posts: 'GARBAGE' });
    const { code, out } = preserve(dir, '--base', base, '--candidate', grown);
    assert.equal(code, 0);
    assert.match(out, /1 new record/);
  });

  it('refuses a dropped id detected between two refs', () => {
    const dir = initRepo();
    const base = commit(dir, { posts: posts('a', 'b', 'c') }, 'base');
    const shrunk = commit(dir, { posts: posts('a', 'b') }, 'candidate shrinks');
    const { code, out } = preserve(dir, '--base', base, '--candidate', shrunk);
    assert.equal(code, 1);
    assert.match(out, /lost 1 record|dropped published ids/);
  });

  // These three assert a specific exit code (2 = "cannot run the check", distinct
  // from a preservation violation) AND a distinctive message, AND that the output
  // is NOT a bare module-load failure. Without the last two guards a missing
  // preserve.mjs would satisfy a loose "nonzero exit" check — and Node's own
  // ERR_MODULE_NOT_FOUND stack even prints the path node:internal/modules/esm/resolve,
  // which a naive /resolve/ regex matches. So the check would pass while proving
  // nothing. Lock all three down.
  it('rejects a missing --base as a configuration error, not a pass', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    const { code, out } = preserve(dir);
    assert.equal(code, 2);
    assert.match(out, /--base\b.*required/);
    assert.doesNotMatch(out, /Cannot find module/);
  });

  it('rejects an unresolvable baseline ref instead of skipping the check', () => {
    const dir = initRepo();
    commit(dir, { posts: posts('a', 'b', 'c') });
    const { code, out } = preserve(dir, '--base', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef');
    assert.equal(code, 2);
    assert.match(out, /does not resolve to a commit/);
    assert.doesNotMatch(out, /Cannot find module/);
  });

  it('rejects an unresolvable --candidate ref', () => {
    const dir = initRepo();
    const base = commit(dir, { posts: posts('a', 'b', 'c') });
    const { code, out } = preserve(dir, '--base', base, '--candidate', 'no-such-ref');
    assert.equal(code, 2);
    assert.match(out, /candidate\b.*does not resolve to a commit/);
    assert.doesNotMatch(out, /Cannot find module/);
  });

  // The one baseline that means "nothing came before": git's all-zero sha on the
  // first push of a branch. That is a real initial state, not a broken ref.
  it('treats the all-zero base sha as an initial state and passes', () => {
    const dir = initRepo();
    writeData(dir, { posts: posts('a', 'b', 'c') });
    const { code, out } = preserve(dir, '--base', ZERO_SHA);
    assert.equal(code, 0);
    assert.match(out, /initial|ok/);
  });

  it('preserves ids in the timeline file the same way it does posts', () => {
    const dir = initRepo();
    commit(dir, {
      posts: posts('a'),
      timeline: [{ id: 'v2.0.0' }, { id: 'v1.0.0' }],
    });
    writeData(dir, {
      posts: posts('a'),
      timeline: [{ id: 'v2.0.0' }, { id: 'v1.0.1-typo' }],
    });
    const { code, out } = preserve(dir, '--base', 'HEAD');
    assert.equal(code, 1);
    assert.match(out, /dropped published ids/);
    assert.match(out, /data\/timeline\.json/);
  });
});
