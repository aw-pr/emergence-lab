# Stage card 86-contract-gate-retrocheck: twenty-nine stages cited a gate that inspected nothing

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/86-contract-gate-retrocheck
- **Worker effort:** medium
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** docs/audits/2026-09-07-contract-gate-retrocheck.md
- **Pairing rationale:** cross-family. The work is mechanical — recompute
  digests, compare, tabulate — so neither seat needs the high tier; what it
  needs is a verifier that independently reruns the recomputation rather than
  reading the table.
- **Type:** Audit of past verification. No code change.

## Surfacing concern

`scripts/check-contract-test-gate.sh` invoked with no arguments gates the
*staged* change set: `staged="$(git diff --cached --name-only --diff-filter=ACM)"`
followed by `[ -n "$staged" ] || exit 0`. Every autometta dispatch evaluates a
dirty, wholly unstaged working tree, so the bare invocation exits 0 without
inspecting anything. Stage 79's verifier found this on 2026-09-06.

Twenty-nine verifier artefacts under `state/verifiers/` cite this gate, back to
stage 67. Each of those stages has an acceptance criterion of the form "the
contract-test guard passes unmodified" that was, on this evidence, never
actually checked.

A first look suggests two separate problems, and this card is to establish
which stages have which:

- Only three files carry an `AUTOMETTA-CONTRACT-BEGIN` marker
  (`e2e/sweep.spec.ts`, `src/sims/brians-brain/kernel.test.cjs`,
  `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`), and only three cards
  declare a `sha256:` digest (36, 70, 72). Cards 77-81 name a freeze in prose
  and declare no digest — which the gate treats as a violation, not a pass.
- Whether any frozen block actually drifted is a separate question, and the
  answer may well be no. `e2e/sweep.spec.ts` was checked by hand on 2026-09-06
  and still matches card 70's declared digest.

## Inputs (read these in your own context)

- `scripts/check-contract-test-gate.sh` — the whole script, particularly
  `cmd_gate` and `declared_digest`
- The three marked test files above
- `docs/stages/36-*.md`, `70-*.md`, `72-*.md` — the three cards declaring a
  digest
- The `## Contract test` section of every card from 67 onward. Read only that
  section; you do not need the rest of those cards.

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A dated audit under `docs/audits/` with one row per card from 67 onward:
   the test file it names, whether that file carries a freeze marker, whether
   the card declares a digest, and the verdict — `verified`, `no freeze exists`,
   `digest undeclared`, or `DRIFTED`.
2. For every marked file, the recomputed digest (`check-contract-test-gate.sh
   print <file>`) set against the digest its card declares, with the arithmetic
   shown. Say plainly whether any frozen block changed without its card being
   updated.
3. A count: of the twenty-nine stages citing the gate, how many had a real
   freeze to check, and how many were asserting against nothing.
4. A recommendation on what the cards should say instead, given that most
   stages touch no frozen file at all.

## Constraints

- No change to `scripts/check-contract-test-gate.sh`. The fix is an autometta
  card against the upstream copy; this repo's is vendored, and fixing the
  vendored copy alone would drift it from upstream.
- No change to any test file, any freeze marker, or any past card. Past cards
  are the record of what was asked; correcting them would erase the finding.
- No re-running of past stages.
- If a card's `## Contract test` section is ambiguous, record it as ambiguous
  rather than guessing which file it meant.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes over the staged change set. Invoke it the way
   this card's own audit concludes it should be invoked, and say in the
   appendix which way that was.
3. Every card from 67 onward appears in the table exactly once.
4. Every marked file's recomputed digest is shown, not summarised.
5. The count in deliverable 3 is stated as three numbers that sum to
   twenty-nine, or the audit explains why the population differs.
6. No file outside `docs/audits/` is modified.

## Contract test

- **Test file:** none.

This card stages one document and changes no code. Criterion 2 is satisfied by
the gate running over your staged set and reporting no violation — which, given
the subject of this card, you should confirm means something before you cite it.

## Out of scope

- Fixing the gate. That is an autometta card.
- Adding freeze markers to unmarked test files.
- Re-verifying the substance of any past stage. This card audits whether one
  criterion was checked, not whether the work was right.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If a frozen block turns out to have drifted from its card's declared digest,
stop and escalate before writing the rest of the table. That is a live contract
breach in shipped test code and the operator decides what happens next.

## Verifier handoff

Recompute at least the three marked files' digests yourself. The single thing
this card must not do is report "all verified" on the strength of the same
invocation that caused the problem.

## Re-brief (2026-09-07, the contract gate was fixed underneath this card)

This card's acceptance criterion 2 was written against the old gate and its
wording is now wrong. Autometta cards 129 and 134 rewrote
`scripts/check-contract-test-gate.sh`, and the fix was re-vendored into this
repo at `0d4760db`. Criterion 2 is superseded by what follows; nothing else in
the card changes.

**Invoke it as `scripts/check-contract-test-gate.sh --worktree`.** A dispatch
evaluates an unstaged working tree. The bare invocation still means `--staged`
and will find nothing staged; that is the defect stage 79 found, and it is now
loud rather than silent.

**Three outcomes, and all three can be correct.**

- Exit 0 with no warnings: files this gate is responsible for were inspected
  and their frozen blocks match their cards. This is a real pass.
- Exit 2 with `no relevant changed files to inspect in the working tree`: your
  change touches nothing that any card names as a contract test. For a card
  whose claims are a single document this is the *expected* outcome and it
  satisfies criterion 2. Report it in those words. Do not stage extra files to
  make the gate find something, and do not report it as a pass it is not.
- Non-zero with warnings: a real violation. Read the message; it names the
  file, the card, and the two digests.

The gate now inspects only files a card names on a `**Test file:**` line, plus
`scripts/*-smoke.sh`. A file no card names is skipped, so editing a test file
this card does not declare is not a violation.

**Criterion 2 now reads:** run the guard in `--worktree` mode and report its
exit code and message verbatim in your envelope, with one sentence saying
which of the three outcomes above it was and why that is correct for this
card. An exit code cited without which case it was is not evidence — that is
the whole lesson of the defect this replaces.

## Re-brief (2026-09-07, the cause is fixed; the damage is still yours to audit)

The Surfacing concern above describes the gate defect in the present tense. It
is now past tense. Autometta cards 129 and 134 rewrote the gate and the fix was
re-vendored here at `0d4760db`, so `scripts/check-contract-test-gate.sh` on
`dev` is the fixed version, with `--staged` and `--worktree` modes and a loud
empty-set signal.

Nothing about this card's job changes. The twenty-nine verifier artefacts were
written against the broken gate and their criteria are still unchecked; that is
the historical record you are auditing and no fix can retroactively check it.
What changes is that you now have a working instrument to audit with, and the
constraint against editing the gate is no longer protecting a pending fix — it
is simply not this card's business.

Two amendments to the deliverables:

- Deliverable 4, the recommendation on what cards should say instead, should
  now be written against the fixed gate's actual behaviour: which files it
  inspects, what its three exit outcomes mean, and what a card should declare
  when it touches no frozen file at all. Read the fixed script before writing
  it. The old advice would be obsolete on arrival.
- Add a short section recording which of the twenty-nine stages, if any, would
  now fail the fixed gate if their change set were replayed through it. You are
  not replaying them — this is a judgement from the table you are already
  building, and "cannot be determined without replay" is an acceptable entry.

The escalation clause stands unchanged: a frozen block that drifted from its
card's declared digest stops the card.
