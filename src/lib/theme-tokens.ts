/**
 * Turn a theme's semantic colours (the `colors` field on a theme record — the
 * keys Omarchy's colors.toml uses) into the CSS custom properties global.css
 * is built on. Runs in the browser, so no data imports here.
 *
 * Every derived value is a real colour or a `color-mix()` over real colours,
 * never a guess published as upstream's: where a theme omits a tier
 * (`lighter_background`, `muted` …) it is mixed from what the theme does ship.
 */

export type ThemeColors = Record<string, string>;
export type Tone = 'dark' | 'light';
export type Tokens = Record<`--${string}`, string>;

/** Colour-only fields the switcher needs from a theme record. */
export interface CatalogTheme {
  id: string;
  name: string;
  tone: Tone | null;
  bundled: boolean;
  palette: string[];
  colors: ThemeColors;
}

const HEX = /^#[0-9a-f]{6}$/i;

export function luminance(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(n >> 16) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
}

/** WCAG contrast ratio, 1..21. */
export function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

export function toneOf(colors: ThemeColors, declared?: Tone | null): Tone {
  if (declared) return declared;
  return colors.background && luminance(colors.background) > 0.5 ? 'light' : 'dark';
}

const mix = (a: string, pct: number, b: string) => `color-mix(in srgb, ${a} ${pct}%, ${b})`;

/**
 * Map colours onto tokens. Text tiers are chosen for contrast, not by name:
 * a theme whose `foreground` is too faint against its background gets the
 * brighter tier for body text instead of shipping unreadable copy.
 */
export function tokensFor(input: ThemeColors, declared?: Tone | null): Tokens | null {
  const colors: ThemeColors = {};
  for (const [key, value] of Object.entries(input)) if (HEX.test(value)) colors[key] = value.toLowerCase();
  const bg = colors.background;
  if (!bg) return null;
  const tone = toneOf(colors, declared);

  const textTiers = [colors.bright_foreground, colors.foreground, colors.light_foreground].filter(
    (hex): hex is string => Boolean(hex),
  );
  if (textTiers.length === 0) return null;
  const readable = (hex: string) => contrast(hex, bg) >= 4.5;
  const byContrast = [...textTiers].sort((a, b) => contrast(b, bg) - contrast(a, bg));
  const ink = byContrast[0];
  const dim = colors.foreground && readable(colors.foreground) ? colors.foreground : ink;

  const accent = colors.accent ?? colors.blue ?? ink;
  const blue = colors.blue ?? accent;
  const link = tone === 'light' ? blue : (colors.bright_blue ?? blue);
  const highlight = colors.bright_cyan ?? colors.cyan ?? accent;
  const warn = colors.yellow ?? colors.orange ?? accent;
  const line = colors.muted ?? mix(bg, 72, ink);

  return {
    '--bg': bg,
    '--bg-raised': colors.lighter_background ?? mix(bg, 93, ink),
    '--bg-sunken': colors.dark_background ?? mix(bg, 94, tone === 'light' ? ink : '#000000'),
    '--line': line,
    '--line-soft': mix(line, 55, bg),
    '--ink': ink,
    '--ink-dim': dim,
    '--ink-meta': dim,
    '--accent': accent,
    '--accent-sunken': mix(accent, 14, bg),
    '--link': readable(link) ? link : ink,
    '--link-hover': ink,
    '--highlight': highlight,
    '--blue': blue,
    '--warn': warn,
    '--warn-sunken': mix(warn, 14, bg),
  };
}

/** The five pixels that stand for a theme in the masthead: bg, accent, three hues. */
export function pixelsFor(theme: Pick<CatalogTheme, 'palette' | 'colors'>, count = 5): string[] {
  const c = theme.colors;
  const preferred = [c.background, c.accent, c.red, c.green, c.blue, c.yellow, c.magenta, c.foreground];
  const out: string[] = [];
  for (const hex of [...preferred, ...theme.palette]) {
    if (hex && !out.includes(hex)) out.push(hex);
    if (out.length === count) break;
  }
  return out;
}
