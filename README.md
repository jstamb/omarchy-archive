<div align="center">

```
  ▄█████▄    ▄███████████▄    ▄███████   ▄███████   ▄███████   ▄█   █▄    ▄█   █▄
 ███   ███  ███   ███   ███  ███   ███  ███   ███  ███   ███  ███   ███  ███   ███
 ███   ███  ███   ███   ███  ███   ███  ███   ███  ███   █▀   ███   ███  ███   ███
 ███   ███  ███   ███   ███ ▄███▄▄▄███ ▄███▄▄▄██▀  ███       ▄███▄▄▄███▄ ███▄▄▄███
 ███   ███  ███   ███   ███ ▀███▀▀▀███ ▀███▀▀▀▀    ███      ▀▀███▀▀▀███  ▀▀▀▀▀▀███
 ███   ███  ███   ███   ███  ███   ███ ██████████  ███   █▄   ███   ███  ▄██   ███
 ███   ███  ███   ███   ███  ███   ███  ███   ███  ███   ███  ███   ███  ███   ███
  ▀█████▀    ▀█   ███   █▀   ███   █▀   ███   ███  ███████▀   ███   █▀    ▀█████▀

        ▄███████   ▄███████   ▄███████   ▄█   █▄    ▄█   ▄█   █▄    ▄███████
       ███   ███  ███   ███  ███   ███  ███   ███  ███  ███   ███  ███   ███
       ███   ███  ███   ███  ███   █▀   ███   ███  ████ ███   ███  ███   █▀
      ▄███▄▄▄███ ▄███▄▄▄██▀  ███       ▄███▄▄▄███▄ ████ ███   ███ ▄███▄▄▄
      ▀███▀▀▀███ ▀███▀▀▀▀    ███      ▀▀███▀▀▀███  ████ ███   ███▀▀███▀▀▀
       ███   ███ ██████████  ███   █▄   ███   ███  ███  ███   ███  ███   █▄
       ███   ███  ███   ███  ███   ███  ███   ███  ███  ███   ███  ███   ███
       ███   █▀   ███   ███  ███████▀   ███   █▀   █▀    ▀█████▀   █████████
```

**Every Omarchy desk, theme, plugin, and community site — in one place, with the command to install it.**

