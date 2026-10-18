// Prints the deploy footprint: files Cloudflare uploads as static assets
// (dist/ minus .assetsignore entries) and the Worker bundle size.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const dist = join(import.meta.dirname, '..', 'dist');
const ignore = readFileSync(join(dist, '.assetsignore'), 'utf8')
  .split('\n')
  .map((l) => l.trim())
  .filter((l) => l && !l.startsWith('#'));
const ignored = (rel) => ignore.some((p) => rel === p || rel.startsWith(`${p}/`));

let assets = 0;
let skipped = 0;
let worker = 0;
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const rel = relative(dist, full);
    if (statSync(full).isDirectory()) walk(full);
    else if (rel.startsWith('_worker.js/')) worker += statSync(full).size;
    else if (ignored(rel) || rel === '.assetsignore') skipped++;
    else assets++;
  }
})(dist);
const html = readdirSync(dist, { recursive: true }).filter((f) => String(f).endsWith('.html')).length;
console.log(`deploy footprint: ${assets} static asset files (${html} HTML), ${skipped} excluded by .assetsignore, worker bundle ${(worker / 1024).toFixed(0)} KiB`);
