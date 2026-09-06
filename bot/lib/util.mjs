import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
// ARCHIVE_DATA_DIR lets validate.test.mjs point the validator at a fixture copy.
export const DATA_DIR = process.env.ARCHIVE_DATA_DIR
  ? resolve(process.env.ARCHIVE_DATA_DIR)
  : join(ROOT, 'data');
export const PUBLIC_DIR = join(ROOT, 'public');

/** Kebab-case slug safe for use as a record id and as a URL segment. */
export function slugify(input) {
  return String(input)
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/['’]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

/** Make `slug` unique against `taken`, appending -2, -3, … as needed. */
export function uniqueSlug(slug, taken) {
  if (!taken.has(slug)) return slug;
  for (let n = 2; ; n++) {
    const candidate = `${slug}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export async function readJson(path, fallback) {
  try {
    return JSON.parse(await readFile(path, 'utf8'));
  } catch (error) {
    if (error.code === 'ENOENT' && fallback !== undefined) return fallback;
    throw error;
  }
}

export async function writeJson(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

export async function fetchText(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return response.text();
}

export async function fetchJson(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': UA, accept: 'application/json', ...githubAuth(url) },
  });
  if (!response.ok) {
    const hint =
      response.status === 403 && !process.env.GITHUB_TOKEN
        ? ' (rate limited — set GITHUB_TOKEN to lift the 60/hr anonymous cap)'
        : '';
    throw new Error(`GET ${url} -> ${response.status}${hint}`);
  }
  return response.json();
}

/**
 * Authenticate GitHub API calls when a token is around. In Actions this lifts
 * the rate limit from 60/hr to 5000/hr; locally it is simply absent and the
 * anonymous limit is plenty for one ingest run.
 */
function githubAuth(url) {
  const token = process.env.GITHUB_TOKEN;
  if (!token || !url.startsWith('https://api.github.com/')) return {};
  return { authorization: `Bearer ${token}`, 'x-github-api-version': '2022-11-28' };
}

export async function fetchBuffer(url) {
  const response = await fetch(url, { headers: { 'user-agent': UA } });
  if (!response.ok) throw new Error(`GET ${url} -> ${response.status}`);
  return Buffer.from(await response.arrayBuffer());
}

const UA = 'omarchy-archive-bot (+https://omarchyarchive.com)';

/**
 * Store an image under public/images/<kind>/<id>.webp, re-encoded to the house
 * rules: WebP only, max edge 1200px, quality 80, metadata stripped.
 * Returns the site-absolute path to put in the record.
 */
export async function storeImage(kind, id, sourceUrl) {
  const { default: sharp } = await import('sharp').catch(() => {
    throw new Error('sharp is required to store images: npm install');
  });
  const input = await fetchBuffer(sourceUrl);
  const output = await sharp(input)
    .rotate()
    .resize({ width: 1200, height: 1200, fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80, effort: 5 })
    .toBuffer();
  const relative = `/images/${kind}/${id}.webp`;
  const target = join(PUBLIC_DIR, relative);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, output);
  return { path: relative, bytes: output.length };
}

export function hash(value) {
  return createHash('sha1').update(value).digest('hex').slice(0, 8);
}

export function today() {
  return new Date().toISOString().slice(0, 10);
}

export function nowIso() {
  return `${new Date().toISOString().slice(0, 19)}Z`;
}

/** Normalise a repo/source URL so dedup keys compare equal across variants. */
export function dedupKey(url) {
  if (!url) return null;
  return String(url)
    .trim()
    .toLowerCase()
    .replace(/^http:/, 'https:')
    .replace(/^https:\/\/www\./, 'https://')
    .replace(/\.git$/, '')
    .replace(/\/+$/, '');
}

/** Parse CLI flags: --limit 20 --id foo --id bar --force */
export function parseArgs(argv) {
  const flags = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--')) {
      flags._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }
    i++;
    if (key in flags) {
      flags[key] = [].concat(flags[key], next);
    } else {
      flags[key] = next;
    }
  }
  return flags;
}

export function asList(value) {
  if (value === undefined) return [];
  return [].concat(value);
}
