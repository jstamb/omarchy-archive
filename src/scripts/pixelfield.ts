/*
 * Pixel field — a quiet grid of Tokyo Night squares growing out of the
 * bottom-right corner, behind everything.
 *
 * Plain canvas 2D on purpose: the effect is a 2D grid of rects, and three.js
 * would be ~150KB of WebGL scaffolding to draw it. This is ~2KB, no deps.
 *
 * Behaviour contract:
 *   - fixed, z-index -1, pointer-events none — never intercepts anything
 *   - dim colours only, so text contrast on the page background is unaffected
 *   - prefers-reduced-motion: one static frame, no animation loop
 *   - hidden tab: loop stops (rAF does this for free)
 *   - grows in over the first ~2.5s of a page view
 */

export {}; // Astro imports this as a module; without an export TS scopes its declarations globally and they collide across scripts.
const CELL = 14; // px, square size
const GAP = 2; // px between squares
const FPS_INTERVAL = 1000 / 30;

// Dim Tokyo Night tiers. Brightest cells get accent/blue, most stay line-soft.
const COLORS = ['#2f3549', '#414868', '#3d5941', '#31436b'];
const BRIGHT = ['#9ece6a', '#7aa2f7'];

interface Cell {
  x: number;
  y: number;
  falloff: number; // 0..1, 1 = bottom-right corner
  phase: number;
  speed: number;
  color: string;
  bright: boolean;
}

function init(): void {
  const canvas = document.querySelector<HTMLCanvasElement>('[data-pixelfield]');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let cells: Cell[] = [];
  let raf = 0;
  let last = 0;
  const born = performance.now();

  // Arrow consts, not hoisted declarations: a `function` here could in
  // principle run before the null guards above, so TS drops the narrowing on
  // `canvas`/`ctx` inside one and every use becomes "possibly null".
  const build = (): void => {
    const dpr = Math.min(devicePixelRatio || 1, 2);
    const w = innerWidth;
    const h = innerHeight;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const step = CELL + GAP;
    const cols = Math.ceil(w / step);
    const rows = Math.ceil(h / step);
    // Reach: how far the field spreads from the corner, in cells.
    const reach = Math.hypot(cols, rows) * 0.55;

    cells = [];
    for (let cy = 0; cy < rows; cy++) {
      for (let cx = 0; cx < cols; cx++) {
        // Distance from the bottom-right corner, in cells.
        const d = Math.hypot(cols - 1 - cx, rows - 1 - cy);
        const falloff = 1 - d / reach;
        if (falloff <= 0) continue;
        // Sparser as it spreads: keep a cell with probability ~falloff².
        if (Math.random() > falloff * falloff * 0.9) continue;
        const bright = Math.random() < 0.06;
        cells.push({
          x: cx * step,
          y: cy * step,
          falloff,
          phase: Math.random() * Math.PI * 2,
          speed: 0.3 + Math.random() * 0.7,
          color: bright
            ? BRIGHT[Math.floor(Math.random() * BRIGHT.length)]
            : COLORS[Math.floor(Math.random() * COLORS.length)],
          bright,
        });
      }
    }
  };

  const draw = (now: number): void => {
    ctx.clearRect(0, 0, innerWidth, innerHeight);
    // Growth ramp: 0 -> 1 over 2.5s, eased.
    const g = reduced ? 1 : Math.min(1, (now - born) / 2500);
    const grow = g * g * (3 - 2 * g);
    const t = now / 1000;
    for (const c of cells) {
      // A cell exists once the growth front (from the corner) has passed it.
      if (c.falloff < (1 - grow) * 0.999) continue;
      const twinkle = reduced ? 0.75 : 0.55 + 0.45 * Math.sin(t * c.speed + c.phase);
      const alpha = c.falloff * twinkle * (c.bright ? 0.35 : 0.55);
      if (alpha < 0.02) continue;
      ctx.globalAlpha = alpha;
      ctx.fillStyle = c.color;
      ctx.fillRect(c.x, c.y, CELL, CELL);
    }
    ctx.globalAlpha = 1;
  };

  const loop = (now: number): void => {
    raf = requestAnimationFrame(loop);
    if (now - last < FPS_INTERVAL) return;
    last = now;
    draw(now);
  };

  build();
  if (reduced) {
    draw(performance.now());
  } else {
    raf = requestAnimationFrame(loop);
  }

  let resizeTimer = 0;
  addEventListener('resize', () => {
    clearTimeout(resizeTimer);
    resizeTimer = window.setTimeout(() => {
      build();
      if (reduced) draw(performance.now());
    }, 150);
  });

  // Belt and braces: stop the loop entirely on hidden tabs (rAF already
  // throttles, this zeroes it).
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      cancelAnimationFrame(raf);
    } else if (!reduced) {
      raf = requestAnimationFrame(loop);
    }
  });
}

init();
