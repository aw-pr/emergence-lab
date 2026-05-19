# PUBLISH-WORKFLOW.md — emergence-lab

How this repo stays safe to publish. Private working history is kept messy and
local; what goes public is a clean, scrubbed `main`.

## Current state

- Clean public-ready history: a small squashed `main` (≈5 commits). Historical
  private work was backed up outside the repo before the public branch was cut.
- No remote configured yet. `gh auth status` previously reported an invalid
  token; re-authenticate before creating the public remote.
- Publish-guard git hooks are **armed** in `.git/hooks/`.
- `npm run verify` passes (typecheck + kernel tests + production build).

## The guard hooks

Two hooks enforce publish safety. They read patterns from a gitignored
`.publish-guard.local` so the hooks themselves ship no personal data.

### `pre-commit` — refuses to stage personal/secret material

Blocks a commit if staged content:

- touches a sensitive path (`.env`, `.env.*`, `*op-refs.local.sh`,
  `*settings.local.json`, `.publish-guard.local`), or
- adds a line matching `GUARD_PATTERNS` from `.publish-guard.local` (local
  user/home paths, `op://` refs, personal email handles).

Deliberate override, one commit only: `git commit --no-verify`.

### `pre-push` — keeps non-public branches off the public remote

If the push target URL contains `GUARD_PUBLIC_URL_MATCH` (`emergence-lab`),
only `GUARD_PUBLIC_BRANCH` (`main`) may be pushed. Any other remote (a private
backup) is unrestricted. Deliberate override: `git push --no-verify`.

### `.publish-guard.local` (gitignored — never committed)

```sh
GUARD_PATTERNS='…personal/home/op:// patterns…'
GUARD_PUBLIC_URL_MATCH='emergence-lab'
GUARD_PUBLIC_BRANCH='main'
```

If this file is missing the hooks degrade safely (pre-commit becomes
permissive, pre-push becomes a no-op). Restore it before relying on the guards.
On a fresh clone, confirm the file exists with real patterns, not a placeholder.

## Day-to-day

- Work and commit normally on `main`. The pre-commit hook is the safety net.
- If the hook blocks a legitimate change, fix the content rather than
  reflexively using `--no-verify`. Override only when you have looked at the
  flagged lines and they are genuinely safe.
- Keep secrets in `.env.local` (gitignored). Never inline tokens or keys.

## One-time public remote setup (not yet done)

```bash
gh auth login -h github.com           # fix the invalid-token state first
gh repo create <org>/emergence-lab --public --source=. --remote=origin --push=false
git remote add origin <url>           # if not added by gh
npm run verify
git rev-list --all --count            # expect a small number
git push origin main                  # pre-push allows only main on this remote
```

Push only `main` to the public remote. Use a separate private remote for any
backup of richer history; that remote is unrestricted by the pre-push guard.

## Pre-publish checklist

- [ ] `npm run verify` is green.
- [ ] `git status` clean; no `.env*`, `*.local`, or backup files staged.
- [ ] `git log --oneline` reads as an intentional public history.
- [ ] `.publish-guard.local` present with real patterns; hooks executable.
- [ ] No secrets, personal paths, or `op://` refs in tracked files
      (`git grep -nE "$GUARD_PATTERNS"` returns nothing meaningful).
