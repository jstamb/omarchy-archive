#!/usr/bin/env node
/**
 * Regenerate the social card and the touch icon from data/meta.json.
 * Run after changing the site name or tagline:  node bot/make-og.mjs
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PUBLIC_DIR, ROOT } from './lib/util.mjs';

const meta = JSON.parse(await readFile(join(ROOT, 'data', 'meta.json'), 'utf8'));

const escape = (text) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// Two lines of tagline, broken on a word near the middle.
const words = meta.tagline.split(' ');
const split = Math.ceil(words.length / 2);
const taglineLines = [words.slice(0, split).join(' '), words.slice(split).join(' ')];

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <defs>
    <radialGradient id="glow" cx="14%" cy="8%" r="85%">
      <stop offset="0%" stop-color="#16241d" />
      <stop offset="100%" stop-color="#0b0d0c" />
    </radialGradient>
  </defs>
  <rect width="1200" height="630" fill="url(#glow)" />
  <rect x="0" y="0" width="1200" height="6" fill="#509475" />

  <g transform="translate(88 132)">
    <path d="M28 0 56 28 28 56 0 28Z" fill="none" stroke="#509475" stroke-width="5" />
    <path d="M28 15 41 28 28 41 15 28Z" fill="#7fc6a2" />
  </g>

  <text x="168" y="176" font-family="Helvetica, Arial, sans-serif" font-size="52" font-weight="700"
        fill="#d8dcd7" letter-spacing="-1.5">${escape(meta.site_name)}</text>

  <text x="88" y="300" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="600"
        fill="#7fc6a2" letter-spacing="-1">${escape(taglineLines[0])}</text>
  <text x="88" y="356" font-family="Helvetica, Arial, sans-serif" font-size="44" font-weight="600"
        fill="#7fc6a2" letter-spacing="-1">${escape(taglineLines[1])}</text>

  <text x="88" y="470" font-family="Menlo, monospace" font-size="24"
        fill="#8b938c">setups · themes · plugins · posts · sources</text>
  <text x="88" y="520" font-family="Menlo, monospace" font-size="21"
        fill="#626a64">${escape(meta.site_url.replace(/^https?:\/\//, ''))} — unofficial community index</text>
</svg>`;

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="180" height="180" viewBox="0 0 64 64">
  <rect width="64" height="64" fill="#0b0d0c" />
  <path d="M32 12 52 32 32 52 12 32Z" fill="none" stroke="#509475" stroke-width="5" />
  <path d="M32 23 41 32 32 41 23 32Z" fill="#7fc6a2" />
</svg>`;

for (const [name, svg] of [
  ['og.png', card],
  ['apple-touch-icon.png', icon],
]) {
  const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
  await writeFile(join(PUBLIC_DIR, name), png);
  console.log(`${name} — ${Math.round(png.length / 1024)}KB`);
}
