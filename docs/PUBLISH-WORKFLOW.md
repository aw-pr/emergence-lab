# Publish workflow

How emergence-lab keeps the public mirror clean, and how the site deploy
relates to the publish action. Read this before pushing anything to the
public remote.

## Model

This repo runs the **staged publish model** in `preserve` history
mode. There are three long-lived branches with different audiences:

- **`dev`** — integration/staging branch. Topic branches
  (`feat/*`, `wip/*`, …) fast-forward here first. Never deploys, never
  publishes; it is the buffer where work accumulates before it advances
  to `main`. Local and `origin` only.
- **`main`** — site trunk. Private origin (`tw-one/emergence-lab`).
  Netlify deploys from this branch on every push. `dev` fast-forwards
  here via `git ff-dev-main`. May contain commits not yet visible on the
  public mirror.
- **`publish`** — public mirror trunk. Fast-forwards onto `main` only
  when you deliberately publish. Pushed to `public` (`aw-pr/emergence-lab`)
  as `main`. Append-only and always publish-clean.

The flow is one direction: `feat/* → dev → main → publish → public`.
The site deploy and the public mirror are decoupled. Advancing `main`
(via `git ff-dev-main`) updates the site. Running `git publish` updates
the public mirror. You choose when to do each. Both aliases require a
local `dev` branch to exist.

## The one hard invariant

Whatever commit `public/main` points at is immutable. Squash or rewrite
freely *above* it; never *at or below* it. Rewriting a published commit
would require a history-rewriting push to the public remote — treat that
as an incident, not routine.

## History mode

`publishguard.historymode = preserve`. Atomic commits with per-agent
authorship (see CLAUDE.md and `~/.claude/rules/mcp-hub-dev-rules.md`) land
on the public mirror as-is. The public history is the audit trail.

If a particular run produces commits that are too hairy to publish
commit-by-commit, squash them on a local branch above `publish` before
fast-forwarding. Mode is a per-merge choice; the config key just sets the
default.

## Day-to-day

```bash
# Land a feature on the staging branch:
git switch dev
git merge --ff-only feat/whatever   # commits already have per-agent --author=
git push origin dev

# When dev is ready to deploy, advance main (this deploys the site):
git ff-dev-main               # ff main onto dev, push origin main -> Netlify

# When main is publish-ready, mirror it:
git publish                   # ff publish onto main, push origin publish,
                              # push public publish:main
```

The `git ff-dev-main` alias (advance the site):

1. Refuses if the working tree is dirty.
2. Fetches `origin` and resolves the default branch (`main`).
3. Requires a local `dev` branch to exist.
4. Switches to `main`, `pull --ff-only origin main`, then
   `merge --ff-only dev` (fails if `dev` is not a descendant of `main`).
5. Pushes `origin main` — **this is what triggers the Netlify deploy.**
6. Returns to the branch you started on.

The `git publish` alias (advance the public mirror):

1. Refuses if the working tree is dirty.
2. Requires a local `dev` branch to exist (aborts otherwise).
3. Switches to `publish`.
4. Fast-forwards `publish` onto `main` (fails if `main` is not a
   descendant of `publish` — investigate before forcing).
5. Pushes `publish` to the private remote (`origin`, for backup).
6. Pushes `publish:main` to the public remote (`public`), with the
   `PUBLISH_GUARD_OK=1` sentinel the pre-push hook requires.
7. Returns to `dev` on exit.

Do **not** hand-type `git push public main` to publish. Route through
`git publish` so the backup push and the public push happen together.

## What never goes public

- Topic branches (`wip/*`, `tuning-and-visual-fixes`, etc.) — these are
  for `origin` only. The pre-push hook on `public` rejects anything other
  than the `main` ref.
- Agent runtime state branches (`phat-controller/state`) — local only.
- `.publish-guard.local`, `.env*`, the autometta `state/` directory, and
  anything matching the personal patterns. The pre-commit hook enforces
  this at staging time.

## Guard infrastructure

Source-of-truth files in the repo:

- `scripts/git-hooks/pre-commit` — refuses to stage files matching
  sensitive paths and diff content matching `GUARD_PATTERNS`.
- `scripts/git-hooks/pre-push` — on the public remote (matched by
  `GUARD_PUBLIC_URL_MATCH`), allows only the branch named in
  `GUARD_PUBLIC_BRANCH` (set to `main` — the public-side branch name,
  which is what `publish:main` resolves to). Other remotes are
  unrestricted.
- `scripts/install-guards.sh` — idempotent installer. Copies both hooks
  into `.git/hooks/` and seeds `.publish-guard.local` from the example.
- `.publish-guard.local.example` — committed template with placeholders.
  Real values go into `.publish-guard.local` which is gitignored.

Override once for a deliberate exception: `git commit --no-verify` or
`git push --no-verify`. Both are escape hatches; they should not appear in
routine workflows.

## Config keys

Local git config (not committed), set once at adoption:

```sh
git config publishguard.publicmatch    aw-pr/emergence-lab
git config publishguard.publicremote   public
git config publishguard.publishbranch  publish
git config publishguard.privateremote  origin
git config publishguard.historymode    preserve
```

And `.publish-guard.local` carries the personal-pattern allow-list and
matches the public remote URL fragment.

## One-time setup on a fresh clone

```sh
bash scripts/install-guards.sh
```

That copies the hooks and seeds a placeholder `.publish-guard.local`.
Then edit `.publish-guard.local` and replace the placeholders with the
real values:

```sh
GUARD_PATTERNS='<MAC_HOME_PATH>|<LINUX_HOME_PATH>|<OP_REF_SCHEME>|<USERNAME>@|<EMAIL>'
GUARD_PUBLIC_URL_MATCH='aw-pr/emergence-lab'
GUARD_PUBLIC_BRANCH='main'
```

Set the five `publishguard.*` config keys above. Add the public remote
and create the local `dev` and `publish` branches (both aliases require
`dev` to exist):

```sh
git remote add public git@github.com:aw-pr/emergence-lab.git
git fetch public
git branch publish public/main
git branch dev main            # or: git switch -c dev
```

Re-create the `git ff-dev-main` and `git publish` aliases if they're not
in your git config (they're set locally per-checkout in this repo).

## Audit before any public push

1. `git status` clean.
2. `npm run verify` green.
3. The `repo-publish-audit` skill returns only documentation false
   positives (this file, `.cursor/rules/publish-safety.mdc`).
4. `git ls-files | grep -E '\.env$|settings\.local|op-refs\.local\.sh$|/auth\.json$|\.log$'`
   is empty.
5. Bundle backup taken:
   `git bundle create ~/emergence-lab-history-$(date +%Y%m%d-%H%M%S).bundle --all`.

Then `git publish`.

## Site deploy and publish are independent

- **Site update without publish**: land work on `dev`, then
  `git ff-dev-main` (advances `main`, pushes `origin main`). Netlify
  rebuilds. `publish` does not move; the public mirror is unchanged.
- **Publish without site update**: not really meaningful in this repo —
  `git publish` fast-forwards `publish` onto `main`, so the public
  mirror only ever lags or equals the deployed site, never leads it.
- **Both**: ordinary case. Push to `main` (site updates), then
  `git publish` when ready (public mirror catches up).
