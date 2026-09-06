#!/usr/bin/env node
/**
 * Render text set in the Omarchy Font as half-block ASCII art.
 *
 * The banner in README.md is the real wordmark rasterised, not a figlet face
 * that happens to look blocky — so it stays on-brand for free when the brand
 * moves.
 *
 * Glyph advances and the cap height are all multiples of 50 font units, so
 * rasterising at exactly one pixel per 50 units lands every edge on a pixel
 * boundary and the result is crisp instead of resampled to mush. That is the
 * only sensible size; `unitsPerPixel` exists so you can go 2x (25) if you want
 * a bigger banner.
 *
 * Usage:
 *   node scripts/make-ascii.mjs                    # OMARCHY over ARCHIVE
 *   node scripts/make-ascii.mjs --line "SETUPS"    # one line of anything
 */
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import sharp from 'sharp';
import { ROOT } from '../bot/lib/util.mjs';

// Each output character is one pixel column and two pixel rows.
const BLOCKS = [' ', '▀', '▄', '█'];
const UNITS_PER_PIXEL = 50;

const svgFor = (text) =>
  execFileSync('python3', [join(ROOT, 'scripts', 'text-to-svg.py'), text, '0'], {
    encoding: 'utf8',
  }).replace('currentColor', '#fff');

/** Rasterise one line of outlines onto the font's own pixel grid. */
async function rows(text) {
  const svg = svgFor(text);
  const [, w, h] = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg).map(Number);
  const cols = Math.round(w / UNITS_PER_PIXEL);
  const lines = Math.round(h / UNITS_PER_PIXEL);

  const { data, info } = await sharp(Buffer.from(svg))
    .resize(cols, lines, { fit: 'fill', kernel: 'nearest' })
    .flatten({ background: '#000' })
    .greyscale()
    .raw()
    .toBuffer({ resolveWithObject: true });

  const on = (x, y) => (data[y * info.width + x] ?? 0) > 127;
  const out = [];
  for (let y = 0; y < info.height; y += 2) {
    let line = '';
    for (let x = 0; x < info.width; x++) {
      line += BLOCKS[(on(x, y) ? 1 : 0) | (on(x, y + 1) ? 2 : 0)];
    }
    out.push(line);
  }
  return out;
}

const args = process.argv.slice(2);

if (args[0] === '--line') {
  console.log((await rows(args[1] ?? 'OMARCHY')).join('\n').replace(/ +$/gm, ''));
} else {
  const top = await rows('OMARCHY');
  const bottom = await rows('ARCHIVE');
  const width = Math.max(top[0].length, bottom[0].length);
  const pad = (line) => {
    const left = Math.floor((width - line.length) / 2);
    return ' '.repeat(left) + line;
  };
  const art = [...top.map(pad), '', ...bottom.map(pad)].join('\n').replace(/ +$/gm, '');
  console.log(art);
}
