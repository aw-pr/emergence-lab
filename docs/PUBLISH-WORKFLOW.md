# Publish workflow

How emergence-lab keeps the public mirror clean. Read this before pushing
anything to the public remote, and before changing the publish-guard
configuration.

## Model

This repo runs the **simple publish-guard model**. There is no separate
`publish` branch and no `git publish` alias. The two hooks gate the
public remote at the push boundary:

- **Private side** (`origin` = `tw-one/emergence-lab`): every branch is
  freely pushable. Topic branches, agent state branches, work in progress.
- **Public side** (`public` = `aw-pr/emergence-lab`): the pre-push hook
  refuses anything except `main`. To publish, push `main:main`.

History is preserved. The pre-publish audit confirmed no real secrets or
personal paths have ever entered git history (the only matches are literal
pattern strings inside this doc and `.cursor/rules/publish-safety.mdc`),
so there is no scrub or orphan-squash. Public `main` is a straight copy of
private `main`.

## The one hard invariant

Whatever commit `public/main` points at is immutable. Rewrite or squash
freely *above* it (commits not yet published); never *at or below* it.
Rewriting a published commit forces a history-rewriting push, which is the
exact hazard the guards exist to prevent. Treat that as an incident, not
routine.

## Guard infrastructure

Source-of-truth files in the repo:

- `scripts/git-hooks/pre-commit` — refuses to stage files matching
  sensitive paths (`.env*`, `*op-refs.local.sh`, `*settings.local.json`,
  `.publish-guard.local`) and any diff content matching the patterns in
  `GUARD_PATTERNS`.
- `scripts/git-hooks/pre-push` — on the public remote (matched by
  `GUARD_PUBLIC_URL_MATCH`), allows only the branch named in
  `GUARD_PUBLIC_BRANCH`. Other remotes are unrestricted.
- `scripts/install-guards.sh` — idempotent installer. Copies both hooks
  into `.git/hooks/` and seeds `.publish-guard.local` from the example.
- `.publish-guard.local.example` — committed template with placeholders.
  Real values go into `.publish-guard.local` which is gitignored.

Override once for a deliberate exception: `git commit --no-verify` or
`git push --no-verify`. Both are escape hatches; they should not appear in
routine workflows.

## One-time setup on a fresh clone

```sh
bash scripts/install-guards.sh
```

That copies the hooks and seeds a placeholder `.publish-guard.local`. Then
edit `.publish-guard.local` and replace the placeholders with the real
values for this repo:

```sh
GUARD_PATTERNS='<MAC_HOME_PATH>|<LINUX_HOME_PATH>|<OP_REF_SCHEME>|<USERNAME>@|<EMAIL>'
GUARD_PUBLIC_URL_MATCH='aw-pr/emergence-lab'
GUARD_PUBLIC_BRANCH='main'
```

The example uses angle-bracket placeholders deliberately so this committed
doc does not trip the pre-commit hook against itself. Real values go in
`.publish-guard.local`, which is gitignored.

`GUARD_PUBLIC_URL_MATCH` must be narrow enough that it only matches the
public remote. `emergence-lab` alone would also match `tw-one/emergence-lab`
and lock the private origin to `main`-only; use `aw-pr/emergence-lab`.

Prove the gate fires:

```sh
echo "/Users/<yourname>/secret" > /tmp/test-leak.md
git add /tmp/test-leak.md
git commit -m "test"            # rejected by pre-commit
git push public some-branch     # rejected by pre-push
```

Add the public remote once:

```sh
git remote add public git@github.com:aw-pr/emergence-lab.git
```

## Publishing

The whole flow is two commands:

```sh
git checkout main
git push public main
```

The pre-push hook accepts because the branch matches `GUARD_PUBLIC_BRANCH`.
Any other branch name would be rejected. If history has diverged from the
public side (it should not, unless someone rewrote a published commit),
investigate before forcing.

## What never goes public

- Topic branches (`tuning-and-visual-fixes`, `wip/*`, etc.) — push them to
  `origin`, not `public`. The pre-push hook enforces this.
- Agent runtime state branches (`phat-controller/state`) — local-only.
- `.publish-guard.local`, `.env*`, anything matching the personal patterns.

## Audit before any public push

1. `git status` clean.
2. `npm run verify` green.
3. The `repo-publish-audit` skill returns only documentation false positives
   (this file, `.cursor/rules/publish-safety.mdc`). The skill's reference
   contains the exact grep recipes; they are deliberately not duplicated here
   because the literal regexes would trip the pre-commit hook.
4. `git ls-files | grep -E '\.env$|settings\.local|op-refs\.local\.sh$|/auth\.json$|\.log$'`
   is empty.
5. Bundle backup taken: `git bundle create ~/emergence-lab-history-$(date +%Y%m%d-%H%M%S).bundle --all`.
