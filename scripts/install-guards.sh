#!/usr/bin/env bash
# Idempotent installer for the publish-guard hooks.
# Copies scripts/git-hooks/{pre-commit,pre-push} into .git/hooks/ and seeds
# a local .publish-guard.local from the committed example if missing.
# Safe to re-run.
set -euo pipefail
root="$(git rev-parse --show-toplevel)"
src="$root/scripts/git-hooks"
dst="$root/.git/hooks"
[ -d "$dst" ] || { echo "install-guards: not a git work tree at $root" >&2; exit 1; }

# Arm every hook present in src — the canonical set is defined by
# mcp-hub/templates/git-hooks/, not repeated here.
for hook_path in "${src}"/*; do
  hook="$(basename "$hook_path")"
  case "$hook" in *.md|*.bak) continue ;; esac
  install -m 0755 "$src/$hook" "$dst/$hook"
  echo "installed $dst/$hook"
done

cfg="$root/.publish-guard.local"
ex="$root/.publish-guard.local.example"
if [ ! -f "$cfg" ]; then
  if [ -f "$ex" ]; then
    cp "$ex" "$cfg"
    echo "seeded $cfg from .publish-guard.local.example — edit it with your real values"
  else
    echo "install-guards: WARN no .publish-guard.local.example to seed from" >&2
  fi
else
  echo "$cfg already exists (leaving it alone)"
fi

echo
echo "Done. Next:"
echo "  1. Edit .publish-guard.local with your real GUARD_PATTERNS and GUARD_PUBLIC_URL_MATCH."
echo "  2. Prove the gate: a commit that adds a personal path should be rejected."
echo "  3. See docs/PUBLISH-WORKFLOW.md for the publish flow."
