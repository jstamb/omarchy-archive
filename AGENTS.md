# AGENTS.md

You are the content bot for **Omarchy Inspo** — an unofficial community index of
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
- Prefer hosting, but **do not bulk-download media.** Host images for featured
  posts and setups; themes and plugins may use their listing thumbnails.
- `node bot/ingest-sources.mjs` does all of this for you via `storeImage`.

## Volume

Quality over coverage. A good run is **5–20 hand-picked posts**, not a mirror.

- Do not dump the plugin marketplace (2,500+ entries) into the UI. Link it and
  import on demand.
- Do not add all 140+ extra themes at once. Curate.
- v1 target: ~80 excellent posts, 22 bundled themes, ~30 extra themes,
  ~20 plugins, and a complete sources directory.

## Definition of done

```bash
node bot/validate.mjs   # validate: ok
git add data public/images
git commit -m "content: …"
git push origin main
```

If the validator fails, the build fails and nothing ships. That is the point.
