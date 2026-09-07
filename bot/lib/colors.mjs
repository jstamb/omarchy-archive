/**
 * Theme colour extraction.
 *
 * Omarchy themes have shipped colours in three shapes:
 *
 *   1. `colors.toml`, current format — flat semantic keys (`background`,
 *      `lighter_background`, `foreground`, `accent`, `red` …). What every
 *      bundled theme ships today.
 *   2. `colors.toml`, early community format — `background`, `foreground`,
 *      `accent`, then the ANSI ramp as `color0` … `color15`.
 *   3. `alacritty.toml` only — `[colors.primary]` / `[colors.normal]` /
 *      `[colors.bright]` tables, the pre-colors.toml theme layout.
 *
 * All three are normalised onto the current semantic key set so the site has
 * one vocabulary to map onto its CSS tokens. Only keys the file actually
 * carries are returned: the site fills the gaps itself (a missing
 * `lighter_background` is derived from `background`) rather than the bot
 * inventing a value and publishing it as if upstream said so.
 *
 * Pure: text in, object out.
 */

const HEX = /^(?:#|0x)([0-9a-fA-F]{6})$/;

const ANSI = ['black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white'];

/** The semantic keys the site understands, in the order the schema lists them. */
export const COLOR_KEYS = [
  'accent',
  'selection',
  'muted',
  'background',
  'dark_background',
  'darker_background',
  'lighter_background',
  'foreground',
  'dark_foreground',
  'light_foreground',
  'bright_foreground',
  'red',
  'yellow',
  'orange',
  'green',
  'cyan',
  'blue',
  'magenta',
  'brown',
  'bright_red',
  'bright_yellow',
  'bright_green',
  'bright_cyan',
  'bright_blue',
  'bright_magenta',
];

function normaliseHex(value) {
  const match = HEX.exec(String(value ?? '').trim());
  return match ? `#${match[1].toLowerCase()}` : null;
}

/**
 * A deliberately small TOML reader: `[table]` headers and `key = "value"` /
 * `key = 'value'` lines. Theme colour files contain nothing else worth
 * reading, and a real TOML parser would be the bot's only dependency.
 */
function readPairs(text) {
  const pairs = new Map();
  let table = '';
  for (const raw of text.split('\n')) {
    const line = raw.replace(/#(?![0-9a-fA-F]{6}\b).*$/, '').trim();
    if (!line) continue;
    const header = /^\[([A-Za-z0-9_.-]+)\]$/.exec(line);
    if (header) {
      table = header[1];
      continue;
    }
    const pair = /^([A-Za-z0-9_-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/.exec(line);
    if (!pair) continue;
    const key = table ? `${table}.${pair[1]}` : pair[1];
    pairs.set(key, pair[2] ?? pair[3] ?? '');
  }
  return pairs;
}

/**
 * Parse a theme colour file of any of the three shapes.
 *
 * @returns {{ mode: 'dark' | 'light' | null, colors: Record<string, string> }}
 *   `colors` holds only the semantic keys the file provides, as `#rrggbb`.
 */
export function parseThemeColors(text) {
  const pairs = readPairs(text ?? '');
  const colors = {};
  const put = (key, value) => {
    const hex = normaliseHex(value);
    if (hex && !(key in colors)) colors[key] = hex;
  };

  // 1. Current semantic keys, flat.
  for (const key of COLOR_KEYS) if (pairs.has(key)) put(key, pairs.get(key));

  // 2. ANSI ramp as color0..15 — the early community layout.
  for (let i = 0; i < 8; i += 1) {
    const name = ANSI[i];
    if (name === 'black' || name === 'white') continue;
    if (pairs.has(`color${i}`)) put(name, pairs.get(`color${i}`));
    if (pairs.has(`color${i + 8}`)) put(`bright_${name}`, pairs.get(`color${i + 8}`));
  }

  // 3. alacritty.toml tables.
  put('background', pairs.get('colors.primary.background'));
  put('foreground', pairs.get('colors.primary.foreground'));
  for (const name of ANSI) {
    if (name === 'black' || name === 'white') continue;
    put(name, pairs.get(`colors.normal.${name}`));
    put(`bright_${name}`, pairs.get(`colors.bright.${name}`));
  }
  // Alacritty's bright white is the closest thing the old layout has to a
  // "bright foreground"; its normal black is the sunken background.
  put('bright_foreground', pairs.get('colors.bright.white'));
  put('dark_background', pairs.get('colors.normal.black'));
  put('selection', pairs.get('colors.selection.background') ?? pairs.get('selection_background'));

  // Without an accent, the old layouts used blue as the interface colour.
  if (!colors.accent && colors.blue) colors.accent = colors.blue;

  const declared = pairs.get('mode');
  const mode =
    declared === 'light' || declared === 'dark'
      ? declared
      : colors.background
        ? luminance(colors.background) > 0.5
          ? 'light'
          : 'dark'
        : null;

  return { mode, colors };
}

/** Relative luminance, 0..1, of a `#rrggbb` colour. */
export function luminance(hex) {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/**
 * A swatch a human can read at card size: background, accent, then the hues,
 * then foreground. Duplicates (an accent that is the blue) collapse so the
 * strip never shows the same colour twice in a row.
 */
export function paletteFrom(colors) {
  const order = ['background', 'accent', 'red', 'yellow', 'green', 'cyan', 'blue', 'magenta', 'foreground'];
  return [...new Set(order.map((key) => colors[key]).filter(Boolean))];
}
