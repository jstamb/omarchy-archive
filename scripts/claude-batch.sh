#!/usr/bin/env bash
# Run one Omarchy Archive X batch headless with Claude Code.
# Usage: scripts/claude-batch.sh   (from anywhere; cds to the repo root)
# Writes work/last-batch.md (one screen) and work/batch-<stamp>/ (artifacts + claude log).
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"
export PATH="$HOME/.local/bin:/opt/homebrew/bin:$PATH"
STAMP="$(date -u +%Y%m%dT%H%MZ)"
RUN="work/batch-$STAMP"
mkdir -p "$RUN"
SUMMARY="work/last-batch.md"
CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"

fail() {
  { echo "# Batch $STAMP: FAILED"; echo; echo "- Stage: preflight"; echo "- Reason: $1"; echo "- Commit: none"; echo; echo "## UNCERTAIN"; echo "- none"; } > "$SUMMARY"
  echo "FAILED: $1" >&2; exit 1
}

# Preflight: clean main tracking origin, X read tool and auth present (names only, never values).
[ -z "$(git status --porcelain --untracked-files=no)" ] || fail "working tree not clean"
git checkout -q main && git pull -q --ff-only origin main || fail "could not fast-forward main"
command -v bird >/dev/null || fail "bird CLI not installed (needs bird 0.8+ on PATH)"
if [ -z "${TWITTER_AUTH_TOKEN:-}" ] || [ -z "${TWITTER_CT0:-}" ]; then
  # Optional local secrets file outside the repo (chmod 600), exporting TWITTER_AUTH_TOKEN/TWITTER_CT0.
  [ -f "$HOME/.config/omarchy-archive/x.env" ] && set -a && . "$HOME/.config/omarchy-archive/x.env" && set +a
fi
[ -n "${TWITTER_AUTH_TOKEN:-}" ] && [ -n "${TWITTER_CT0:-}" ] || fail "X auth missing: TWITTER_AUTH_TOKEN/TWITTER_CT0 not set (bird auth)"
bird whoami >/dev/null 2>"$RUN/whoami.err" || fail "bird auth check failed (see $RUN/whoami.err)"

git rev-parse HEAD > "$RUN/parent.sha"
START=$(date +%s)
sed -e "s#{{RUN}}#$RUN#g" -e "s#{{STAMP}}#$STAMP#g" scripts/claude-batch-prompt.md > "$RUN/prompt.md"
"$CLAUDE" -p "$(cat "$RUN/prompt.md")" \
  --allowedTools "Bash,Read,Write,Edit,Glob,Grep" \
  --output-format text < /dev/null > "$RUN/claude.log" 2>&1
RC=$?
echo "claude_exit=$RC seconds=$(( $(date +%s) - START ))" >> "$RUN/claude.log"
[ -s "$SUMMARY" ] && [ "$SUMMARY" -nt "$RUN/prompt.md" ] || fail "claude exited $RC without writing $SUMMARY (see $RUN/claude.log)"
cat "$SUMMARY"
exit $RC
