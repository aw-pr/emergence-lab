#!/usr/bin/env bash
# Publish the built artifacts into the host site working copy:
#   dist/      -> public/labs/app/   (static app: standalone + fullscreen target)
#   katex dist -> public/labs/app/katex/  (stable unhashed path; the web
#                 component links it into its shadow root and the document)
#   dist-lib/  -> public/labs/lib/   (importable web-component module)
#   registry   -> src/vendor/emergence-lab/registry.json (drift check)
# Run via `npm run publish:site`, which builds dist/ and dist-lib/ first.
set -euo pipefail
cd "$(dirname "$0")/.."

PROMO="${PROMO_FLOW_DIR:-../promo-flow}"

rsync -a --delete dist/ "$PROMO/public/labs/app/"

mkdir -p "$PROMO/public/labs/app/katex"
rsync -a --delete node_modules/katex/dist/katex.min.css \
  node_modules/katex/dist/fonts "$PROMO/public/labs/app/katex/"

rsync -a --delete dist-lib/ "$PROMO/public/labs/lib/"

mkdir -p "$PROMO/src/vendor/emergence-lab"
node scripts/emit-registry-manifest.mjs > "$PROMO/src/vendor/emergence-lab/registry.json"

echo "Published app, katex, lib, and registry manifest to $PROMO"
