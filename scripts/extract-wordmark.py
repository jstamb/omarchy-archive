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

INK = "#d8dcd7"
ACCENT = "#7fc6a2"
BG = "#0b0d0c"


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

    # --- favicon: the A knocked out of a solid accent tile ---
    # A green outline of a narrow letter turns to mush at 16px. A filled tile
    # with the letter punched out keeps a readable silhouette all the way down,
    # because the shape is carried by the large area, not by thin strokes.
    #
    # "A" for Archive, not "O" for Omarchy: same letterform, but this site is
    # explicitly unofficial and should not wear Omarchy's own initial. It also
    # survives 16px better — the O closes up into a featureless slot.
    mark, mark_w = line_path(font, glyphs, "A")
    box = 64
    inset = 9
    draw = box - inset * 2
    scale = draw / cap
    tx = (box - mark_w * scale) / 2
    ty = (box - cap * scale) / 2 + cap * scale

    favicon = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {box} {box}" \
role="img" aria-label="Omarchy Archive">
  <defs>
    <mask id="o">
      <rect width="{box}" height="{box}" fill="#fff"/>
      <g transform="translate({tx:.2f} {ty:.2f}) scale({scale:.4f})" fill="#000"><path d="{mark}"/></g>
    </mask>
  </defs>
  <rect width="{box}" height="{box}" rx="13" fill="{BG}"/>
  <rect width="{box}" height="{box}" rx="13" fill="{ACCENT}" mask="url(#o)"/>
</svg>
"""
    (ROOT / "public" / "favicon.svg").write_text(favicon)
    print(f"favicon.svg   {box}x{box}  ({len(favicon)} bytes)")


if __name__ == "__main__":
    main()
