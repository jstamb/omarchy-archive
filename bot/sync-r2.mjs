#!/usr/bin/env node
// Upload only new or changed images to R2; delete removed ones.
//
//   node bot/sync-r2.mjs                 # FROM = sync_state.r2_commit in D1, TO = HEAD
//   node bot/sync-r2.mjs --from SHA      # explicit range
//   node bot/sync-r2.mjs --all           # initial upload of every image (resumable: re-run is safe)
//   flags: --dry-run --local [--env staging] --bucket NAME --changed-out FILE --concurrency N
//
// public/images stays in git as the source of truth; R2 is the serving copy.
// Object keys mirror the repo path (images/posts/x.webp), so records keep their
// relative /images/... value and nothing in data/ changes.
import { execFileSync, spawn } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateSql } from './lib/d1-model.mjs';

const repo = fileURLToPath(new URL('..', import.meta.url));
const TYPES = { webp: 'image/webp', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', svg: 'image/svg+xml', avif: 'image/avif' };

const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

export function changedImages(from, to) {
  const out = { put: [], del: [] };
  for (const line of git('diff', '--name-status', '--no-renames', from, to, '--', 'public/images').split('\n')) {
    if (!line.trim()) continue;
    const [status, path] = line.split('\t');
    (status.startsWith('D') ? out.del : out.put).push(path);
  }
  return out;
}

function parseArgs(argv) {
  const a = { concurrency: 8 };
  for (let i = 0; i < argv.length; i++) {
    const f = argv[i];
    if (f === '--all') a.all = true;
    else if (f === '--dry-run') a.dryRun = true;
    else if (f === '--local') a.local = true;
    else if (f === '--env') a.env = argv[++i];
    else if (f === '--from') a.from = argv[++i];
    else if (f === '--bucket') a.bucket = argv[++i];
    else if (f === '--changed-out') a.changedOut = argv[++i];
    else if (f === '--concurrency') a.concurrency = Number(argv[++i]);
    else throw new Error(`unknown flag ${f}`);
  }
  return a;
}

function wrangler(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npx', ['wrangler', ...args], { cwd: repo, stdio: ['ignore', 'ignore', 'pipe'] });
    let err = '';
    child.stderr.on('data', (d) => (err += d));
    child.on('close', (code) => (code === 0 ? resolve() : reject(new Error(`wrangler ${args[2]} failed: ${err.trim().split('\n').pop()}`))));
  });
}

async function pool(items, n, fn) {
  let i = 0;
  let done = 0;
  await Promise.all(
    Array.from({ length: Math.max(1, n) }, async () => {
      while (i < items.length) {
        const item = items[i++];
        await fn(item);
        if (++done % 100 === 0) console.log(`  ${done}/${items.length}`);
      }
    }),
  );
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Local R2 state is a single SQLite file: parallel writers lock each other out.
  if (args.local) args.concurrency = 1;
  const env = process.env;
  const bucket = args.bucket ?? env.R2_BUCKET ?? (args.env === 'staging' ? 'omarchy-archive-images-staging' : 'omarchy-archive-images');
  const { restExecutor, localExecutor } = await import('./lib/d1-exec.mjs');
  const exec = args.local
    ? await localExecutor({ environment: args.env })
    : restExecutor({ accountId: env.CLOUDFLARE_ACCOUNT_ID, databaseId: env.D1_DATABASE_ID, token: env.CLOUDFLARE_API_TOKEN });
  try {
    const to = git('rev-parse', 'HEAD').trim();
    let plan;
    if (args.all) {
      plan = { put: git('ls-files', 'public/images').split('\n').filter(Boolean), del: [] };
    } else {
      const from = args.from ?? (await exec.query("SELECT v FROM sync_state WHERE k='r2_commit'"))[0]?.v;
      if (!from) {
        console.log('no r2_commit recorded; run with --all once (or --from SHA)');
        process.exitCode = 3;
        return;
      }
      if (from === to) {
        console.log('images up to date');
        return;
      }
      plan = changedImages(from, to);
    }
    console.log(`R2 ${bucket}: ${plan.put.length} to upload, ${plan.del.length} to delete`);
    if (args.dryRun) return;
    const where = args.local ? '--local' : '--remote';
    await pool(plan.put, args.concurrency, async (path) => {
      const key = path.replace(/^public\//, '');
      const type = TYPES[path.split('.').pop().toLowerCase()] ?? 'application/octet-stream';
      if (!existsSync(join(repo, path))) return;
      await wrangler(['r2', 'object', 'put', `${bucket}/${key}`, '--file', join(repo, path), '--content-type', type, where]);
    });
    await pool(plan.del, args.concurrency, async (path) => {
      await wrangler(['r2', 'object', 'delete', `${bucket}/${path.replace(/^public\//, '')}`, where]);
    });
    await exec.run([stateSql('r2_commit', to)]);
    if (args.changedOut) {
      const site = env.SITE_URL ?? 'https://omarchyarchive.com';
      let prev = { tags: [], urls: [] };
      try {
        prev = JSON.parse(readFileSync(args.changedOut, 'utf8'));
      } catch {}
      // Changed or deleted images are cached for 30 days at the edge: purge by URL.
      const urls = args.all ? [] : [...plan.put, ...plan.del].map((p) => new URL(p.replace(/^public/, ''), site).href);
      writeFileSync(args.changedOut, `${JSON.stringify({ ...prev, urls: [...new Set([...(prev.urls ?? []), ...urls])] }, null, 2)}\n`);
    }
    console.log(`R2 sync done at ${to.slice(0, 7)}`);
  } finally {
    await exec.close();
  }
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`sync-r2: ${e.message}`);
    process.exit(1);
  });
}
