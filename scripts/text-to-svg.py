#!/usr/bin/env python3
"""
One line of text set in the Omarchy Font, as an SVG of outlines, on stdout.

Used by scripts/make-ascii.mjs for banner art. For the fixed brand marks see
scripts/extract-wordmark.py.

    python3 scripts/text-to-svg.py "OMARCHY ARCHIVE"
"""
import sys
from pathlib import Path

from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

ROOT = Path(__file__).resolve().parent.parent
FONT = ROOT / "public" / "fonts" / "omarchy-font.ttf"


def main():
    text = sys.argv[1] if len(sys.argv) > 1 else "OMARCHY ARCHIVE"
    # Glyph advances are multiples of 50 units. Tracking that is not also a
    # multiple of 50 pushes glyphs onto half-pixel positions, which is what
    # turns the ASCII render to mush — so ASCII art passes --tracking 0.
    tracking = float(sys.argv[2]) if len(sys.argv) > 2 else 20.0

    font = TTFont(FONT)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    cap = font["OS/2"].sCapHeight

    parts, x = [], 0
    for char in text:
        name = cmap.get(ord(char))
        if name is None:
            raise SystemExit(f"font has no glyph for {char!r}")
        pen = SVGPathPen(glyphs)
        glyphs[name].draw(TransformPen(pen, (1, 0, 0, -1, x, cap)))
        if d := pen.getCommands():
            parts.append(d)
        x += glyphs[name].width + tracking
    width = x - tracking

    print(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:.0f} {cap:.0f}" '
        f'width="{width:.0f}" height="{cap:.0f}">'
        f'<path fill="currentColor" d="{" ".join(parts)}"/></svg>'
    )


if __name__ == "__main__":
    main()
