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

## How to write a data file

Read the whole file, push onto the array, write the whole array back. Never
write a fragment, a path, a placeholder, or a partial array over one of these
files. They are added to, never replaced.

Two runs have failed here in the same way, and both reached `main`:

```
2026-09-06  data/posts.json  <- "file:///workspace/omarchy-archive/data/posts.json"
2026-09-07  data/posts.json  <- "PLACEHOLDER_WILL_FAIL"
```

Both times all 134 records were gone in one commit, and both times the commit
message announced new posts. If a value like that can reach the write call,
the write is wrong — a record count must never go down.

## Workflow

1. Read `bot/schema.json` and the existing ids in the file you are about to
   touch. Ids are permanent — never rewrite one that is already published.
2. Dedup on `source_url` and `repo_url`. If a record already exists, skip it, or
   update only `tags`, `image`, `summary`, and `featured`.
3. A new record needs: `id`, `title` (or `name`), `source_url` or `repo_url`,
   `tags`, and `added_at` (ISO `YYYY-MM-DD`).
4. Pull any hotlinked images local:
   ```bash
   node bot/mirror-images.mjs
   ```
5. Run the gate. This is not optional and it is not the same as `validate`:
   ```bash
   node bot/precommit.mjs
   ```
   It exits non-zero and commits nothing if a file stopped parsing, a record
   count dropped, a published id vanished, or `validate` fails. When it
   passes it prints the commit message to use, generated from the counted
   delta.
6. Commit only content paths, using the message it printed:
   ```bash
   git add data public/images
   git commit -m "content: add 3 posts"
   ```
7. Push to `main`. Cloudflare Pages builds on push. `bot/commit-example.sh` is
   the whole run end to end.

Chain it so a failure actually stops the run:

```bash
node bot/mirror-images.mjs && node bot/precommit.mjs && git add data public/images && git commit -m "…" && git push origin main
```

## The commit message must be the counted number

Say what the diff contains, not what the run set out to do. `precommit` counts
it for you — use its number. Three commits have now claimed 8 and 18 new posts
on top of a file that did not change by a single byte, and a message that
reports work the diff does not contain is worse than a crash, because it is
the part a human reads instead of checking.

If you added nothing, commit nothing. An empty run is the expected outcome
most days and needs no commit to prove it happened.

Never open a pull request. PRs on this repo are for humans submitting their
own setups; a bot opening and merging its own PR is a slower commit with a
misleading paper trail.

## Where records come from

Prefer the ingest scripts — they map upstream fields correctly and cannot
invent a command:

```bash
node bot/ingest-sources.mjs themes-bundled
node bot/ingest-sources.mjs themes-extra --limit 10
node bot/ingest-sources.mjs themes-colors           # after any theme add: fills `colors` from the repo
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

### Choosing `kind`

Pick by **what the post is about**, not what it looks like:

| `kind` | Use it for |
| --- | --- |
| `setup` | A photo of someone's machine running Omarchy. Shows up on `/setups/`. |
| `theme` | A post announcing or showing off a theme. |
| `plugin` | A post announcing or showing off a plugin, bar widget, or shell extension. |
| `idea` | A guide, article, review, discussion, cheat sheet, or how-to. |
| `hardware` | A post that is about the machine rather than the desktop — a laptop review, a build. |
| `other` | A tool or project built around Omarchy that is none of the above. |

A theme *announcement* is `kind: "theme"` in `posts.json`. The installable
theme itself is a separate record in `themes.json`. Adding both is correct and
they link to each other; adding neither because you could not decide is not.

## Scraping X

The scheduled X run happens every four hours, so **most runs should add
nothing**. That is the expected outcome, not a failed run. Six posts a day of
real signal is a good week.

**Deduplicate first, always.** Load `data/posts.json` and build the set of
existing `source_url` values before you add anything. The same post will keep
appearing in search results run after run. Compare normalised: lowercase, strip
`?` query strings and trailing slashes, treat `twitter.com` and `x.com` as the
same host.

**What is worth a record**

- A desk running Omarchy, where you can see the desktop.
- A theme, plugin, or config someone published — with a repo or a listing.
- A guide, migration write-up, review, or a genuinely useful thread.
- Omarchy news: a release, a talk, a notable mention.

**What is not**

- "just installed omarchy 🔥" with no picture and no link.
- Screenshots that are mostly a terminal with no Omarchy-specific anything.
- Engagement bait, giveaways, crypto, drop-shipped hardware ads.
- A reply or quote-tweet when the original post is the real thing — record the
  original, credit the original author.
- Anything you cannot attribute to a named account.

**Cap each run at 10 new records.** If a run finds more, take the best ten and
leave the rest; they will still be there in four hours. A run that adds forty
records is a run that added noise.

**Images.** You will only ever have a CDN URL. Set `image` to it and
`image_hosted: false`, then run:

```bash
node bot/mirror-images.mjs
```

That downloads every hotlinked post image, re-encodes it to the house rules,
writes it to `public/images/posts/<id>.webp`, and flips `image_hosted` to
`true`. **Do not skip it.** `pbs.twimg.com` URLs expire and get rewritten; a
hotlinked desk is a blank card waiting to happen. A post with no usable image
is still worth adding — the card falls back to the source host in the wordmark
face.

**The field that matters most is `related_theme_ids`.** If the post says which
theme it is running, and that theme is in `data/themes.json`, put the id in.
That is what turns a photo into a link on the theme's page next to the command
that reproduces it. It is the single highest-value thing you can add.

**Commit straight to `main`.** Do not open a pull request. Pull requests on
this repo are for humans submitting their own setups; a bot opening and merging
its own PR is just a slower commit with a misleading paper trail.

## Images

- WebP only, max edge 1200px, quality ~80, metadata stripped.
- Filename is `{id}.webp` under `public/images/{setups|themes|plugins|posts|sources}/`.
- Nothing over 400KB. The validator enforces it.
- The collection has a total budget too, not just a per-file cap: 250MB across
  `public/images/`, enforced by the same validator, warning at 60%. For scale,
  120 post images is 8.9MB and the whole repo including history is 13MB, so
  normal growth will not approach it. If a run ever trips that warning, the
  quality bar has slipped — do not raise the budget, cut what you are hosting.
- Hosted image → path starts with `/images/`, and `image_hosted: true`.
- Not hosted → absolute `https://` URL, and `image_hosted: false`.
- **Host every post image; link theme and plugin thumbnails.** Posts are the
  archive's own collection and a dead upstream should not blank them, so all
  120 live in `public/images/posts/`. Theme and plugin previews stay on
  omarchy.org and plugins.omarchy.org — 1,800+ of those would be a mirror, not
  an index, and they are already served from a CDN built for it.
- `node bot/ingest-sources.mjs` handles this for catalog records via
  `storeImage`. For anything you added by hand with a remote URL, run
  `node bot/mirror-images.mjs` — it pulls every hotlinked post image local and
  flips `image_hosted`. `--dry-run` lists what it would take.

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
node bot/mirror-images.mjs \
  && node bot/precommit.mjs \
  && git add data public/images \
  && git commit -m "content: add 3 posts" \
  && git push origin main
```

`precommit` is the whole contract in one command. It refuses to let a run
commit if a data file stopped parsing, if a record count went down, if a
published id disappeared, or if `validate` fails — and when it passes it
prints the commit message, counted from the diff rather than from intent.

Use `&&`, not newlines. A run that ignores a non-zero exit and commits anyway
is how both of the breaks above shipped.

If it says `tree is clean`, commit nothing. An empty run is a normal run.
