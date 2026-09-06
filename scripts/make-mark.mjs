#!/usr/bin/env node
/**
 * Vectorise the Omarchy mark from its PNG into a minimal SVG.
 *
 * The official mark (omarchy.org/assets/images/favicon.png) is a 300x300 PNG
 * that is really a 15x15 grid of 20px cells — perfectly uniform, verified cell
 * by cell. So it traces losslessly to a handful of rects, which scales to any
 * size, recolours with `currentColor`, and costs a fraction of the PNG.
 *
 * Run once; the output is committed. Re-run only if the upstream mark changes:
 *   curl -sL https://omarchy.org/assets/images/favicon.png -o /tmp/om-icon.png
 *   node scripts/make-mark.mjs
 */
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import sharp from 'sharp';
import { PUBLIC_DIR } from '../bot/lib/util.mjs';

const SOURCE = process.argv[2] ?? '/tmp/om-icon.png';
const CELLS = 15;

const { data, info } = await sharp(SOURCE).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const cell = info.width / CELLS;
if (!Number.isInteger(cell)) throw new Error(`${info.width}px does not divide into ${CELLS} cells`);

const on = (x, y) => data[(y * info.width + x) * info.channels + 3] > 128;

// Read the grid, and assert each cell really is uniform before trusting it.
const grid = [];
for (let gy = 0; gy < CELLS; gy++) {
  const row = [];
  for (let gx = 0; gx < CELLS; gx++) {
    const v = on(gx * cell + cell / 2, gy * cell + cell / 2);
    for (const [dx, dy] of [[2, 2], [cell - 3, 2], [2, cell - 3], [cell - 3, cell - 3]]) {
      if (on(gx * cell + dx, gy * cell + dy) !== v) {
        throw new Error(`cell ${gx},${gy} is not uniform — the mark is not on a ${CELLS}x${CELLS} grid`);
      }
    }
    row.push(v);
  }
  grid.push(row);
}

// Merge each row's runs into one rect apiece.
const rects = [];
for (let y = 0; y < CELLS; y++) {
  let x = 0;
  while (x < CELLS) {
    if (!grid[y][x]) {
      x++;
      continue;
    }
    let end = x;
    while (end + 1 < CELLS && grid[y][end + 1]) end++;
    rects.push(`<rect x="${x}" y="${y}" width="${end - x + 1}" height="1"/>`);
    x = end + 1;
  }
}

const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CELLS} ${CELLS}" fill="currentColor" role="img" aria-label="Omarchy">
  <g shape-rendering="crispEdges">${rects.join('')}</g>
</svg>
`;

const out = join(PUBLIC_DIR, 'brand', 'omarchy-mark.svg');
await writeFile(out, svg);
console.log(`omarchy-mark.svg  ${CELLS}x${CELLS} grid, ${rects.length} rects, ${svg.length} bytes`);
