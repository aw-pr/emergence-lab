# Publish workflow

How emergence-lab keeps the public mirror clean, and how the site deploy
relates to the publish action. Read this before pushing anything to the
public remote.

## Model

This repo runs the **dual-branch publish model** in `preserve` history
mode. There are two long-lived branches with two different audiences:

- **`main`** — site trunk. Private origin (`tw-one/emergence-lab`).
  Netlify deploys from this branch on every push. Topic branches merge
  here. May contain commits not yet visible on the public mirror.
- **`publish`** — public mirror trunk. Fast-forwards onto `main` only
  when you deliberately publish. Pushed to `public` (`aw-pr/emergence-lab`)
  as `main`. Append-only and always publish-clean.

The site deploy and the public mirror are decoupled. Pushing to `main`
updates the site. Running `git publish` updates the public mirror.
You choose when to do each.

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
# Working on the site (anything that should deploy):
git switch main
# commit work atomically with per-agent --author=
git push origin main          # deploys site

# When main is publish-ready, mirror it:
git publish                   # ff publish onto main, push origin publish,
                              # push public publish:main
```

The `git publish` alias:

1. Refuses if the working tree is dirty.
2. Switches to `publish`.
3. Fast-forwards `publish` onto `main` (fails if `main` is not a
   descendant of `publish` — investigate before forcing).
4. Pushes `publish` to the private remote (`origin`, for backup).
5. Pushes `publish:main` to the public remote (`public`).
6. Returns to the original branch.

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
and create the local `publish` branch:

```sh
git remote add public git@github.com:aw-pr/emergence-lab.git
git fetch public
git branch publish public/main
```

Re-create the `git publish` alias if it's not in your global git config
(it's set locally per-checkout in this repo).

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

- **Site update without publish**: commit on `main`, `git push origin main`.
  Netlify rebuilds. `publish` does not move; the public mirror is
  unchanged.
- **Publish without site update**: not really meaningful in this repo —
  `git publish` fast-forwards `publish` onto `main`, so the public
  mirror only ever lags or equals the deployed site, never leads it.
- **Both**: ordinary case. Push to `main` (site updates), then
  `git publish` when ready (public mirror catches up).
