#!/usr/bin/env node
/**
 * Regenerate the social card and the touch icon.
 *
 * The wordmark comes from public/brand/wordmark.svg — real Omarchy Font
 * outlines, baked to paths by scripts/extract-wordmark.py. Copy comes from
 * data/meta.json. Nothing here depends on a font being installed on the
 * machine doing the rendering, which is the whole point of using outlines.
 *
 * Run after changing the site name, the tagline, or the brand marks:
 *     npm run og
 */
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PUBLIC_DIR, ROOT } from './lib/util.mjs';

const meta = JSON.parse(await readFile(join(ROOT, 'data', 'meta.json'), 'utf8'));

const BG = '#0b0d0c';
const ACCENT = '#509475';
const ACCENT_INK = '#7fc6a2';
const INK = '#d8dcd7';
const DIM = '#8b938c';
const FAINT = '#626a64';

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

// --- wordmark ----------------------------------------------------------------

const wordmarkSvg = await readFile(join(PUBLIC_DIR, 'brand', 'wordmark.svg'), 'utf8');
const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(wordmarkSvg);
if (!viewBox) throw new Error('public/brand/wordmark.svg has no viewBox — rerun extract-wordmark.py');
const [, wmW, wmH] = viewBox.map(Number);
// Just the drawing, so it can be placed inside the card's own coordinate space.
const wordmarkBody = wordmarkSvg
  .replace(/^[\s\S]*?<svg[^>]*>/, '')
  .replace(/<\/svg>\s*$/, '')
  .replace('currentColor', INK);

/** Place the wordmark at a given width, top-left anchored. */
function wordmarkAt(x, y, width) {
  const scale = width / wmW;
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(5)})">${wordmarkBody}</g>`;
}

// --- social card -------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;
const PAD = 84;
const MARK_W = 470;
const markH = (MARK_W / wmW) * wmH;

// Two lines of tagline, broken on a word near the middle.
const words = meta.tagline.split(' ');
const split = Math.ceil(words.length / 2);
const tagline = [words.slice(0, split).join(' '), words.slice(split).join(' ')];

// Lay out top-down against a cursor. Hardcoded offsets are how the tagline
// ended up sitting on top of the meta line the first time.
let y = 78;
const markY = y;
y += markH + 46;
const ruleY = y;
y += 50;
const taglineY = [y, y + 44];

const metaY = [CARD_H - 92, CARD_H - 50];
if (taglineY[1] + 30 > metaY[0]) {
  throw new Error(`og card overflows: tagline ends at ${taglineY[1]}, meta starts at ${metaY[0]}`);
}

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <radialGradient id="glow" cx="12%" cy="0%" r="95%">
      <stop offset="0%" stop-color="#16241d"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#glow)"/>
  <rect width="${CARD_W}" height="7" fill="${ACCENT}"/>

  ${wordmarkAt(PAD, markY, MARK_W)}

  <rect x="${PAD}" y="${ruleY.toFixed(0)}" width="${MARK_W}" height="2" fill="#1f2422"/>

  <text x="${PAD}" y="${taglineY[0].toFixed(0)}" font-family="Helvetica, Arial, sans-serif" font-size="33"
        font-weight="600" fill="${ACCENT_INK}" letter-spacing="-0.6">${escape(tagline[0])}</text>
  <text x="${PAD}" y="${taglineY[1].toFixed(0)}" font-family="Helvetica, Arial, sans-serif" font-size="33"
        font-weight="600" fill="${ACCENT_INK}" letter-spacing="-0.6">${escape(tagline[1])}</text>

  <text x="${PAD}" y="${metaY[0]}" font-family="Menlo, monospace" font-size="23"
        fill="${DIM}">setups &#183; themes &#183; plugins &#183; posts &#183; sources</text>
  <text x="${PAD}" y="${metaY[1]}" font-family="Menlo, monospace" font-size="20"
        fill="${FAINT}">${escape(meta.site_url.replace(/^https?:\/\//, ''))} &#8212; unofficial community index</text>
</svg>`;

const cardPng = await sharp(Buffer.from(card)).png({ compressionLevel: 9 }).toBuffer();
await writeFile(join(PUBLIC_DIR, 'og.png'), cardPng);
console.log(`og.png                 ${CARD_W}x${CARD_H}  ${Math.round(cardPng.length / 1024)}KB`);

// --- touch icon --------------------------------------------------------------

const favicon = await readFile(join(PUBLIC_DIR, 'favicon.svg'));
const iconPng = await sharp(favicon).resize(180, 180).png({ compressionLevel: 9 }).toBuffer();
await writeFile(join(PUBLIC_DIR, 'apple-touch-icon.png'), iconPng);
console.log(`apple-touch-icon.png   180x180   ${Math.round(iconPng.length / 1024)}KB`);
