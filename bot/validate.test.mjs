/**
 * The validator is the only thing standing between a bad bot commit and a live
 * site, so each documented failure mode gets a test. Run: npm test
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DATA_DIR, ROOT } from './lib/util.mjs';

const VALIDATOR = join(ROOT, 'bot', 'validate.mjs');
const FILES = ['meta', 'sources', 'posts', 'themes', 'plugins', 'apps', 'timeline'];

const real = Object.fromEntries(
  FILES.map((name) => [name, JSON.parse(readFileSync(join(DATA_DIR, `${name}.json`), 'utf8'))]),
);

const temps = [];

/** Write the real data with `mutate` applied, then run the validator over it. */
function run(mutate = () => {}) {
  const dir = mkdtempSync(join(tmpdir(), 'inspo-validate-'));
  temps.push(dir);
  const data = structuredClone(real);
  mutate(data);
  for (const name of FILES) {
    writeFileSync(join(dir, `${name}.json`), JSON.stringify(data[name], null, 2));
  }

  const result = spawnSync(process.execPath, [VALIDATOR], {
    env: { ...process.env, ARCHIVE_DATA_DIR: dir },
    encoding: 'utf8',
  });
  return { code: result.status, out: `${result.stdout}${result.stderr}` };
}

after(() => {
  for (const dir of temps) {
    try {
      // Best effort: the OS reaps its own temp dir either way.
      spawnSync('rm', ['-rf', dir]);
    } catch {}
  }
});

