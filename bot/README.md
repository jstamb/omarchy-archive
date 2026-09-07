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
