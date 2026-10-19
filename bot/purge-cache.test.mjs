import assert from 'node:assert/strict';
import { test } from 'node:test';
import { purge } from './purge-cache.mjs';

test('purge batches tags and urls, 30 per call', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ success: true }));
  };
  const tags = Array.from({ length: 61 }, (_, i) => `post:${i}`);
  const n = await purge({ tags, urls: ['https://x/images/a.webp'] }, { zoneId: 'z', token: 't', fetchImpl, log: () => {} });
  assert.equal(n, 4);
  assert.deepEqual(calls.map((c) => (c.tags ?? c.files).length), [30, 30, 1, 1]);
});

test('purge without credentials is a logged no-op', async () => {
  let called = false;
  const n = await purge({ tags: ['a'] }, { fetchImpl: async () => ((called = true), new Response('{}')), log: () => {} });
  assert.equal(n, 0);
  assert.equal(called, false);
});
