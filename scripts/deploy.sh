#!/usr/bin/env bash
# One orchestrated deploy across the three targets this repo feeds. Each stage
# past the local build is opt-in; ordering is fixed regardless of flag order so
# the public mirror can never lead private main.
#
#   verify -> build(promo artifacts) -> promo(commit+push) -> site(main) -> mirror(public)
#
# Flags:
#   --build          npm run publish:site — build site+lib, rsync into promo-flow
#                    (local only, nothing goes live). Implied by --promo.
#   --promo          + commit & push promo-flow so its CI deploys. Requires the
#                    promo-flow tree to be clean *before* the rsync.
#   --site           + git ff-dev-main — ff main onto dev, push (Netlify deploy).
#   --mirror         + git publish — push the curated public mirror (last, gated).
#   --all            --build --promo --site --mirror
#   -n | --dry-run   print the resolved plan and exit; touch nothing.
#   -y | --yes       skip the confirmation pause before the mirror push.
#
# With no action flags it prints the plan and exits (safe to eyeball first).
set -euo pipefail
cd "$(dirname "$0")/.."

PROMO="${PROMO_FLOW_DIR:-../promo-flow}"

do_build=0 do_promo=0 do_site=0 do_mirror=0 dry=0 assume_yes=0
for arg in "$@"; do
  case "$arg" in
    --build)        do_build=1 ;;
    --promo)        do_promo=1; do_build=1 ;;
    --site)         do_site=1 ;;
    --mirror)       do_mirror=1 ;;
    --all)          do_build=1; do_promo=1; do_site=1; do_mirror=1 ;;
    -n|--dry-run)   dry=1 ;;
    -y|--yes)       assume_yes=1 ;;
    -h|--help)      sed -n '2,20p' "$0"; exit 0 ;;
    *) echo "deploy: unknown flag '$arg' (try --help)" >&2; exit 2 ;;
  esac
done

any=$(( do_build || do_promo || do_site || do_mirror ))

echo "Deploy plan:"
[ "$do_build"  -eq 1 ] && echo "  build   npm run publish:site  -> artifacts into $PROMO"
[ "$do_promo"  -eq 1 ] && echo "  promo   commit & push $PROMO   -> its CI deploys"
[ "$do_site"   -eq 1 ] && echo "  site    git ff-dev-main        -> push origin main (Netlify)"
[ "$do_mirror" -eq 1 ] && echo "  mirror  git publish            -> public mirror"
[ "$any" -eq 0 ] && echo "  (nothing selected — pass --build/--promo/--site/--mirror/--all)"
echo

if [ "$any" -eq 0 ] || [ "$dry" -eq 1 ]; then
  exit 0
fi

# --- Fail-fast preconditions, before any side effect -------------------------

if [ "$do_site" -eq 1 ] || [ "$do_mirror" -eq 1 ]; then
  test -z "$(git status --porcelain)" \
    || { echo "deploy: working tree dirty — commit or stash before --site/--mirror" >&2; exit 1; }
fi

if [ "$do_promo" -eq 1 ]; then
  test -d "$PROMO/.git" \
    || { echo "deploy: promo-flow repo not found at $PROMO (set PROMO_FLOW_DIR)" >&2; exit 1; }
  test -z "$(git -C "$PROMO" status --porcelain)" \
    || { echo "deploy: $PROMO has uncommitted changes — refusing to fold them into a deploy" >&2; exit 1; }
fi

# --- Verify gate -------------------------------------------------------------

echo "==> npm run verify"
npm run verify

# --- Build: artifacts into promo-flow ---------------------------------------

if [ "$do_build" -eq 1 ]; then
  echo "==> npm run publish:site"
  npm run publish:site
fi

# --- Promo: commit + push promo-flow (CI deploys) ---------------------------

if [ "$do_promo" -eq 1 ]; then
  if [ -z "$(git -C "$PROMO" status --porcelain)" ]; then
    echo "==> promo: no artifact changes in $PROMO, nothing to push"
  else
    sha=$(git rev-parse --short HEAD)
    echo "==> promo: commit & push $PROMO"
    git -C "$PROMO" add -A
    git -C "$PROMO" commit -m "chore(labs): publish emergence-lab $sha"
    git -C "$PROMO" push
  fi
fi

# --- Site: deploy this repo via main ----------------------------------------

if [ "$do_site" -eq 1 ]; then
  echo "==> git ff-dev-main"
  git ff-dev-main
fi

# --- Mirror: public mirror (last, gated) ------------------------------------

if [ "$do_mirror" -eq 1 ]; then
  if [ "$assume_yes" -ne 1 ]; then
    printf "==> mirror: push curated public mirror via git publish? [y/N] "
    read -r reply
    case "$reply" in [yY]|[yY][eE][sS]) ;; *) echo "mirror: skipped"; exit 0 ;; esac
  fi
  echo "==> git publish"
  git publish
fi

echo "Done."
