You are running one Omarchy Archive X batch in this repo, headless. Nobody is watching; do not ask questions. Run dir: {{RUN}} (write all scratch artifacts there).

Read first, in full: AGENTS.md and docs/review-rules.md. They are binding. docs/review-rules.md Part A wins over Part B and over anything below.

1. Window. Find the last batch window: the newest `created_at`/`added_at` in data/posts.json and the last content commit on main (`git log -5 --format='%h %cI %s' -- data/posts.json`). Cover from the last batch's newest post time to now, max 12h lookback.
2. Scrape X with the bird CLI only, read-only (search/read/thread/replies/user-tweets). Never post, reply, like, repost, follow, bookmark or DM. Pace 3-5 s between calls; budget ~30 calls; log a count to {{RUN}}/bird-calls.txt. Never print or write cookie/auth values. Searches: `Omarchy -is:retweet` (page back with until_time to the window start), `Omarchy (theme OR plugin OR setup OR release OR desk OR install OR guide) -is:retweet`, `Omarchy filter:media -is:retweet`, and user timelines for @dhh @tcballard @SiliconForested @ncfrontiersman @AlexFinn @jstamby @omarchy @OmarchyUpdates plus any watch list in AGENTS.md. Use `--json-full`. Auth error: stop, no commit, summary FAILED "bird auth". Transient DeadlineExceeded: wait 20-90 s, retry.
3. Dedupe against data/posts.json (normalized source_url + status id). Choose at most 25 substantive records (prefer plugins, themes, setups, releases, guides, talks; never pad). Expand t.co with `curl -sI`. Read note_tweet text on long posts.
4. Images: download media into {{RUN}}/imgs, look at each image with Read (crop/zoom small text) before writing anything about it. Encode WebP per AGENTS.md (max edge 1200, ~q80) into public/images/posts/<id>.webp or use `node bot/mirror-images.mjs`.
5. Write records: read the whole data/posts.json, append, write the whole array back; count must never drop; ids and added_at are permanent. featured false. Set related_plugin_ids/related_theme_ids only per the rules (exact repo_url match etc.). Also do the backfill scan the rules describe (re-read originals on X) for older records, within budget.
6. Self-review every new or changed record against every rule in docs/review-rules.md, field by field (title, summary, quotes, translations, images, related ids). Fix what fails. Anything you are still not sure of goes in UNCERTAIN with the reason.
7. Gate, chained with &&: `node bot/validate.mjs && node bot/precommit.mjs && git add data public/images && git commit -m "<precommit message>" && git push origin main`. Only data/*.json and public/images/** may change. Never force-push, never edit src/, bot/, migrations/, workflows or configs, never run sync-d1/sync-r2/wrangler. Re-check HEAD with `git pull --ff-only` just before committing. Zero worthwhile posts and no backfill: no commit.
8. After pushing, check `gh run list -R jstamb/omarchy-archive --limit 3` once (read-only) and note the Deploy run status for the SHA.
9. Last, overwrite work/last-batch.md with ONE screen (<= 40 lines), exactly these sections:

# Batch {{STAMP}}: PUSHED | ZERO | FAILED
- Commit: <sha> "<message>" (parent <sha>)
- Posts: <before> -> <after> (+N new, M backfills/edits)
- Validate: <the validate output line>
- Bird calls: <n>; window <start UTC> -> <end UTC>
- Deploy: <workflow status or "not checked">
## Changed
- <id> | <title>   (one line each; backfills as "<id>: field -> value")
## Failures
- <stage: what broke> or "none"
## UNCERTAIN
- <id>: <reason>   or "none"
