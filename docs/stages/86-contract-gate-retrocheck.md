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
