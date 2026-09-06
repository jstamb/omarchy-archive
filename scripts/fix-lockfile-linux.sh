#!/usr/bin/env bash
# Regenerate package-lock.json on linux/amd64 and prove `npm ci` works there.
#
# Why: Cloudflare Pages runs `npm ci` on linux/amd64. Packages with
# platform-specific optional dependencies — above all `sharp`
# (@img/sharp-wasm32 → @emnapi/runtime, @emnapi/core) — get recorded in a
# host-skewed layout when the lockfile is generated on macOS or Windows. Linux
# `npm ci` then rejects it ("Missing @emnapi/runtime from lock file") even though
# `npm ci` passes locally. A local `npm ci` is NOT proof the deploy will work.
#
# Usage: bash scripts/fix-lockfile-linux.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."
ROOT="$PWD"

if ! command -v docker >/dev/null 2>&1; then
  cat >&2 <<'MSG'
docker not found.

Without it, generate the lockfile on a linux/amd64 machine or in CI:
    rm -rf node_modules package-lock.json && npm install && npm ci
and commit the result. Do not treat a macOS/Windows `npm ci` as proof.
MSG
  exit 1
fi

echo "==> regenerating package-lock.json in node:22 (linux/amd64)"
docker run --rm --platform linux/amd64 \
  -v "$ROOT":/app -w /app \
  node:22 \
  bash -euo pipefail -c '
    rm -rf node_modules package-lock.json
    npm install --no-audit --no-fund
    echo "==> verifying npm ci in a clean directory"
    mkdir -p /tmp/verify
    cp package.json package-lock.json /tmp/verify/
    cd /tmp/verify
    npm ci --no-audit --no-fund
    echo "==> npm ci ok on linux/amd64"
  '

echo "==> reinstalling locally so node_modules matches this host"
rm -rf node_modules
npm install --no-audit --no-fund

echo
echo "Done. Commit the regenerated package-lock.json:"
echo "    git add package-lock.json && git commit -m 'build: regenerate lockfile on linux/amd64'"
