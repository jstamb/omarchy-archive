/**
 * colors.mjs turns the three colour-file shapes a theme repo can ship into one
 * semantic key set. Each case is a real upstream layout, trimmed.
 * Run: npm test
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { luminance, paletteFrom, parseThemeColors } from './colors.mjs';

describe('parseThemeColors', () => {
  it('reads the current semantic colors.toml', () => {
    const { mode, colors } = parseThemeColors(`
mode = "dark"

accent = "#7aa2f7"
muted = "#414868"
background = "#1a1b26"
lighter_background = "#24283b"
foreground = "#a9b1d6"
bright_foreground = "#C0CAF5"
red = "#f7768e"
blue = "#7aa2f7"
`);
    assert.equal(mode, 'dark');
    assert.equal(colors.background, '#1a1b26');
    assert.equal(colors.lighter_background, '#24283b');
    assert.equal(colors.bright_foreground, '#c0caf5', 'hex is lowercased');
    assert.equal(colors.accent, '#7aa2f7');
    assert.equal(colors.orange, undefined, 'absent keys are absent, not invented');
  });

  it('reads the early community colors.toml with a color0..15 ramp', () => {
    const { mode, colors } = parseThemeColors(`
accent = "#BE3F50"
cursor = "#ff7f41"
foreground = "#14B9B5"
background = "#0e091d"
selection_background = "#14B9B5"

color0 = "#000000"
color1 = "#c8e967"
color2 = "#E20342"
color3 = "#7cd699"
color4 = "#BE3F50"
color5 = "#9147a8"
color6 = "#FF7F41"
color7 = "#A60234"
color9 = "#CE4F48"
color12 = "#04C5F0"
`);
    assert.equal(mode, 'dark', 'no mode key: derived from the background');
    assert.equal(colors.accent, '#be3f50');
    assert.equal(colors.red, '#c8e967');
    assert.equal(colors.green, '#e20342');
    assert.equal(colors.yellow, '#7cd699');
    assert.equal(colors.blue, '#be3f50');
    assert.equal(colors.magenta, '#9147a8');
    assert.equal(colors.cyan, '#ff7f41');
    assert.equal(colors.bright_red, '#ce4f48');
    assert.equal(colors.bright_blue, '#04c5f0');
    assert.equal(colors.selection, '#14b9b5');
    assert.equal(colors.black, undefined, 'black/white are not semantic keys');
  });

  it('reads alacritty.toml tables when that is all a theme ships', () => {
    const { mode, colors } = parseThemeColors(`
[colors]
[colors.primary]
background = '#1a0d2e'
foreground = '#d4a5ff'

[colors.normal]
black   = "#2d1b4e"
red     = "#ff6ec7"
blue    = "#8b9aff"

[colors.bright]
red     = "#ff9adc"
white   = "#fef6ff"

[colors.cursor]
cursor = "#ff6ec7"
`);
    assert.equal(mode, 'dark');
    assert.equal(colors.background, '#1a0d2e');
    assert.equal(colors.foreground, '#d4a5ff');
    assert.equal(colors.red, '#ff6ec7');
    assert.equal(colors.bright_red, '#ff9adc');
    assert.equal(colors.bright_foreground, '#fef6ff');
    assert.equal(colors.dark_background, '#2d1b4e');
    assert.equal(colors.accent, '#8b9aff', 'no accent: blue stands in');
  });

  it('accepts 0x hex and ignores comments and junk', () => {
    const { colors } = parseThemeColors(`
# a comment with #123456 in it
background = "0x101010" # trailing comment
foreground = "not a colour"
weird = 12
`);
    assert.deepEqual(colors, { background: '#101010' });
  });

  it('derives light mode from a pale background', () => {
    assert.equal(parseThemeColors('background = "#fafafa"').mode, 'light');
    assert.equal(parseThemeColors('mode = "dark"\nbackground = "#fafafa"').mode, 'dark', 'declared wins');
    assert.equal(parseThemeColors('accent = "#ff0000"').mode, null);
  });
});

describe('paletteFrom', () => {
  it('orders background, accent, hues, foreground and drops repeats', () => {
    const palette = paletteFrom({
      background: '#000000',
      accent: '#0000ff',
      blue: '#0000ff',
      red: '#ff0000',
      foreground: '#ffffff',
      bright_red: '#ff8888',
    });
    assert.deepEqual(palette, ['#000000', '#0000ff', '#ff0000', '#ffffff']);
  });
});

describe('luminance', () => {
  it('is 0 for black and 1 for white', () => {
    assert.equal(luminance('#000000'), 0);
    assert.equal(luminance('#ffffff'), 1);
  });
});
