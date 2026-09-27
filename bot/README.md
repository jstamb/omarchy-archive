# bot/

Everything that writes content. Nothing here is imported by the site — `src/`
reads `data/*.json` and nothing else.

| File                | Does                                                                    |
| ------------------- | ----------------------------------------------------------------------- |
| `schema.json`       | Record shape per `data/*.json` file. The contract.                      |
| `validate.mjs`      | The build gate. Runs first in `npm run build`; exits non-zero on a bad record. |
| `precommit.mjs`     | The commit gate. Run this instead of committing by hand — refuses a clobbered file, a dropped count, a vanished id. |
| `mirror-images.mjs` | Pulls every hotlinked post image local and flips `image_hosted`.        |
| `*.test.mjs`        | One test per documented failure mode, for both gates. `npm test`.       |
| `ingest-sources.mjs`| Pulls the public catalogs into `data/`.                                  |
| `make-og.mjs`       | Regenerates `public/og.png` + `apple-touch-icon.png` from `meta.json`.  |
| `commit-example.sh` | The reference content run, start to push.                               |
| `lib/util.mjs`      | Fetch, slug, dedup-key, and WebP image storage helpers.                  |
| `lib/colors.mjs`    | Reads a theme's colors.toml / alacritty.toml into the semantic `colors` field the site's theme switcher runs on. |

## Ingest

```bash
node bot/ingest-sources.mjs themes-bundled            # omarchy repo themes/ dirs
node bot/ingest-sources.mjs themes-extra --limit 10   # omarchy.org/themes grid
node bot/ingest-sources.mjs themes-extra --name "Dracula" --name "Monokai"
node bot/ingest-sources.mjs themes-colors                # colors.toml -> theme.colors, for the site switcher
node bot/ingest-sources.mjs themes-colors --id dracula --force
node bot/ingest-sources.mjs plugins --limit 20        # marketplace, by stars
node bot/ingest-sources.mjs plugins --id omamail      # specific plugins
node bot/ingest-sources.mjs setups --limit 16         # newest desks from the hub
node bot/ingest-sources.mjs setups --id 69            # one hub setup by its id
node bot/ingest-sources.mjs ideas                     # articles, guides, tools
```

Flags: `--limit N` caps how many new records are added, `--id`/`--name` pick
specific ones, `--force` re-downloads images that already exist.

Every ingest is idempotent. Dedup is on the normalised `source_url` /
`repo_url`, so re-running adds nothing new. Existing `id`s and `added_at` are
never rewritten.

## What ingest guarantees

- **Install commands are copied, never composed.** Community plugins carry
  `installCommand` in the marketplace catalog; bundled themes and first-party
  plugins use the verified forms in `AGENTS.md`. When the command is unknown the
  record stores `null` and the page shows the listing instead.
- **Images obey the house rules.** Anything stored under `public/images/` is
  re-encoded to WebP, max edge 1200px, quality 80, metadata stripped, and the
  record gets `image_hosted: true`. Listing thumbnails we link rather than host
  are recorded as absolute `https://` URLs with `image_hosted: false`.
- **Theme metadata is real.** `tone` and `palette` are parsed from each theme's
  own `colors.toml` in the omarchy repo, not guessed from the screenshot.

## Validate

```bash
node bot/precommit.mjs    # the one to run before committing — or: npm run precommit
node bot/validate.mjs     # what the build runs — or: npm run validate
npm test                  # proves both gates actually reject each failure mode
```

`precommit` runs `validate` for you and adds the checks a build cannot make,
because it compares the tree against `HEAD`: a file that stopped parsing, a
record count that went down, a published id that disappeared. It prints the
commit message, counted from the diff. Two scrape runs have replaced
`data/posts.json` with a single sentinel string and committed it under a
message claiming new posts; this is the gate that would have stopped both.

It fails the build on: schema violations, duplicate ids, ids that collide once
slugified into a URL, duplicate dedup keys, an install command that is not an
`omarchy` command (or contains shell metacharacters), a hosted image that is
missing / not WebP / over 400KB, an `image_hosted` flag that disagrees with the
image path, and `seen_on` / `related_*_ids` that point at nothing.

