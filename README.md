# Omarchy Inspo

**A community index of Omarchy setups, themes, plugins, and the other Omarchy
sites** — filterable, searchable, with the official install command next to
every record.

Omarchy Inspo is a static catalog. Humans ship the site. The bot ships the
content. Official theme and plugin directories remain the source of truth for
installs; this site copies their commands and points at desks and posts those
directories do not collect.

> Community index. Not affiliated with Omarchy or 37signals. Official catalogs
> stay canonical.

## Quick start

```bash
git clone https://github.com/omarchyinspo/omarchy-inspo
cd omarchy-inspo
npm install
npm run dev          # http://localhost:4321
```

Search needs a built index, so it only works after `npm run build`. In dev the
field says so instead of spinning.

```bash
npm run build        # validate → astro build → pagefind
npm run preview      # serve dist/
npm test             # validator gates
npm run check        # astro check (0 errors expected)
```

## How it works

```
data/*.json ──▶ src/lib/content.ts ──▶ pages ──▶ dist/ ──▶ Cloudflare Pages
     ▲                                              │
     └── bot/ingest-sources.mjs                      └── pagefind --site dist
```

- **No server, no database, no auth, no SSR.** Static output, 100+ pages built
  in under a second.
- **Content is files in git.** Every record is a JSON object; every hosted image
  is a committed WebP. A content change is an ordinary commit to `main`.
- **`npm run build` validates first.** `bot/validate.mjs` fails the build on a
  bad record, so a broken bot commit never reaches the site.
- **Filters are server-rendered + chip-filtered.** All cards ship in the HTML;
  `src/scripts/gallery.ts` hides, sorts, and syncs the URL. No framework.
- **Search is Pagefind**, built after `astro build`, queried from the main
  thread (`noWorker: true` — see the comment in `src/components/Search.astro`).

## Layout

```
data/                 the content — meta, sources, posts, themes, plugins, apps
public/images/        committed WebP, {kind}/{id}.webp
src/lib/content.ts    the only module that reads data/; types + derived views
src/components/       Card, Gallery, FilterBar, CommandBox, TagList, SourceBadge, Search
src/pages/            index, posts, setups, themes, plugins, sources, install, about
src/scripts/          gallery.ts — chip filtering and sorting
bot/                  ingest, validate, schema, tests  (see bot/README.md)
AGENTS.md             the bot's operating contract
```

## Data model

Every record has a stable kebab-case `id`, unique per file, never rewritten.
Dedup is on `source_url` / `repo_url`. Full shapes in
[`bot/schema.json`](bot/schema.json).

| File             | Holds                                                            |
| ---------------- | ---------------------------------------------------------------- |
| `meta.json`      | Site name, tagline, disclaimer, `updated_at`                     |
| `sources.json`   | The other Omarchy sites — the directory of directories           |
| `posts.json`     | Social items and write-ups; `kind: setup` powers `/setups/`      |
| `themes.json`    | Bundled and community themes, with palette and install command   |
| `plugins.json`   | A curated cut of the marketplace                                 |
| `apps.json`      | Packages, menu items, web apps; rendered on `/install/`           |

Setups are **not** a separate file. A setup is a post with `kind: "setup"`, so
one record means one URL and there is nothing to keep in sync.

## Install commands

Every command on the site is read from `bin/` in the
[omarchy repo](https://github.com/basecamp/omarchy), never composed:

| Thing                       | Command                                                       |
| --------------------------- | ------------------------------------------------------------- |
| Bundled theme               | `omarchy theme set <slug>`                                     |
| Extra theme                 | `omarchy theme install <repo>.git`                             |
| Third-party plugin          | `omarchy plugin add <repo>.git --enable`                       |
| Bundled plugin / bar widget | `omarchy plugin enable <id>`                                   |
| Whole bar                   | `omarchy bar use <id>`                                         |
| Web app                     | `omarchy-webapp-install 'Name' 'https://…' 'https://…/icon.png'` |
| Package                     | `omarchy pkg add <name>`                                       |

When a command is unknown the record stores `null` and the page shows the menu
path and links the listing. The validator rejects any command that does not
start with `omarchy`, and any command containing shell metacharacters.

## Adding content

```bash
node bot/ingest-sources.mjs setups --limit 10
node bot/validate.mjs
git add data public/images && git commit -m "content: ingest setups" && git push
```

`bot/commit-example.sh` is the whole run. `AGENTS.md` is the contract the bot
follows — scope, allowed sources, the command table, image rules, and the
claims it may not make.

## Cloudflare Pages

| Setting           | Value           |
| ----------------- | --------------- |
| Framework preset  | Astro           |
| Build command     | `npm run build` |
| Output directory  | `dist`          |
| Production branch | `main`          |
| Node version      | 20 or newer     |

Static output means no adapter and no Functions — Pages serves `dist/`
directly. `public/_headers` sets a 5-minute HTML cache and immutable caching for
`/images/*` and `/_astro/*`. `wrangler.toml` pins the project name and output
directory.

Deployment triggers on **push**, not on commit. After pushing, confirm the build
log's `HEAD is now at <sha>` matches `git log origin/main -1 --format=%H`;
"Retry deployment" rebuilds the original commit, not the latest.

The lockfile is regenerated on linux/amd64 (`sharp` records host-specific
optional deps, and a passing `npm ci` on macOS does not prove a passing
`npm ci` on Cloudflare). See `scripts/fix-lockfile-linux.sh`.

## Not in v1

Accounts, admin UI, comments, ratings, live X embeds on grids, scraping X at
API scale, mirroring the full plugin marketplace, an Omarchy shell plugin, and
any server-side anything.

## Credit

Every site indexed here is credited on [`/sources/`](https://omarchyinspo.com/sources/)
and [`/about/`](https://omarchyinspo.com/about/). Bundled theme previews come
from the MIT-licensed [omarchy](https://github.com/basecamp/omarchy) repo;
setup screenshots come from the MIT-licensed
[Omarchy Hub](https://github.com/deepakness/omarchy-hub). If you own a shot and
want it gone, open an issue.
