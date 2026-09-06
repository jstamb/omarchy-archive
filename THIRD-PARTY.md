# Third-party notices

Omarchy Archive redistributes work by other people. All of it is MIT-licensed,
and MIT requires the copyright notice to travel with the copy — so here it is.

If you own something here and want it removed, open an issue and it goes. No
argument, no negotiation.

---

## JetBrains Mono

The UI typeface for the entire site — the same face omarchy.org sets on its
`body` and never leaves.

- **Copyright:** 2020 The JetBrains Mono Project Authors
- **Source:** https://github.com/JetBrains/JetBrainsMono
- **License:** SIL Open Font License 1.1 — full text at
  [`public/fonts/JETBRAINS-MONO-OFL.txt`](public/fonts/JETBRAINS-MONO-OFL.txt)
- **Files:** `public/fonts/jetbrains-mono-latin.woff2` (the Latin subset,
  variable 400–700, as served by Google Fonts)

## Omarchy Font

The Omarchy wordmark as a typeface. Used for the logo and the section headings,
and baked to outlines for the social card and the ASCII banner in the README.

- **Author:** Mark Cuda
- **Source:** https://github.com/markcuda/Omarchy-Font
- **Version:** 2.1
- **License:** MIT — full text at [`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt)
- **Files:** `public/fonts/omarchy-font.ttf`, and the outlines baked into
  `public/brand/wordmark.svg` and `public/og.png`

The font's own embedded notice reads: *"Free to use, share and modify. Not
affiliated with Omarchy or 37signals."* — which is exactly this site's posture.

## Omarchy

Three things: the mark, the palette, and the content.

- **Copyright:** David Heinemeier Hansson
- **Source:** https://github.com/basecamp/omarchy · https://omarchy.org
- **License:** MIT

**The mark.** `public/brand/omarchy-mark.svg` is Omarchy's own logo, vectorised
from `omarchy.org/assets/images/favicon.png` by `scripts/make-mark.mjs` — the
PNG is a perfectly uniform 15×15 grid, so it traces losslessly. It appears in
the masthead lockup and on the favicon tile.

This site is **not** affiliated with Omarchy. The mark is used to say what the
archive is *about*, the way a card catalogue names its subject. The favicon
places it on a dark tile rather than reproducing omarchy.org's icon byte for
byte, and every page carries the disclaimer.

**The palette.** The Tokyo Night values in `src/styles/global.css` are the same
ones omarchy.org publishes in its `assets/css/root.css`.

**The content.** Theme previews are `public/images/themes/*.webp`, re-encoded
from each theme's `preview.png`. The `palette` / `tone` fields in
`data/themes.json` are parsed from each theme's `colors.toml`. Every install
command the site prints was read from `bin/`.

## Omarchy Hub

Setup screenshots and the record metadata behind most of `data/posts.json`.

- **Copyright:** 2025 DeepakNess
- **Source:** https://github.com/deepakness/omarchy-hub
- **License:** MIT
- **Files:** `public/images/posts/*.webp` (re-encoded from the hub's own WebP),
  and the `title` / `summary` / `device` / `tags` fields on setup records

Each of these records also carries `seen_on: "omarchy-hub"`, which renders as a
credit link on the card and on the detail page.

## Omarchy Plugins

Plugin metadata, preview thumbnails, and — importantly — the exact install
command for every third-party plugin.

- **Source:** https://plugins.omarchy.org/catalog.json
- **Files:** `data/plugins.json`. Thumbnails are **linked, not copied**
  (`image_hosted: false`), so they are served by the marketplace, not by us.

## Original post authors

Every setup on this site links back to the post it came from, and credits the
author by handle. The screenshots belong to the people who took them. They are
here because a community index is useless without them, and because the
Omarchy Hub already published them under MIT.

## Dependencies

Astro (MIT), Pagefind (MIT), sharp (Apache-2.0), and their transitive
dependencies. See `package.json` and `package-lock.json`.