[**Browse the archive →**](https://omarchyarchive.com) &nbsp;·&nbsp;
[Setups](https://omarchyarchive.com/setups/) &nbsp;·&nbsp;
[Themes](https://omarchyarchive.com/themes/) &nbsp;·&nbsp;
[Plugins](https://omarchyarchive.com/plugins/) &nbsp;·&nbsp;
[Sources](https://omarchyarchive.com/sources/)

`17 setups` &nbsp; `22 bundled themes` &nbsp; `18 extra themes` &nbsp; `23 plugins` &nbsp; `10 community sites`

</div>

---

## You saw a desk you liked. Now what?

That's the gap. Someone posts a gorgeous Omarchy rice, you screenshot it, and
three weeks later you can't remember the theme, the repo, or the handle. The
official catalogs tell you what exists. They don't collect the desks, the
threads, or the write-ups — and they don't tell you which theme is in that
photo.

**Omarchy Archive is the index in between.** Screenshot-first, filterable,
searchable, and every single record carries the exact command to install it.

```bash
omarchy theme set osaka-jade
```

One click to copy. No hunting, no guessing, no `curl | sh` from a stranger.

## What's in it

| | |
|---|---|
| 🖥️ **[Setups](https://omarchyarchive.com/setups/)** | Real workstations running Omarchy — Framework laptops, resurrected 2009 MacBooks, 9.95L SFF builds, ultrawides. Filter by form factor and hardware. Every card links back to the original post. |
| 🎨 **[Themes](https://omarchyarchive.com/themes/)** | All 22 themes Omarchy ships, each with its real palette pulled from the theme's own `colors.toml`, plus a curated cut of community extras. Filter by tone. Copy the command. |
| 🧩 **[Plugins](https://omarchyarchive.com/plugins/)** | A hand-picked slice of the marketplace with install commands copied straight from the official catalog — not a 2,500-entry dump you have to wade through. |
| 🌐 **[Sources](https://omarchyarchive.com/sources/)** | Every other Omarchy site worth knowing, in one directory. A directory of directories. |
| 🔎 **Search** | Full-text across every record. Type `thinkpad`, get the ThinkPad desks. |

## Install it into Omarchy

The archive pins to your launcher like any other app:

```bash
omarchy-webapp-install 'Omarchy Archive' 'https://omarchyarchive.com' 'https://omarchyarchive.com/og.png'
```

Or from the menu: <kbd>Super</kbd> + <kbd>Space</kbd> → Install → Web App.

## Every command is real

This is the part that matters. **No install command on this site was written by
hand.** They are read out of `bin/` in the Omarchy repo or copied verbatim from
the official plugin catalog:

| Thing | Command |
|---|---|
| Bundled theme | `omarchy theme set <slug>` |
| Extra theme | `omarchy theme install <repo>.git` |
| Third-party plugin | `omarchy plugin add <repo>.git --enable` |
| Bundled plugin / bar widget | `omarchy plugin enable <id>` |
| Whole bar | `omarchy bar use <id>` |
| Web app | `omarchy-webapp-install 'Name' 'url' 'icon'` |
| Package | `omarchy pkg add <name>` |

When a command isn't known, the record stores `null` and the page shows the
menu path and links the listing. **A guessed command is worse than no command**,
and the build fails on any command that doesn't start with `omarchy` or that
contains shell metacharacters.

> **Plugins run as unsandboxed code.** This site does not verify security. Read
> the repo before you enable anything.

## What it deliberately isn't

- **Not official.** Unofficial community site. Not affiliated with Omarchy,
  Omacom, or 37signals.
- **Not a replacement.** [omarchy.org/themes](https://omarchy.org/themes/) and
  [plugins.omarchy.org](https://plugins.omarchy.org/) stay canonical. This
  indexes them and links out.
- **Not a mirror.** The marketplace has thousands of plugins. This carries a
  curated cut, on purpose.
- **No accounts, comments, ratings, or tracking.** There is no server.

## Get your setup in

Two ways, both a pull request:

1. **Open an issue** with a link to your post — that's enough.
2. **Add the record yourself.** One JSON object in `data/posts.json`, one WebP
   in `public/images/posts/`. Run `node bot/validate.mjs` and open a PR.

```jsonc
{
  "id": "framework-13-osaka-jade",
  "kind": "setup",
  "title": "Framework 13, Osaka Jade, single ultrawide",
  "summary": "Clean desk, Osaka Jade, btop + nvim tiled.",
  "author": "somehandle",
  "source_platform": "x",
  "source_url": "https://x.com/somehandle/status/123",
  "image": "/images/posts/framework-13-osaka-jade.webp",
  "image_hosted": true,
  "device": "Framework 13",
  "form_factor": "laptop",
  "tags": ["framework-13", "laptop", "ultrawide"],
  "related_theme_ids": ["osaka-jade"],
  "related_plugin_ids": [],
  "added_at": "2026-09-06",
  "featured": false
}
```

That `related_theme_ids` is the whole point: it turns a photo into a theme page
with a copy-paste command.

---

<div align="center">

## For developers

</div>

Humans ship the site. A bot ships the content. Content is files in git.

```bash
git clone https://github.com/jstamb/omarchy-archive
cd omarchy-archive
npm install
npm run dev          # http://localhost:4321
```

```bash
npm run build        # validate -> astro build -> pagefind
npm test             # the validator's rejection gates
npm run check        # astro check
```

Search only works after a build — Pagefind indexes `dist/`. In dev the field
says so instead of spinning.

### How it works

```
data/*.json ──▶ src/lib/content.ts ──▶ pages ──▶ dist/ ──▶ Cloudflare Pages
     ▲                                             │
     └── bot/ingest-sources.mjs                    └── pagefind --site dist
```

- **Static.** No server, no database, no auth, no SSR. 103 pages build in under
  a second.
- **`npm run build` validates first.** `bot/validate.mjs` fails the build on a
  duplicate id, a missing field, a bogus install command, or a hosted image
  that isn't on disk. A broken bot commit never reaches the site.
- **Filters are server-rendered.** Every card ships in the HTML;
  `src/scripts/gallery.ts` hides, sorts, and syncs the URL. No framework.
- **One record, one URL.** A setup is a post with `kind: "setup"`, so `/setups/`
  is a filtered view — there's nothing to keep in sync.

### Layout

```
data/                 the content — meta, sources, posts, themes, plugins, apps
public/images/        committed WebP, {kind}/{id}.webp
public/fonts/         JetBrains Mono (OFL) + Omarchy Font (MIT, Mark Cuda)
public/brand/         the Omarchy mark and wordmark, as vector
src/lib/content.ts    the only module that reads data/; types + derived views
src/components/       Card, Gallery, FilterBar, CommandBox, TagList, Search
src/pages/            index, posts, setups, themes, plugins, sources, install, about
bot/                  ingest, validate, schema, tests   (see bot/README.md)
scripts/              brand marks, ASCII art, linux lockfile
AGENTS.md             the content bot's operating contract
```

### Design

The visual language is lifted from omarchy.org's own tokens, not approximated:

- **Tokyo Night**, the exact values omarchy.org publishes in `root.css`
- **JetBrains Mono** for everything, the same face it sets on `body`
- Uppercase solid buttons, `0.4em` radius, and the same easing curve
- **Omarchy Font** for the logo and `h2` only — a logo cut, not a text face

Every text colour clears **WCAG AA against both surfaces**, page and card.
The lowest tier is 6.00:1; the previous palette's faint grey was 2.61:1 on a
card, which is legible in a screenshot and not on a monitor.

Brand marks are baked to outlines so nothing depends on a font being installed
wherever the images get rendered:

```bash
node scripts/make-mark.mjs            # -> public/brand/omarchy-mark.svg
python3 scripts/extract-wordmark.py   # -> public/brand/wordmark.svg, public/favicon.svg
npm run og                            # -> public/og.png, public/apple-touch-icon.png
node scripts/make-ascii.mjs           # -> the banner at the top of this file
```

### Adding content

```bash
node bot/ingest-sources.mjs setups --limit 10
node bot/validate.mjs
git add data public/images && git commit -m "content: ingest setups" && git push
```

`bot/commit-example.sh` is the whole run. `AGENTS.md` is the contract the bot
follows — scope, allowed sources, the command table, image rules, and the
claims it may not make.

### Deploying

| Setting | Value |
|---|---|
| Framework preset | Astro |
| Build command | `npm run build` |
| Output directory | `dist` |
| Production branch | `main` |
| Node version | 20+ |

Static output means no adapter and no Functions — Pages serves `dist/`
directly. Deployment triggers on **push**, not on commit. The lockfile is
regenerated and `npm ci`-verified on linux/amd64 via
`scripts/fix-lockfile-linux.sh`, because `sharp` records host-specific optional
deps and a passing `npm ci` on macOS proves nothing about Cloudflare.

## Credit

This site is a card catalog. The collection belongs to other people.

- **[Omarchy](https://omarchy.org)** — Omacom, and everyone who sends it patches
- **[Omarchy Hub](https://omarchy.deepakness.com/)** — the setup gallery this
  archive learned from, and the source of most of its screenshots
- **[Omarchy Plugins](https://plugins.omarchy.org/)** — the marketplace and its
  public `catalog.json`
- **[Omarchy Font](https://github.com/markcuda/Omarchy-Font)** — Mark Cuda, the
  wordmark as a real typeface, which is the entire visual identity here
- **Every person who posted a photo of their desk.** Full directory at
  [/sources/](https://omarchyarchive.com/sources/).

Licensing and notices: [LICENSE](LICENSE) · [THIRD-PARTY.md](THIRD-PARTY.md)

<div align="center">
<sub>Community index. Not affiliated with Omarchy or 37signals. Official catalogs stay canonical.</sub>
</div>
