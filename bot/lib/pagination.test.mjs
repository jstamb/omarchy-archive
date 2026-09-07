/**
 * The timeline ingest walks GitHub's paginated release API. The old loop
 * trusted a page-size heuristic and a hard `page <= 10` cap: a silent limit
 * that truncates, and no defence against a malformed page or a self-referential
 * cursor. These tests pin the replacement against a REAL local HTTP server that
 * speaks RFC 5988 `Link` headers exactly like GitHub — no mocked fetch.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { after, describe, it } from 'node:test';
import { fetchAllPages, parseLinkHeader } from './pagination.mjs';

/**
 * Start an http server whose handler returns { status?, body, next? }.
 * `next` is a path (e.g. "/items?page=2"); it is emitted as an absolute
 * rel="next" Link header, so fetchAllPages follows the real header we send.
 */
async function withServer(handler, run) {
  const server = createServer((req, res) => {
    const base = `http://${req.headers.host}`;
    const url = new URL(req.url, base);
    const { status = 200, body, next } = handler(url);
    res.writeHead(status, {
      'content-type': 'application/json',
      ...(next ? { link: `<${base}${next}>; rel="next"` } : {}),
    });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    return await run(base);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

const pageOf = (url) => Number(url.searchParams.get('page') ?? '1');

describe('parseLinkHeader', () => {
  it('extracts each rel target from a GitHub-style header', () => {
    const header =
      '<https://api.github.com/x?page=2>; rel="next", ' +
      '<https://api.github.com/x?page=9>; rel="last"';
    const links = parseLinkHeader(header);
    assert.equal(links.next, 'https://api.github.com/x?page=2');
    assert.equal(links.last, 'https://api.github.com/x?page=9');
  });

  it('returns an empty object for a missing or empty header', () => {
    assert.deepEqual(parseLinkHeader(undefined), {});
    assert.deepEqual(parseLinkHeader(''), {});
    assert.deepEqual(parseLinkHeader(null), {});
  });
});

describe('fetchAllPages', () => {
  it('follows rel="next" to the end and concatenates every page in order', async () => {
    await withServer(
      (url) => {
        const page = pageOf(url);
        // Three pages; the third omits rel="next", which is how upstream says stop.
        return { body: [page * 10, page * 10 + 1], next: page < 3 ? `/items?page=${page + 1}` : undefined };
      },
      async (base) => {
        const items = await fetchAllPages(`${base}/items?page=1`, { maxPages: 10 });
        assert.deepEqual(items, [10, 11, 20, 21, 30, 31]);
      },
    );
  });

  it('rejects a malformed page that is not a JSON array', async () => {
    await withServer(
      (url) => (pageOf(url) === 1 ? { body: [1, 2], next: '/p?page=2' } : { body: { error: 'not an array' } }),
      async (base) => {
        await assert.rejects(
          () => fetchAllPages(`${base}/p?page=1`),
          /malformed page|expected a JSON array/i,
        );
      },
    );
  });

  it('refuses a pagination loop instead of spinning forever', async () => {
    await withServer(
      () => ({ body: [1], next: '/loop' }), // every page points back to the same URL
      async (base) => {
        await assert.rejects(() => fetchAllPages(`${base}/loop`), /loop/i);
      },
    );
  });

  it('throws rather than silently truncating past the page ceiling', async () => {
    await withServer(
      (url) => ({ body: [pageOf(url)], next: `/endless?page=${pageOf(url) + 1}` }),
      async (base) => {
        await assert.rejects(
          () => fetchAllPages(`${base}/endless?page=1`, { maxPages: 3 }),
          /exceeded 3 pages|refusing to loop or silently truncate/i,
        );
      },
    );
  });

  it('throws on a non-ok upstream response', async () => {
    await withServer(
      () => ({ status: 502, body: { error: 'bad gateway' } }),
      async (base) => {
        await assert.rejects(() => fetchAllPages(`${base}/boom`), /502/);
      },
    );
  });

  it('never sends the caller auth header to a cross-origin next page', async () => {
    // A rel=next pointing at a DIFFERENT origin (here a second port) must be
    // followed without the token — a compromised upstream must not be able to
    // redirect the credential to a host it controls.
    const authSeenA = [];
    const authSeenB = [];

    const serverB = createServer((req, res) => {
      authSeenB.push(req.headers.authorization);
      res.writeHead(200, { 'content-type': 'application/json' }); // no next -> stop
      res.end(JSON.stringify([2]));
    });
    await new Promise((resolve) => serverB.listen(0, '127.0.0.1', resolve));
    const baseB = `http://127.0.0.1:${serverB.address().port}`;

    const serverA = createServer((req, res) => {
      authSeenA.push(req.headers.authorization);
      res.writeHead(200, { 'content-type': 'application/json', link: `<${baseB}/p2>; rel="next"` });
      res.end(JSON.stringify([1]));
    });
    await new Promise((resolve) => serverA.listen(0, '127.0.0.1', resolve));
    const baseA = `http://127.0.0.1:${serverA.address().port}`;

    try {
      const items = await fetchAllPages(`${baseA}/p1`, {
        headers: { authorization: 'Bearer SECRET', 'user-agent': 'ua' },
      });
      assert.deepEqual(items, [1, 2], 'the cross-origin page is still followed');
      assert.equal(authSeenA[0], 'Bearer SECRET', 'the same-origin page keeps the token');
      assert.equal(authSeenB[0], undefined, 'the cross-origin page must NOT receive the token');
    } finally {
      await new Promise((resolve) => serverA.close(resolve));
      await new Promise((resolve) => serverB.close(resolve));
    }
  });
});
