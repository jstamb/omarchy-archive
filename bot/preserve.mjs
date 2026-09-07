#!/usr/bin/env node
/**
 * Preservation check against an EXPLICIT baseline ref, for CI.
 *
 *   node bot/preserve.mjs --base <ref> [--candidate <ref>]
 *
 * The local gate (precommit.mjs) always compares the working tree to HEAD. That
 * is the wrong baseline for CI:
 *
 *   - On a pull request the checkout is the merge result, so HEAD is that merge
 *     commit and "vs HEAD" compares the candidate to itself and preserves
 *     nothing. The real question is whether merging drops anything the target
 *     branch published, so the base is github.event.pull_request.base.sha and
 *     the candidate is the checked-out merge tree.
 *   - On a push the new records must be measured against what was there before
 *     the push — github.event.before — not the tip that was just landed.
 *
 * So the baseline is passed in, never assumed. A --base that does not resolve is
 * a hard configuration error (exit 2): a workflow wired to the wrong ref must
 * fail loudly, not silently skip the check. The one deliberate exception is
 * git's all-zero sha, which is "no previous commit" on the first push of a
 * branch — a real initial state with nothing yet to preserve.
 *
 * Exit codes: 0 clean, 1 a preservation violation (a published record was
 * dropped — the regression this detects), 2 the check could not run (bad or
 * missing base/candidate). CI treats any non-zero as a failed step; the split
 * only makes a red run legible.
 *
 * This is regression DETECTION. A red run fails the check so the loss is caught
 * in review; it is not by itself a deploy block.
 *
 * ARCHIVE_REPO_DIR points both the git baseline and the on-disk candidate at
 * the same tree; unset (as in CI) it is the checkout root. Tests set it to a
 * throwaway repo.
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, parseArgs } from './lib/util.mjs';
import { PRESERVED_FILES, preserveAll } from './lib/preservation.mjs';

const REPO = process.env.ARCHIVE_REPO_DIR ? resolve(process.env.ARCHIVE_REPO_DIR) : ROOT;
const DATA = join(REPO, 'data');

const git = (...args) => spawnSync('git', args, { cwd: REPO, encoding: 'utf8' });

function die(code, message) {
  console.error(message);
  process.exit(code);
}

const flags = parseArgs(process.argv.slice(2));
const baseRef = typeof flags.base === 'string' ? flags.base : null;
const candidateRef = typeof flags.candidate === 'string' ? flags.candidate : null;

if (!baseRef) {
  die(
    2,
    'preserve: --base <ref> is required. This gate measures the candidate against an ' +
      'explicit baseline — the PR base sha on a pull request, or the push event.before ' +
      'sha on a push. There is no safe baseline to guess, so a missing --base is a ' +
      'configuration error, not a pass.',
  );
}

/** git's all-zero "no previous commit" sha, of any length git reports it in. */
const isZero = (ref) => /^0+$/.test(ref);

/** Resolve a ref to a commit sha, or null when it does not name one. */
function resolveCommit(ref) {
  const result = git('rev-parse', '--verify', '--quiet', `${ref}^{commit}`);
  return result.status === 0 ? result.stdout.trim() : null;
}

/** File text at a committed ref, or null when the path does not exist there. */
function showAt(ref, name) {
  const result = git('show', `${ref}:data/${name}.json`);
  return result.status === 0 ? result.stdout : null;
}

/** Candidate text: from --candidate when given, else the working tree on disk. */
function candidateText(name) {
  if (candidateRef) return showAt(candidateRef, name);
  try {
    return readFileSync(join(DATA, `${name}.json`), 'utf8');
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------- baseline
let baseline;
const initial = isZero(baseRef);
if (initial) {
  baseline = Object.fromEntries(PRESERVED_FILES.map((name) => [name, null]));
} else {
  if (resolveCommit(baseRef) === null) {
    die(
      2,
      `preserve: baseline ref ${JSON.stringify(baseRef)} does not resolve to a commit. ` +
        'Point --base at the ref the candidate should be measured against (the PR base ' +
        'sha, or the push event.before sha). A ref that cannot be resolved fails the run — ' +
        'the check must not silently skip.',
    );
  }
  baseline = Object.fromEntries(PRESERVED_FILES.map((name) => [name, showAt(baseRef, name)]));
}

// ------------------------------------------------------------------ candidate
if (candidateRef !== null && resolveCommit(candidateRef) === null) {
  die(
    2,
    `preserve: candidate ref ${JSON.stringify(candidateRef)} does not resolve to a commit. ` +
      'Drop --candidate to compare against the checked-out tree, or pass a ref that exists.',
  );
}

// -------------------------------------------------------------------- compare
const entries = PRESERVED_FILES.map((name) => ({
  name,
  label: `data/${name}.json`,
  before: baseline[name],
  after: candidateText(name),
}));

const { ok, problems, changed, lines } = preserveAll(entries);

const baseLabel = initial ? 'the initial (empty) state' : `base ${baseRef.slice(0, 12)}`;
const candidateLabel = candidateRef ? `candidate ${candidateRef.slice(0, 12)}` : 'the checked-out tree';

if (initial) {
  console.log(
    'preserve: no previous commit (all-zero base sha) — initial branch state, nothing to ' +
      'preserve yet.',
  );
}

if (!ok) {
  for (const problem of problems) console.error(`refused  ${problem}`);
  console.error(
    `\npreserve: ${candidateLabel} drops published records relative to ${baseLabel}. ` +
      'This is a regression detector — it fails the run so the loss is caught in review, ' +
      'and does not by itself block a deploy.',
  );
  process.exit(1);
}

const summary = changed > 0 ? `${changed} new record(s): ${lines.join(', ')}` : 'no new records';
console.log(
  `preserve: ok — every published id preserved from ${baseLabel} to ${candidateLabel}, ${summary}.`,
);
process.exit(0);
