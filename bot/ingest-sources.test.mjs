/**
 * End-to-end proof that the real ingest entrypoint is fail-closed. It runs
 * bot/ingest-sources.mjs as a subprocess against a REAL local HTTP server
 * standing in for the plugin catalog (never a live upstream) and a throwaway
 * data/public tree, so we can assert on the published result and, more
 * importantly, on what is left untouched when the upstream is malformed.
 *
 * The valid-addition case reaches preservation, which is PreserveBuild's
 * bot/lib/preservation.mjs; it is skipped until that module exists so this
 * file stays green on its own. The malformed-envelope case throws in the
 * ingest before any staging is validated, so it needs nothing external.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, describe, it } from 'node:test';
import { DATA_DIR, PUBLIC_DIR, ROOT } from './lib/util.mjs';
import { DATA_FILES, seedPublicDir } from './lib/staging.mjs';

const SCRIPT = join(ROOT, 'bot', 'ingest-sources.mjs');
const HAS_PRESERVATION = existsSync(join(ROOT, 'bot', 'lib', 'preservation.mjs'));

const temps = [];
after(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true });
});

function makeBase() {
  const base = mkdtempSync(join(tmpdir(), 'inspo-ingest-base-'));
  temps.push(base);
  const data = join(base, 'data');
  mkdirSync(data, { recursive: true });
  for (const name of DATA_FILES) {
    const src = join(DATA_DIR, `${name}.json`);
    if (existsSync(src)) cpSync(src, join(data, `${name}.json`));
  }
  const pub = join(base, 'public');
  seedPublicDir(PUBLIC_DIR, pub);
  return { base, data, public: pub };
}

async function withCatalog(payload, run) {
  const server = createServer((_req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${server.address().port}/catalog.json`;
  try {
    return await run(url);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

function runIngest(base, catalogUrl) {
  // Async spawn, not spawnSync: the local catalog server runs in THIS process,
  // so blocking the event loop would deadlock the child waiting on its response.
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SCRIPT, 'plugins'], {
      cwd: ROOT,
      env: {
        ...process.env,
        GITHUB_TOKEN: '',
        ARCHIVE_DATA_DIR: base.data,
        ARCHIVE_PUBLIC_DIR: base.public,
        ARCHIVE_PLUGIN_CATALOG: catalogUrl,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => (stdout += chunk));
    child.stderr.on('data', (chunk) => (stderr += chunk));
    child.on('error', reject);
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

const plugins = (base) => JSON.parse(readFileSync(join(base.data, 'plugins.json'), 'utf8'));
const bytes = (base, name) => readFileSync(join(base.data, `${name}.json`), 'utf8');

const NEW_PLUGIN = {
  id: 'com.example.task5-e2e',
  name: 'Task5 E2E Plugin',
  author: 'example',
  description: 'A plugin served by the local test catalog.',
  repo: 'https://github.com/example/task5-e2e',
  sourceType: 'community',
  installAvailable: true,
  installCommand: 'omarchy plugin add https://github.com/example/task5-e2e.git --enable',
  kind: 'Bar',
  category: 'Productivity',
  stars: 7,
  tags: ['bar'],
};

describe('ingest-sources.mjs (fail-closed, real subprocess + local catalog)', () => {
  it(
    'publishes a valid new plugin and keeps every existing record',
    { skip: HAS_PRESERVATION ? false : 'bot/lib/preservation.mjs not present yet' },
    async () => {
      const base = makeBase();
      const before = plugins(base);
      const beforeIds = new Set(before.map((p) => p.id));

      const result = await withCatalog({ plugins: [NEW_PLUGIN] }, (url) => runIngest(base, url));
      assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);

      const after = plugins(base);
      assert.equal(after.length, before.length + 1);
      assert.ok(after.some((p) => p.id === 'com.example.task5-e2e'));
      for (const id of beforeIds) assert.ok(after.some((p) => p.id === id), `lost ${id}`);
      assert.equal(
        after.filter((p) => p.status === 'unavailable').length,
        0,
        'a partial catalog fetch must not mark records unavailable',
      );
      const status = JSON.parse(readFileSync(join(base.data, 'source-status.json'), 'utf8'));
      assert.ok(status['omarchy-plugins']);
      assert.equal(status['omarchy-plugins'].note, 'partial fetch; missing records not marked unavailable');
    },
  );

  it('refuses a malformed catalog envelope and leaves the collection byte-for-byte', async () => {
    const base = makeBase();
    const beforePlugins = bytes(base, 'plugins');
    const beforeMeta = bytes(base, 'meta');

    // `plugins` is a string, not an array: a broken catalog, not zero plugins.
    const result = await withCatalog({ plugins: 'not-an-array' }, (url) => runIngest(base, url));

    assert.notEqual(result.status, 0, 'a malformed envelope must fail the run');
    assert.match(`${result.stdout}${result.stderr}`, /expected an array|plugin catalog/i);
    assert.equal(bytes(base, 'plugins'), beforePlugins, 'plugins.json must be untouched');
    assert.equal(bytes(base, 'meta'), beforeMeta, 'meta.json must be untouched');
  });
});