It warns — but does not fail — when nothing is featured, or a featured post has
no image.

## Automations

Two kinds of routine keep this index current without a human:

- **Deterministic ingests → GitHub Actions.** Each clones `timeline.yml`: check
  out over the `TIMELINE_DEPLOY_KEY` deploy key (the one actor allowed past the
  pull-request rule on `main`), run the ingest, then `preserve` → `validate` →
  `build`, then commit `data public/images` with the message `precommit` counts
  and push. A non-fast-forward push fails and the next run picks it up. None of
  these need an LLM.
- **Judgment → the Grok content bot.** The X scrape and the hand-adds from
  link-only sources (the `ingest: "manual"` rows in `data/sources.json`) stay an
  agent routine, because deciding what is worth a record — and its `kind`,
  `related_theme_ids`, and dedup — is not mechanical. The preferred wake path is
  Action → site API → webhook (below); a cron routine remains as fallback until
  a webhook dry-run succeeds.

| Workflow | `ingest-sources.mjs` command | Writes | Schedule (UTC) |
| --- | --- | --- | --- |
| `ingest-plugins.yml` | `plugins --all` | `plugins.json` | daily 05:20 |
| `ingest-setups.yml` | `setups` | `posts.json` + `images/posts/` | daily 05:40 |
| `ingest-resources.yml` | `ideas` | `posts.json` | daily 06:00 |
| `timeline.yml` | `ingest-timeline.mjs` | `timeline.json` | daily 06:20 |
| `ingest-themes.yml` | `themes` | `themes.json` | Mon 06:40 |
| `ingest-x-trigger.yml` | _(trigger only)_ → Bot webhook | `posts.json` (via Bot) | every 8h (`45 */8 * * *`) |

### X scrape path (Action → API → webhook)

```
GitHub Action (ingest-x-trigger.yml)
  → POST https://omarchyarchive.com/api/ingest-x-trigger
  → Cloudflare Pages Function (functions/api/ingest-x-trigger.js)
  → Grok Bot webhook routine scrape-x-via-webhook-trigger
  → Bot OAuth MCP scrape + commit/push
```

No X bearer in Actions or Pages. The Action does not commit; the Bot still
owns scrape judgment, image mirror, `precommit`, and push. Cadence: **8h**
trigger, **12h** lookback, **cap 25** new records (see `AGENTS.md`).

**Secrets checklist**

| Where | Name | Purpose |
| --- | --- | --- |
| GitHub Actions | `INGEST_X_TRIGGER_SECRET` | Bearer shared with the site Function |
| GitHub Actions | `INGEST_X_TRIGGER_URL` (optional) | Override API URL; empty → production |
| Cloudflare Pages (encrypted) | `INGEST_X_TRIGGER_SECRET` | Same value as the Actions secret |
| Cloudflare Pages (encrypted) | `OMARCHY_BOT_WEBHOOK_URL` | POST URL from Omarchy Bot routine panel |
| Cloudflare Pages (encrypted) | `OMARCHY_BOT_WEBHOOK_SECRET` | Sender key (`crsr_…`) from the same panel |

Jordan copies **URL + sender key** from the Omarchy Bot routine panel for
**Scrape X via webhook trigger** (`scrape-x-via-webhook-trigger`) into the Pages
secrets. Official webhook auth is `Authorization: Bearer <key>`; the Function
also sends `X-Webhook-Secret` with the same value.

**Do not pause** cron routine `scrape-x-for-new-omarchy-content` until a webhook
dry-run succeeds — keeps a fallback and avoids a silent gap. After dry-run OK,
pause that cron to avoid double scrape.

The other ingest crons are staggered ~20 min apart so scheduled pushes to
`main` don't race. All accept `workflow_dispatch` to run one now, and the
commit-and-push ingests are idempotent — a run that changes nothing commits
nothing.

Prerequisite: the four `ingest-*.yml` that commit reuse
`secrets.TIMELINE_DEPLOY_KEY`, which is already a bypass actor on the `main`
ruleset for `timeline.yml`, so no new deploy key is required for those.
`ingest-x-trigger.yml` needs only `INGEST_X_TRIGGER_SECRET` (no deploy key).
