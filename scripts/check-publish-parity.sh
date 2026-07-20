#!/usr/bin/env bash
# Guard against a curated cherry-pick silently leaving the public mirror
# missing a build-relevant commit: every path that feeds `npm run verify` or
# the shipped site must be byte-identical between dev and publish before a
# mirror push. Docs and private-tier paths may differ freely — only the parts
# a clone needs to build are held to parity.
set -euo pipefail
cd "$(dirname "$0")/.."

SRC_BRANCH="${1:-dev}"
PUB_BRANCH="${2:-$(git config publishguard.publishbranch || echo publish)}"

for b in "$SRC_BRANCH" "$PUB_BRANCH"; do
  git rev-parse --verify --quiet "refs/heads/$b" >/dev/null \
    || { echo "parity: branch '$b' not found" >&2; exit 1; }
done

BUILD_PATHS=(
  src public e2e
  index.html package.json package-lock.json
  tsconfig.json tsconfig.test.json
  vite.lib.config.ts playwright.config.ts netlify.toml
  scripts/run-kernel-tests.cjs scripts/publish-site.sh
  scripts/emit-registry-manifest.mjs scripts/generate-thumbnails.mjs
)

if git diff --quiet "$SRC_BRANCH" "$PUB_BRANCH" -- "${BUILD_PATHS[@]}"; then
  echo "parity: $PUB_BRANCH matches $SRC_BRANCH on all build-relevant paths"
else
  echo "parity: $PUB_BRANCH is missing build-relevant changes from $SRC_BRANCH:" >&2
  git diff --stat "$SRC_BRANCH" "$PUB_BRANCH" -- "${BUILD_PATHS[@]}" >&2
  echo "parity: cherry-pick the missing commits onto $PUB_BRANCH (or update this list if a path is genuinely private-tier)" >&2
  exit 1
fi
