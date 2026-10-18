// D1 executors used by bot/sync-d1.mjs. Each exposes:
//   query(sql)       -> rows            (reads)
//   run(statements)  -> [{rows_written, rows_read}]  (one call = one batch)
//   close()
// Credentials come from the environment only and are never logged.

/** Production / staging: Cloudflare REST API. Needs CLOUDFLARE_API_TOKEN (D1 Edit). */
export function restExecutor({ accountId, databaseId, token, fetchImpl = fetch }) {
  if (!accountId || !databaseId || !token) {
    throw new Error('remote D1 needs CLOUDFLARE_ACCOUNT_ID, D1_DATABASE_ID and CLOUDFLARE_API_TOKEN');
  }
  const url = `https://api.cloudflare.com/client/v4/accounts/${accountId}/d1/database/${databaseId}/query`;
  async function call(sql) {
    for (let attempt = 1; ; attempt++) {
      const res = await fetchImpl(url, {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({ sql }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.ok && body.success !== false) return body.result ?? [];
      const msg = (body.errors ?? []).map((e) => e.message).join('; ') || `HTTP ${res.status}`;
      if (attempt >= 3 || (res.status < 500 && res.status !== 429)) throw new Error(`D1 query failed: ${msg}`);
      await new Promise((r) => setTimeout(r, 1000 * attempt));
    }
  }
  return {
    name: 'remote',
    async query(sql) {
      const [first] = await call(sql);
      return first?.results ?? [];
    },
    async run(statements) {
      const results = await call(statements.join('\n'));
      return results.map((r) => ({ rows_written: r.meta?.rows_written ?? 0, rows_read: r.meta?.rows_read ?? 0 }));
    },
    async close() {},
  };
}

/** Local development: wrangler's platform proxy over the local D1 state (.wrangler/state). */
export async function localExecutor({ environment, persist } = {}) {
  const { getPlatformProxy } = await import('wrangler');
  const proxy = await getPlatformProxy({ environment, persist: persist ? { path: persist } : true });
  const db = proxy.env.DB;
  return {
    name: 'local',
    async query(sql) {
      return (await db.prepare(sql).all()).results;
    },
    async run(statements) {
      const results = await db.batch(statements.map((s) => db.prepare(s)));
      return results.map((r) => ({ rows_written: r.meta?.rows_written ?? 0, rows_read: r.meta?.rows_read ?? 0 }));
    },
    async close() {
      await proxy.dispose();
    },
  };
}

/** Tests: node:sqlite in memory. rows_written approximated by `changes`. */
export async function sqliteExecutor(schemaSql) {
  const { DatabaseSync } = await import('node:sqlite');
  const db = new DatabaseSync(':memory:');
  if (schemaSql) db.exec(schemaSql);
  const log = [];
  return {
    name: 'sqlite',
    db,
    log,
    async query(sql) {
      return db.prepare(sql).all();
    },
    async run(statements) {
      log.push(...statements);
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ rows_written: Number(db.prepare(s).run().changes), rows_read: 0 }));
        db.exec('COMMIT');
        return out;
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
    },
    async close() {
      db.close();
    },
  };
}
