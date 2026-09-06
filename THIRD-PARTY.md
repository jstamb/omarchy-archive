# Third-party notices

Omarchy Archive redistributes work by other people. All of it is MIT-licensed,
and MIT requires the copyright notice to travel with the copy — so here it is.

If you own something here and want it removed, open an issue and it goes. No
argument, no negotiation.

---

## Omarchy Font

The Omarchy wordmark as a typeface. Used for the logo, the section headings,
the favicon, the social card, and the ASCII banner in the README.

- **Author:** Mark Cuda
- **Source:** https://github.com/markcuda/Omarchy-Font
- **Version:** 2.1
- **License:** MIT — full text at [`public/fonts/LICENSE.txt`](public/fonts/LICENSE.txt)
- **Files:** `public/fonts/omarchy-font.ttf`, and the outlines baked into
  `public/brand/wordmark.svg`, `public/favicon.svg`, `public/og.png`,
  `public/apple-touch-icon.png`

The font's own embedded notice reads: *"Free to use, share and modify. Not
affiliated with Omarchy or 37signals."* — which is exactly this site's posture.

## Omarchy

Theme preview images and every bundled theme's palette come from the Omarchy
repository. The install commands this site prints were read from its `bin/`.

- **Copyright:** David Heinemeier Hansson
- **Source:** https://github.com/basecamp/omarchy
- **License:** MIT
- **Files:** `public/images/themes/*.webp` (re-encoded from each theme's
  `preview.png`), and the `palette` / `tone` fields in `data/themes.json`
  (parsed from each theme's `colors.toml`)

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
