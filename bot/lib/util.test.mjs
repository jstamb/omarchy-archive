/**
 * util.mjs owns the two primitives the fail-closed ingest is built on:
 *   - writeJson / writeFileAtomic: a write either fully lands or leaves the old
 *     file exactly as it was — never a truncated a half-written record file.
 *   - requireArray: a malformed upstream envelope is an error, not an empty
 *     "success" that would let a broken catalog quietly erase the collection.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import {
  existsSync,
  lstatSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { requireArray, writeFileAtomic, writeJson } from './util.mjs';

const temps = [];
function scratch() {
  const dir = mkdtempSync(join(tmpdir(), 'inspo-util-'));
  temps.push(dir);
  return dir;
}
const tmpLeftovers = (dir) => readdirSync(dir).filter((name) => name.endsWith('.tmp'));

after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

describe('writeJson / writeFileAtomic', () => {
  it('writes pretty JSON with a trailing newline and creates parent dirs', async () => {
    const dir = scratch();
    const path = join(dir, 'nested', 'deep', 'themes.json');
    await writeJson(path, [{ id: 'nord' }]);
    const text = readFileSync(path, 'utf8');
    assert.equal(text, `${JSON.stringify([{ id: 'nord' }], null, 2)}\n`);
  });

  it('replaces an existing file and leaves no temp file behind', async () => {
    const dir = scratch();
    const path = join(dir, 'plugins.json');
    await writeJson(path, [{ id: 'a' }]);
    await writeJson(path, [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), [{ id: 'a' }, { id: 'b' }]);
    assert.deepEqual(tmpLeftovers(dir), [], 'atomic rename must not leave a .tmp file');
  });

  it('replaces a symlink with a real file without writing through to its target', async () => {
    // Staging seeds the tree with symlinks to the real files; an atomic write
    // must break the link (rename over it), never follow it and corrupt the
    // real image/record it points at.
    const dir = scratch();
    const target = join(dir, 'real.json');
    const link = join(dir, 'link.json');
    writeFileSync(target, '"ORIGINAL"');
    symlinkSync(target, link);

    await writeFileAtomic(link, '"REPLACED"');

    assert.equal(readFileSync(link, 'utf8'), '"REPLACED"');
    assert.equal(readFileSync(target, 'utf8'), '"ORIGINAL"', 'symlink target must be untouched');
    assert.equal(lstatSync(link).isSymbolicLink(), false, 'link path is now a real file');
  });

  it('leaves the old file complete when serialization fails', async () => {
    const dir = scratch();
    const path = join(dir, 'posts.json');
    await writeJson(path, [{ id: 'keep' }]);
    // A BigInt cannot be serialized: the write must abort before it can clobber
    // the good file, and must not strand a partial temp.
    await assert.rejects(() => writeJson(path, [{ id: 'keep', n: 1n }]));
    assert.deepEqual(JSON.parse(readFileSync(path, 'utf8')), [{ id: 'keep' }]);
    assert.deepEqual(tmpLeftovers(dir), []);
  });

  it('fails and strands nothing when the target directory cannot exist', async () => {
    const dir = scratch();
    const asFile = join(dir, 'blocker');
    writeFileSync(asFile, 'i am a file, not a directory');
    // Parent path is a regular file, so mkdir/rename cannot succeed.
    await assert.rejects(() => writeJson(join(asFile, 'child.json'), [{ id: 'x' }]));
    assert.equal(readFileSync(asFile, 'utf8'), 'i am a file, not a directory');
    assert.deepEqual(tmpLeftovers(dir), []);
  });
});

describe('requireArray (upstream envelope guard)', () => {
  it('returns the array unchanged when it is one', () => {
    const value = [1, 2, 3];
    assert.equal(requireArray(value, 'catalog'), value);
    assert.deepEqual(requireArray([], 'catalog'), []);
  });

  it('throws a labelled error for every non-array envelope', () => {
    for (const bad of [undefined, null, {}, 'nope', 42, { plugins: [] }]) {
      assert.throws(
        () => requireArray(bad, 'plugin catalog "plugins"'),
        (error) => {
          assert.match(error.message, /plugin catalog "plugins"/);
          assert.match(error.message, /expected an array/i);
          return true;
        },
        `expected a throw for ${JSON.stringify(bad)}`,
      );
    }
  });
});
