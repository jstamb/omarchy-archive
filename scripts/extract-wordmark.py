#!/usr/bin/env python3
"""
Turn text set in the Omarchy Font into SVG outlines.

Why outlines and not a <text> element: the OG card and the favicon are
rasterised by sharp/librsvg and rendered by browsers that have never heard of
this font. Paths render identically everywhere and need nothing installed.

The live site uses the real font via @font-face — this is only for the fixed
brand marks that get baked into images.

Usage (needs fonttools):
    python3 scripts/extract-wordmark.py

Writes:
    public/brand/wordmark.svg   OMARCHY ARCHIVE, two lines — OG card + README art
    public/favicon.svg          the O, for the tab and the touch icon
"""
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "public" / "fonts" / "omarchy-font.ttf"

# Tokyo Night, the palette omarchy.org ships.
INK = "#c0caf5"
ACCENT = "#9ece6a"
BG = "#1a1b26"


def line_path(font, glyphs, text, tracking=0):
    """One line of text as a single SVG path, in font units, baseline at y=0."""
    pen_out = []
    x = 0
    for char in text:
        name = font.getBestCmap().get(ord(char))
        if name is None:
            raise SystemExit(f"font has no glyph for {char!r}")
        pen = SVGPathPen(glyphs)
        # Flip Y: font units go up, SVG goes down.
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, 0)))
        d = pen.getCommands()
        if d:
            pen_out.append(d)
        x += glyphs[name].width + tracking
    return " ".join(pen_out), x - tracking


def main():
    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    upem = font["head"].unitsPerEm
    cap = font["OS/2"].sCapHeight if hasattr(font["OS/2"], "sCapHeight") else 700

    # --- wordmark: OMARCHY over ARCHIVE ---
    # Both lines at the font's own size, centred. No scaling either way:
    # squeezing the shorter line to match width distorts the letterforms, and
    # scaling it up uniformly makes the second line outshout the first. Two
    # lines of equal cap height and honest widths is what a stacked wordmark is.
    top, top_w = line_path(font, glyphs, "OMARCHY", tracking=upem * 0.02)
    bottom, bottom_w = line_path(font, glyphs, "ARCHIVE", tracking=upem * 0.02)

    width = max(top_w, bottom_w)
    gap = cap * 0.34
    height = cap * 2 + gap

    top_x = (width - top_w) / 2
    bottom_x = (width - bottom_w) / 2
    top_y = cap
    bottom_y = height

    wordmark = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {height:.0f}" \
width="{width:.0f}" height="{height:.0f}" role="img" aria-label="Omarchy Archive">
  <g fill="currentColor">
    <g transform="translate({top_x:.2f} {top_y:.2f})"><path d="{top}"/></g>
    <g transform="translate({bottom_x:.2f} {bottom_y:.2f})"><path d="{bottom}"/></g>
  </g>
</svg>
"""
    out = ROOT / "public" / "brand" / "wordmark.svg"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(wordmark)
    print(f"wordmark.svg  {width:.0f}x{height:.0f}  ({len(wordmark)} bytes)")

    # --- favicon: the official Omarchy mark on our own tile ---
    # The mark itself is Omarchy's, vectorised by scripts/make-mark.mjs. It sits
    # on a dark rounded tile rather than being reproduced bare, so the tab icon
    # is recognisably Omarchy-family without being byte-identical to
    # omarchy.org's own favicon — this site says "unofficial" on every page and
    # the icon should not undercut that.
    mark_svg = (ROOT / "public" / "brand" / "omarchy-mark.svg").read_text()
    inner = mark_svg.split(">", 1)[1].rsplit("</svg>", 1)[0].strip()

    box = 64
    inset = 8
    scale = (box - inset * 2) / 15  # the mark is a 15x15 grid

    favicon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box} {box}" \
role="img" aria-label="Omarchy Archive">
  <rect width="{box}" height="{box}" rx="12" fill="{BG}"/>
  <g transform="translate({inset} {inset}) scale({scale:.4f})" fill="{ACCENT}">{inner}</g>
</svg>
"""
    (ROOT / "public" / "favicon.svg").write_text(favicon)
    print(f"favicon.svg   {box}x{box}  ({len(favicon)} bytes)")


if __name__ == "__main__":
    main()
