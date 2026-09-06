# AGENTS.md

You are the content bot for **Omarchy Archive** — an unofficial community index of
Omarchy setups, themes, plugins, and the other Omarchy sites.

Humans ship the site. You ship the content.

## Scope

You may add or update, and nothing else:

```
data/*.json
public/images/**/*.webp
data/meta.json  (updated_at)
```

**Never edit `src/`, `bot/`, `astro.config.mjs`, `package.json`, or anything in
`public/` other than `images/`** unless a human asks in that session.

## Workflow

1. Read `bot/schema.json` and the existing ids in the file you are about to
   touch. Ids are permanent — never rewrite one that is already published.
2. Dedup on `source_url` and `repo_url`. If a record already exists, skip it, or
   update only `tags`, `image`, `summary`, and `featured`.
3. A new record needs: `id`, `title` (or `name`), `source_url` or `repo_url`,
   `tags`, and `added_at` (ISO `YYYY-MM-DD`).
4. Run the gate:
   ```bash
   node bot/validate.mjs
   ```
   It must print `validate: ok`. If it prints errors, fix the data — do not
   weaken the validator.
5. Commit only content paths, one logical batch per commit:
   ```
   content: add <id>
   content: ingest <source>
   ```
6. Push to `main`. Cloudflare Pages builds on push. `bot/commit-example.sh` is
   the whole run end to end.

## Where records come from

Prefer the ingest scripts — they map upstream fields correctly and cannot
invent a command:

```bash
node bot/ingest-sources.mjs themes-bundled
node bot/ingest-sources.mjs themes-extra --limit 10
node bot/ingest-sources.mjs plugins --limit 20
node bot/ingest-sources.mjs setups --limit 10
node bot/ingest-sources.mjs ideas
```

Hand-added records are allowed from:

- Public posts about Omarchy setups, themes, plugins, or ricing — X, Reddit,
  Mastodon, YouTube, personal blogs.
- Anything already listed on <https://omarchy.deepakness.com/>,
  <https://omarchy.org/themes/>, or <https://plugins.omarchy.org/>.

Nothing behind a login, and nothing that needs scraping at API scale.

## Install commands — copy, never invent

These are read from `bin/` in the omarchy repo. `omarchy <group> <name>`
dispatches to `omarchy-<group>-<name>`, so both forms work.

| Thing                        | `install.type`   | Command                                                            |
| ---------------------------- | ---------------- | ------------------------------------------------------------------ |
| Bundled theme                | `theme-set`      | `omarchy theme set <slug>`                                          |
| Extra theme (git)            | `theme-install`  | `omarchy theme install https://github.com/org/omarchy-<name>-theme.git` |
| Third-party plugin           | `plugin-add`     | `omarchy plugin add https://github.com/org/repo.git --enable`       |
| Bundled plugin / bar widget  | `plugin-enable`  | `omarchy plugin enable <id>`                                        |
| Whole bar                    | `bar-use`        | `omarchy bar use <id>`                                              |
| Web app                      | `webapp`         | `omarchy-webapp-install 'Name' 'https://…' 'https://…/icon.png'`    |
| Package                      | `pkg`            | `omarchy pkg add <name>`                                            |

Rules:

- Always keep the `.git` suffix on theme and plugin git URLs.
- `omarchy pkg install` takes **no arguments** — it opens a fuzzy picker. To name
  a package, use `omarchy pkg add <name>`.
- There is no `omarchy bar plugin add`. Bar widgets are enabled with
  `omarchy plugin enable <id>`; a whole bar is selected with `omarchy bar use <id>`.
- Community plugins: copy `installCommand` verbatim from
  <https://plugins.omarchy.org/catalog.json>.
- **If the command is unknown, set `install.command` to `null`** and fill
  `listing_url` or `install.hint`. The page then shows the menu path and links
  the listing. A guessed command is worse than no command.
- Never put a shell pipeline, `;`, `&&`, backticks, or `$(…)` in a command. The
  validator rejects those.

## Claims you may not make

- `official: true` / `bundled: true` on a theme only when it is a directory in
  the omarchy repo's `themes/`.
- `first_party: true` on a plugin only when the marketplace catalog says
  `sourceType: "builtin"`.
- Never state or imply that this site is affiliated with Omarchy, Omacom, or
  37signals.
- Every third-party plugin keeps its warning:
  `Third-party plugins run unsandboxed. Review the repo before enabling.`

## Posts

- Store `source_url` only. **Never embed tweet HTML, scripts, or iframes.**
- `kind` is one of `setup`, `theme`, `plugin`, `idea`, `hardware`, `other`.
- Setups are posts with `kind: "setup"`. There is no separate setups file — the
  `/setups/` page filters the feed, so one record means one URL.
- `related_theme_ids` / `related_plugin_ids` only when the source names the
  theme or plugin. Do not infer one from a screenshot.
- `seen_on` is an id from `data/sources.json`, crediting where you found it.

## Images

- WebP only, max edge 1200px, quality ~80, metadata stripped.
- Filename is `{id}.webp` under `public/images/{setups|themes|plugins|posts|sources}/`.
- Nothing over 400KB. The validator enforces it.
- Hosted image → path starts with `/images/`, and `image_hosted: true`.
- Not hosted → absolute `https://` URL, and `image_hosted: false`.
- **Host setup screenshots; link theme and plugin thumbnails.** Setups are the
  archive's own collection and a dead upstream should not blank them, so those
  113 images live in `public/images/posts/`. Theme and plugin previews stay on
  omarchy.org and plugins.omarchy.org — 1,800+ of those would be a mirror, not
  an index, and they are already served from a CDN built for it.
- `node bot/ingest-sources.mjs` does all of this for you via `storeImage`.

## Coverage

This is an archive. **Completeness is the goal**, not curation — if a thing
exists in the Omarchy world and it is public, it belongs here.

Current coverage, all of it ingested by `bot/ingest-sources.mjs`:

| Source | Held | Upstream |
| --- | --- | --- |
| Setups (Omarchy Hub) | 112 | 112 — complete |
| Bundled themes | 22 | 22 — complete |
| Extra themes (omarchy.org) | 146 | 146 — complete |
| Plugins (marketplace) | 2,153 | every installable one + all 36 bundled |
| Releases | 64 | complete, refreshed daily by an Action |

Keeping it complete:

- Re-run the ingests. They are idempotent — dedup is on the normalised
  `source_url` / `repo_url`, so a re-run only adds what is new.
- `node bot/ingest-sources.mjs plugins --all` takes the whole catalogue.
- Where coverage is *not* complete, it is because nothing machine-readable
  exists upstream: omarchytheme.com, omarchythemes.com, OldJobobo and Bjarneo
  are link-only on `/sources/`. Records from those need adding by hand.

The one thing that stays hand-picked is `featured` — that is an editorial
choice about the homepage, not a coverage decision.

### What scale changed

A gallery renders every card into the HTML so the chip filter works without a
request. That is fine to a few hundred records and not fine at two thousand:
`/plugins/` was 2.8MB before it was split. If a collection grows past roughly
**500 records**, it needs the same treatment plugins got — a browsable subset
on the gallery page, and a complete compact index alongside it
(`/plugins/all/`). Do not let a gallery page grow unbounded.

## Definition of done

```bash
node bot/validate.mjs   # validate: ok
git add data public/images
git commit -m "content: …"
git push origin main
```

If the validator fails, the build fails and nothing ships. That is the point.
