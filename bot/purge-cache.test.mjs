import assert from 'node:assert/strict';
import { test } from 'node:test';
import { MAX_CALLS, purge } from './purge-cache.mjs';

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

test('purge over the call cap purges everything in one call', async () => {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push(JSON.parse(init.body));
    return new Response(JSON.stringify({ success: true }));
  };
  const tags = Array.from({ length: 30 * MAX_CALLS + 1 }, (_, i) => `post:${i}`);
  const n = await purge({ tags }, { zoneId: 'z', token: 't', fetchImpl, log: () => {} });
  assert.equal(n, 1);
  assert.deepEqual(calls, [{ purge_everything: true }]);
});

test('purge retries a rate-limited call, then fails on other errors', async () => {
  const replies = [
    new Response(JSON.stringify({ success: false, errors: [{ message: 'Unable to purge, rate limit reached.' }] }), { status: 429 }),
    new Response(JSON.stringify({ success: true })),
    new Response(JSON.stringify({ success: false, errors: [{ message: 'Authentication error' }] }), { status: 403 }),
  ];
  const waits = [];
  const opts = { zoneId: 'z', token: 't', fetchImpl: async () => replies.shift(), sleep: async (ms) => waits.push(ms), log: () => {} };
  assert.equal(await purge({ tags: ['a'] }, opts), 2);
  assert.equal(waits.length, 1);
  await assert.rejects(purge({ tags: ['b'] }, opts), /Authentication error/);
  assert.equal(waits.length, 1);
});

test('purge without credentials is a logged no-op', async () => {
  let called = false;
  const n = await purge({ tags: ['a'] }, { fetchImpl: async () => ((called = true), new Response('{}')), log: () => {} });
  assert.equal(n, 0);
  assert.equal(called, false);
});
