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

// Tokyo Night, the palette omarchy.org ships.
const BG = '#1a1b26';
const ACCENT = '#9ece6a';
const INK = '#c0caf5';
const DIM = '#a9b1d6';
const FAINT = '#9aa5ce';

const escape = (text) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Strip an SVG file down to its drawing, for placing in another coord space. */
const bodyOf = (svg) =>
  svg.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '').trim();

// --- brand marks -------------------------------------------------------------

const wordmarkSvg = await readFile(join(PUBLIC_DIR, 'brand', 'wordmark.svg'), 'utf8');
const viewBox = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(wordmarkSvg);
if (!viewBox) throw new Error('public/brand/wordmark.svg has no viewBox — rerun extract-wordmark.py');
const [, wmW, wmH] = viewBox.map(Number);
const wordmarkBody = bodyOf(wordmarkSvg).replace('currentColor', INK);

const markBody = bodyOf(await readFile(join(PUBLIC_DIR, 'brand', 'omarchy-mark.svg'), 'utf8'));

/** Place the wordmark at a given width, top-left anchored. */
function wordmarkAt(x, y, width) {
  const scale = width / wmW;
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(5)})">${wordmarkBody}</g>`;
}

/** Place the Omarchy mark (a 15x15 grid) at a given size. */
function markAt(x, y, size) {
  const scale = size / 15;
  return `<g transform="translate(${x} ${y}) scale(${scale.toFixed(5)})" fill="${ACCENT}">${markBody}</g>`;
}

// --- social card -------------------------------------------------------------

const CARD_W = 1200;
const CARD_H = 630;
const PAD = 84;
const WORD_W = 470;
const wordH = (WORD_W / wmW) * wmH;
// Mark and wordmark sit side by side as one lockup — stacking them pushed the
// tagline into the meta line, which the assert below caught.
const MARK_SIZE = wordH;
const LOCKUP_GAP = 44;

// Two lines of tagline, broken on a word near the middle.
const words = meta.tagline.split(' ');
const split = Math.ceil(words.length / 2);
const tagline = [words.slice(0, split).join(' '), words.slice(split).join(' ')];

// Lay out top-down against a cursor. Hardcoded offsets are how the tagline
// ended up sitting on top of the meta line the first time.
let y = 96;
const lockupY = y;
y += wordH + 52;
const ruleY = y;
y += 54;
const taglineY = [y, y + 42];

const ruleW = MARK_SIZE + LOCKUP_GAP + WORD_W;
const metaY = [CARD_H - 88, CARD_H - 48];
if (taglineY[1] + 28 > metaY[0]) {
  throw new Error(`og card overflows: tagline ends at ${taglineY[1]}, meta starts at ${metaY[0]}`);
}

const card = `<svg xmlns="http://www.w3.org/2000/svg" width="${CARD_W}" height="${CARD_H}" viewBox="0 0 ${CARD_W} ${CARD_H}">
  <defs>
    <radialGradient id="glow" cx="10%" cy="0%" r="100%">
      <stop offset="0%" stop-color="#24283b"/>
      <stop offset="100%" stop-color="${BG}"/>
    </radialGradient>
  </defs>
  <rect width="${CARD_W}" height="${CARD_H}" fill="url(#glow)"/>
  <rect width="${CARD_W}" height="8" fill="${ACCENT}"/>

  ${markAt(PAD, lockupY, MARK_SIZE)}
  ${wordmarkAt(PAD + MARK_SIZE + LOCKUP_GAP, lockupY, WORD_W)}

  <rect x="${PAD}" y="${ruleY.toFixed(0)}" width="${ruleW.toFixed(0)}" height="2" fill="#414868"/>

  <text x="${PAD}" y="${taglineY[0].toFixed(0)}" font-family="JetBrains Mono, Menlo, monospace"
        font-size="27" font-weight="700" fill="${ACCENT}">${escape(tagline[0])}</text>
  <text x="${PAD}" y="${taglineY[1].toFixed(0)}" font-family="JetBrains Mono, Menlo, monospace"
        font-size="27" font-weight="700" fill="${ACCENT}">${escape(tagline[1])}</text>

  <text x="${PAD}" y="${metaY[0]}" font-family="JetBrains Mono, Menlo, monospace" font-size="22"
        fill="${DIM}">setups &#183; themes &#183; plugins &#183; posts &#183; sources</text>
  <text x="${PAD}" y="${metaY[1]}" font-family="JetBrains Mono, Menlo, monospace" font-size="19"
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
