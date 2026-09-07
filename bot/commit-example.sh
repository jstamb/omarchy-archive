#!/usr/bin/env bash
# Reference content run for the bot. Copy the shape, not the literal ids.
#
# The rules this encodes:
#   - only data/ and public/images/ change; src/ is off-limits
#   - precommit before commit, never after, and never past a non-zero exit
#   - the message states the number precommit counted, not the number intended
#   - one commit per logical batch, message "content: <verb> <what>"
#   - push to main; Cloudflare Pages builds on push, not on commit
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

# 1. Pull whatever the public catalogs added since last run. Each of these is
#    idempotent: existing ids are updated in place, never duplicated.
node bot/ingest-sources.mjs themes-bundled          # new themes in the omarchy repo
node bot/ingest-sources.mjs themes-extra --limit 5  # newest from omarchy.org/themes
node bot/ingest-sources.mjs plugins --limit 10      # top of the marketplace
node bot/ingest-sources.mjs setups --limit 10       # newest desks from the hub
node bot/ingest-sources.mjs ideas                   # articles, guides, tools

# 2. Hand-picked records go in by editing data/*.json directly. Required fields:
#    id, title, source_url (or repo_url), tags, added_at. Install commands are
#    copied from AGENTS.md or from the upstream catalog — never composed.

# 3. Pull anything hotlinked into the archive as a local WebP.
node bot/mirror-images.mjs

# 4. The gate. Refuses a clobbered file, a dropped record count, a vanished id,
#    or a validate failure — and prints the commit message, counted from the
#    diff. `set -e` at the top of this file means a refusal ends the run here.
node bot/precommit.mjs

# 5. Commit only content paths. Use the number precommit counted; never a
#    number you intended to add.
git add data public/images
if git diff --cached --quiet; then
  echo "nothing to commit — a normal run"
  exit 0
fi

git commit -m "content: ingest omarchy catalogs $(date -u +%Y-%m-%d)"

# 6. Push. This is what triggers the Cloudflare Pages build.
git push origin main
