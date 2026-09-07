/**
 * precommit.mjs is the gate the scraper has to clear before it may commit, and
 * every case here is a failure that actually reached main. Run: npm test
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DATA_DIR, ROOT } from './lib/util.mjs';

const PRECOMMIT = join(ROOT, 'bot', 'precommit.mjs');
const FILES = ['meta', 'sources', 'posts', 'themes', 'plugins', 'apps', 'timeline'];
const real = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf8'))]),
);
const temps = [];

/**
 * Write the real data with `mutate` applied into a fixture dir, then run the
 * gate over it. The comparison is against the repo's real HEAD, which is what
 * makes "lost records" measurable.
 */
function run(mutate = () => {}, { raw } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inspo-precommit-'));
  temps.push(dir);
  const data = structuredClone(real);
  mutate(data);
  for (const name of FILES) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(data[name], null, 2));
  }
  // For the sentinel cases: whatever string the scraper actually wrote.
  if (raw !== undefined) writeFileSync(join(dir, 'posts.json'), raw);

  const result = spawnSync(process.execPath, [PRECOMMIT], {
    env: { ...process.env, ARCHIVE_DATA_DIR: dir },
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

after(() => {
  for (const dir of temps) spawnSync('rm', ['-rf', dir]);
});

describe('precommit.mjs', () => {
  it('passes the committed data', () => {
    const { code } = run();
    assert.equal(code, 0);
  });

  // The second real break, 2026-09-07.
  it('refuses a placeholder written over the file', () => {
    const { code, out } = run(() => {}, { raw: 'PLACEHOLDER_WILL_FAIL' });
    assert.equal(code, 1);
    assert.match(out, /does not parse/);
    assert.match(out, /PLACEHOLDER_WILL_FAIL/);
    assert.match(out, /replaced the file instead of adding/);
  });

  // The first real break, 2026-09-06.
  it('refuses the file path written over the file', () => {
    const { code, out } = run(() => {}, {
      raw: 'file:///workspace/omarchy-archive/data/posts.json',
    });
    assert.equal(code, 1);
    assert.match(out, /does not parse/);
  });

  it('names the file it is complaining about', () => {
    const { out } = run(() => {}, { raw: 'nonsense' });
    assert.match(out, /data\/posts\.json/);
  });

  it('refuses a drop in record count even when the JSON is valid', () => {
    const { code, out } = run((data) => {
      data.posts = data.posts.slice(0, 8);
    });
    assert.equal(code, 1);
    assert.match(out, /lost \d+ records/);
  });

  it('refuses a dropped published id when the count is unchanged', () => {
    const { code, out } = run((data) => {
      data.posts[0] = { ...data.posts[0], id: 'quietly-renamed' };
    });
    assert.equal(code, 1);
    assert.match(out, /dropped published ids/);
  });

  it('refuses an object where an array belongs', () => {
    const { code, out } = run(() => {}, { raw: '{}' });
    assert.equal(code, 1);
    assert.match(out, /expected an array/);
  });

  it('refuses data that passes shape checks but fails the validator', () => {
    const { code, out } = run((data) => {
      data.posts.push({ ...data.posts[0], id: 'duplicate-source-url-record' });
    });
    assert.equal(code, 1);
    assert.match(out, /validate failed/);
  });

  it('accepts an addition and prints a message with the counted number', () => {
    const { code, out } = run((data) => {
      data.posts.push({
        ...data.posts[0],
        id: 'brand-new-desk',
        source_url: 'https://x.com/nobody/status/1234567890',
        image: null,
        image_hosted: false,
        featured: false,
      });
    });
    assert.equal(code, 0);
    assert.match(out, /1 new record/);
  });
});
