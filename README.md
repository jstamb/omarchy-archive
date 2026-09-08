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
[Sources](https://omarchyarchive.com/sources/) &nbsp;·&nbsp;
[History](https://omarchyarchive.com/history/)

`112 setups` &nbsp; `168 themes` &nbsp; `2,153 plugins` &nbsp; `64 releases` &nbsp; `10 community sites`

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
| 🖥️ **[Setups](https://omarchyarchive.com/setups/)** | Every workstation in the community showcase — Framework laptops, resurrected 2009 MacBooks, 9.95L SFF builds, ultrawides. Filter by form factor and hardware. Every card links back to the original post. |
| 🎨 **[Themes](https://omarchyarchive.com/themes/)** | All 22 themes Omarchy ships — each with its real palette pulled from the theme's own `colors.toml` — plus all 146 community extras. Filter by tone. Copy the command. |
| 🧩 **[Plugins](https://omarchyarchive.com/plugins/)** | The complete marketplace: 2,153 installable plugins, each with its own page and the command from the official catalog. Browse the most-starred, or open the [full index](https://omarchyarchive.com/plugins/all/). |
| 🕰 **[History](https://omarchyarchive.com/history/)** | Every Omarchy release since v1.1.1, the milestones drawn as a timeline, and the 553 people credited in the notes. |
| 📚 **[Resources](https://omarchyarchive.com/resources/)** | The manual, the cheat sheet, the migration write-ups, and the tools people built around Omarchy. |
| 🌐 **[Sources](https://omarchyarchive.com/sources/)** | Every other Omarchy site worth knowing, in one directory. A directory of directories. |
| 🔎 **Search** | Full-text across every record. Type `thinkpad`, get the ThinkPad desks. |

## Install it into Omarchy

The archive pins to your launcher like any other app. From the menu:

<kbd>Super</kbd> + <kbd>Space</kbd> → Install → Web App → **Archive** → `https://omarchyarchive.com`

Name it **Archive** — short, quick to type, and it sorts to the top of the launcher. Omarchy
asks for a name and URL only; it picks up the icon automatically.

The archive can wear any of its own themes. The picker in the masthead searches
every indexed theme and restyles the site with its colours, in your browser
only. In Chromium-family browsers, "Follow my Omarchy theme" asks for read
access to `~/.local/state/omarchy/current` and then tracks `omarchy theme set`
live, so the web app matches the desktop. Nothing is uploaded.

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
| Web app | Super + Space → Install → Web App |
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
- **Not a rehost.** Every record links out to wherever it came from. Screenshots
  are credited, and come down on request.
- **No accounts, comments, ratings, or tracking.** There is no server.

## Get your setup on the site

This repo is public for exactly one reason: **so you can put your desk in the
archive.** Pull requests are read and merged by hand.

### The easy way

**[Open a setup submission →](https://github.com/jstamb/omarchy-archive/issues/new?template=setup-submission.yml)**

Paste a link to your post, answer four short questions, done. No git, no JSON.

### The direct way

Add the record yourself and open a pull request. You do **not** need to run the
site — CI validates every PR and tells you if something is off.

1. Add one object to [`data/posts.json`](data/posts.json).
2. Add your screenshot to `public/images/posts/` as `<id>.webp` — WebP, max
   1200px on the long edge, under 400KB.
3. Open the PR.

```jsonc
{
  "id": "framework-13-osaka-jade",        // kebab-case, unique, permanent
  "kind": "setup",
  "title": "Framework 13, Osaka Jade, single ultrawide",
  "summary": "Clean desk, Osaka Jade, btop + nvim tiled.",
  "author": "somehandle",                 // your handle, no @
  "author_url": "https://x.com/somehandle",
  "source_platform": "x",                 // x | reddit | github | youtube | mastodon | web
  "source_url": "https://x.com/somehandle/status/123",
  "image": "/images/posts/framework-13-osaka-jade.webp",
  "image_hosted": true,
  "device": "Framework 13",
  "form_factor": "laptop",                // desktop | laptop | tablet | handheld | server
  "tags": ["framework-13", "laptop", "ultrawide"],
  "related_theme_ids": ["osaka-jade"],    // <- the good part
  "related_plugin_ids": [],
  "created_at": null,
  "added_at": "2026-09-06",
  "featured": false
}
```

**`related_theme_ids` is the whole point.** Naming the theme you're running
turns your photo into a link on that theme's page, right next to the one
command that reproduces it. That is what this archive does that a gallery
doesn't — so if you know what you're running, say so.

Full field reference: [`bot/schema.json`](bot/schema.json).

### What gets merged

- It runs Omarchy, and the screenshot is yours to share.
- There's a real link back to the original post.
- CI is green — no duplicate id, no missing field, image present and under the
  size cap.

### What doesn't

- Someone else's photo without credit.
- An install command written from memory. Commands are copied from the official
  CLI or the marketplace catalog, or they stay `null`.
- Anything that needs an account, a tracker, or a server to work.

Changed your mind later? Open an issue and your setup comes down. No argument.

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
