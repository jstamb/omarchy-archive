#!/usr/bin/env node
/**
 * Run this instead of committing by hand. It compares the working tree to
 * HEAD, refuses anything that looks like the file was replaced rather than
 * added to, and prints the commit message to use.
 *
 *   node bot/precommit.mjs
 *
 * It exists because prose in AGENTS.md did not hold. Two scrape runs replaced
 * data/posts.json with a single sentinel string - once the file's own path,
 * once `PLACEHOLDER_WILL_FAIL` - and pushed it to main under messages claiming
 * 8 and then 18 new posts, when the true delta both times was zero. Neither
 * run called bot/validate.mjs first. So the rule is now a command that exits
 * non-zero rather than a paragraph asking nicely.
 *
 * Refuses when:
 *   - a data file does not parse, or is not the array/object it was
 *   - a record count went DOWN (data/*.json is append-mostly; a drop is a
 *     clobbered file, not an edit)
 *   - ids that were published have vanished
 *   - validate.mjs fails
 *
 * Says "commit nothing" when the tree is unchanged. An empty run is the
 * expected outcome most of the time and does not need a commit to prove it
 * happened.
 *
 * The parse / array-shape / count / id checks are the shared preservation rule
 * (bot/lib/preservation.mjs), so this local gate, the CI gate (preserve.mjs)
 * and the staged ingest all refuse the same losses in the same words. Only the
 * baseline differs: here it is always HEAD.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { DATA_DIR, ROOT } from './lib/util.mjs';
import { checkFile, countedLabel } from './lib/preservation.mjs';

const FILES = ['posts', 'themes', 'plugins', 'sources', 'apps', 'timeline'];

const git = (...args) => spawnSync('git', args, { cwd: ROOT, encoding: 'utf8' });

const problems = [];
const lines = [];
let changed = 0;

/** The committed text of a data file, or null when it is not in HEAD. */
function headText(name) {
  const result = git('show', `HEAD:data/${name}.json`);
  return result.status === 0 ? result.stdout : null;
}

for (const name of FILES) {
  const raw = (() => {
    try {
      return readFileSync(join(DATA_DIR, `${name}.json`), 'utf8');
    } catch {
      return null;
    }
  })();

  if (raw === null) {
    problems.push(`data/${name}.json is missing`);
    continue;
  }

  // The parse, array-shape, count and id checks live in the shared module, so
  // the CI gate (preserve.mjs) and the staged ingest agree with this one to the
  // byte. The baseline here is HEAD; preserve.mjs passes an explicit ref.
  const result = checkFile(`data/${name}.json`, headText(name), raw);
  if (!result.ok) {
    problems.push(result.problem);
    continue;
  }

  // A new file (delta null) is safe but uncounted, exactly as before: the
  // message counts growth against a known baseline only.
  if (typeof result.delta === 'number' && result.delta > 0) {
    changed += result.delta;
    lines.push(countedLabel(name, result.delta));
  }
}

if (problems.length > 0) {
  for (const problem of problems) console.error(`refused  ${problem}`);
  console.error('\nprecommit: nothing was committed.');
  process.exit(1);
}

const validate = spawnSync(process.execPath, [join(ROOT, 'bot', 'validate.mjs')], {
  cwd: ROOT,
  encoding: 'utf8',
});
process.stdout.write(validate.stdout);
process.stderr.write(validate.stderr);
if (validate.status !== 0) {
  console.error('\nprecommit: validate failed, so nothing was committed.');
  process.exit(1);
}

/*
 * A counted increase settles it. Checking the working tree first would let a
 * clean-looking tree contradict records that demonstrably grew, and the count
 * is the thing the commit message has to be true to.
 *
 * The message is generated from that count, so it cannot claim work the diff
 * does not contain — which is how "add 18 posts from X" got committed on top
 * of a file that never changed by a byte.
 */
if (changed > 0) {
  console.log(`\nprecommit: ok — ${changed} new record(s).`);
  console.log(`\ncommit message to use:\n\n  content: add ${lines.join(', ')}\n`);
  process.exit(0);
}

/*
 * No new records. Images still count as work, since a mirror run can be the
 * only thing that happened.
 */
const dirty = git('status', '--porcelain', '--', 'data', 'public/images').stdout.trim();

if (!dirty) {
  console.log('\nprecommit: tree is clean. Nothing to commit, which is a normal run.');
  process.exit(0);
}

console.log(
  '\nprecommit: ok, but no new records. Commit only if images or existing ' +
    'records changed, and say that — do not claim a count.',
);