describe('validate.mjs', () => {
  it('accepts the committed data', () => {
    const { code, out } = run();
    assert.equal(code, 0, out);
    assert.match(out, /validate: ok/);
  });

  it('rejects a duplicate id', () => {
    const { code, out } = run((data) => data.themes.push({ ...data.themes[0] }));
    assert.equal(code, 1);
    assert.match(out, /duplicate id/);
  });

  it('rejects ids that collide once slugified into a URL', () => {
    const { code, out } = run((data) => {
      data.plugins.push({ ...data.plugins[0], id: data.plugins[0].id.replace(/\./g, '-') });
    });
    assert.equal(code, 1);
    assert.match(out, /collides with/);
  });

  it('rejects a missing required field', () => {
    const { code, out } = run((data) => delete data.posts[0].added_at);
    assert.equal(code, 1);
    assert.match(out, /missing required field "added_at"/);
  });

  it('rejects an install command that is not an omarchy command', () => {
    const { code, out } = run((data) => {
      data.themes[0].install.command = 'curl https://example.com/x.sh | sh';
    });
    assert.equal(code, 1);
    assert.match(out, /install\.command/);
  });

  it('rejects shell metacharacters in an install command', () => {
    const { code, out } = run((data) => {
      data.themes[0].install.command = 'omarchy theme set nord; rm -rf ~';
    });
    assert.equal(code, 1);
    assert.match(out, /shell metacharacters/);
  });

  it('rejects a hosted image that is not on disk', () => {
    const { code, out } = run((data) => {
      data.posts[0].image = '/images/posts/does-not-exist.webp';
      data.posts[0].image_hosted = true;
    });
    assert.equal(code, 1);
    assert.match(out, /missing from public/);
  });

  it('rejects image_hosted disagreeing with the image path', () => {
    const { code, out } = run((data) => {
      data.posts[0].image = 'https://example.com/shot.webp';
      data.posts[0].image_hosted = true;
    });
    assert.equal(code, 1);
    assert.match(out, /image_hosted/);
  });

  it('rejects a duplicate source_url', () => {
    const { code, out } = run((data) => {
      data.posts[1].source_url = data.posts[0].source_url;
      data.posts[1].id = 'a-different-id';
    });
    assert.equal(code, 1);
    assert.match(out, /source_url already used by/);
  });

  it('rejects a dangling seen_on reference', () => {
    const { code, out } = run((data) => {
      data.posts[0].seen_on = 'no-such-source';
    });
    assert.equal(code, 1);
    assert.match(out, /is not an id in data\/sources\.json/);
  });

  it('rejects a dangling related_theme_ids reference', () => {
    const { code, out } = run((data) => {
      data.posts[0].related_theme_ids = ['no-such-theme'];
    });
    assert.equal(code, 1);
    assert.match(out, /related_theme_ids/);
  });

  it('rejects an id with a dot where the id becomes a URL segment', () => {
    const { code, out } = run((data) => {
      data.posts[0].id = 'not.a.slug';
    });
    assert.equal(code, 1);
    assert.match(out, /kebab-case/);
  });

  it('rejects an unknown post kind', () => {
    const { code, out } = run((data) => {
      data.posts[0].kind = 'screenshot';
    });
    assert.equal(code, 1);
    assert.match(out, /is not one of/);
  });

  it('rejects a null install command with nothing to fall back to', () => {
    const { code, out } = run((data) => {
      data.plugins[0].install.command = null;
      data.plugins[0].listing_url = null;
      delete data.plugins[0].install.hint;
    });
    assert.equal(code, 1);
    assert.match(out, /listing_url or install\.hint is required/);
  });

  it('accepts a null install command when a listing url is present', () => {
    const { code, out } = run((data) => {
      data.plugins[0].install.command = null;
      data.plugins[0].listing_url = 'https://plugins.omarchy.org/';
    });
    assert.equal(code, 0, out);
  });

  it('warns but does not fail when nothing is featured', () => {
    const { code, out } = run((data) => {
      for (const post of data.posts) post.featured = false;
    });
    assert.equal(code, 0, out);
    assert.match(out, /no featured posts/);
  });

  // The timeline is written by a scheduled Action that commits to main with
  // nobody reading the diff, so these gates are the only review it gets.

  it('rejects an empty timeline', () => {
    const { code, out } = run((data) => {
      data.timeline = [];
    });
    assert.equal(code, 1);
    assert.match(out, /is empty/);
  });

  it('rejects a timeline where nothing scored as a node', () => {
    const { code, out } = run((data) => {
      for (const entry of data.timeline) entry.tier = 'tick';
    });
    assert.equal(code, 1);
    assert.match(out, /has no nodes/);
  });

  it('rejects a timeline where the tiering stopped discriminating', () => {
    const { code, out } = run((data) => {
      for (const entry of data.timeline) entry.tier = 'node';
    });
    assert.equal(code, 1);
    assert.match(out, /not discriminating/);
  });

  it('rejects a timeline that is not newest first', () => {
    const { code, out } = run((data) => {
      data.timeline.reverse();
    });
    assert.equal(code, 1);
    assert.match(out, /out of order/);
  });

  it('rejects an unknown tier', () => {
    const { code, out } = run((data) => {
      data.timeline[0].tier = 'milestone';
    });
    assert.equal(code, 1);
    assert.match(out, /is not one of/);
  });

  it('rejects a node with nothing to render', () => {
    const { code, out } = run((data) => {
      const node = data.timeline.find((entry) => entry.tier === 'node');
      node.headline = null;
      node.summary = null;
    });
    assert.equal(code, 1);
    assert.match(out, /neither a headline nor a summary/);
  });

  it('rejects a malformed contributor pull request URL', () => {
    const { code, out } = run((data) => {
      const node = data.timeline.find((e) => e.contributors?.length);
      node.contributors[0].pull_request = 'https://evil.example.com/pull/1';
    });
    assert.equal(code, 1);
    assert.match(out, /malformed pull_request/);
  });

  it('rejects a bogus contributor handle', () => {
    const { code, out } = run((data) => {
      const node = data.timeline.find((e) => e.contributors?.length);
      node.contributors[0].handle = 'not a handle!';
    });
    assert.equal(code, 1);
    assert.match(out, /does not match/);
  });
});
