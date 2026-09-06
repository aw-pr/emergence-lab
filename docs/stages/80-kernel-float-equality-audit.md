# Stage card 80-kernel-float-equality-audit: does any other kernel compare a float32 as if it were exact

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/80-kernel-float-equality-audit
- **Worker effort:** medium
- **Verifier effort:** high
- **Verifier panel:** false
- **Path claims:** src/sims, docs/audits/2026-09-06-kernel-float-equality.md
- **Pairing rationale:** cross-family; the worker family alternates from card
  79. An audit is the case where the verifier must find what the worker
  missed, so the Codex synthesis seat verifies with its own grep rather than
  reading the worker's list. Claims are the kernel tree, disjoint from every
  other card in this slate.
- **Type:** Audit with bounded fixes. Stage 72's envelope asked for it.

## Surfacing concern

Stage 72 found that Brian's Brain stored `dyingValue` in a `Float32Array` and
compared it with `===` against the unrounded parameter, so every non-dyadic
value silently failed to match. Its envelope closed with: "the same
current===storedFloat pattern should be checked in any other kernel that stores
a float32 parameter and compares it by exact equality, but that audit is out
of scope for this card and was not performed." Twenty-two kernels use
`Float32Array` state.

## Inputs (read these in your own context)

- `src/sims/brians-brain/kernel.ts` — the fixed comparison at the
  `Math.fround` site, and `kernel.test.cjs` for the discriminating test shape
- `src/sims/*/kernel.ts` — the audit surface

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. An audit table at `docs/audits/2026-09-06-kernel-float-equality.md`,
   repeated in the envelope: one row per kernel, the comparison sites found
   with file and line, and a verdict of `defect`, `safe` (dyadic-only or
   integer values), or `none`.
2. For every `defect` row: the same one-site fix stage 72 applied, rounding
   through `Math.fround` at the comparison, plus a test in that kernel's
   `kernel.test.cjs` that fails on `dev` and passes after, using a non-dyadic
   value the sim's slider can actually produce.
3. For every fixed kernel: the shipped presets' output diffed headlessly
   against `dev`, with the divergence reported per preset. Do not edit presets;
   report and stop, as stage 72 did.

## Constraints

- Kernel files and their tests only. No preset, harness, renderer or metric
  change.
- Do not "fix" a comparison whose parameter is integer-valued or restricted to
  dyadic fractions; mark it `safe` and say why.
- If a fix changes a shipped preset's frames, that is reported, not reverted
  and not hidden.

## Acceptance criteria

1. `npm run verify` green, including every new test.
2. The contract-test guard passes unmodified.
3. The audit table covers every `kernel.ts` under `src/sims/` with a verdict.
4. Every new test fails against `dev`; show the failure output per test.
5. Every fixed kernel has its preset divergence measured and reported.
6. No file outside `src/sims/` and the audit document is modified.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Retuning any preset whose frames change. That is one card per sim, and the
  operator decides each, as for Brian's Brain.
- Precision issues that are not equality comparisons.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If more than three kernels carry the defect, fix them all but flag in the
envelope that the preset-divergence list needs an operator pass before any of
those sims is swept again. A clean audit with zero defects is a full pass;
write the table and stop.

## Verifier handoff

Run your own grep for exact-equality comparisons against float-typed state or
parameters across `src/sims/*/kernel.ts` before reading the worker's table,
then reconcile the two. Rerun each new test against `dev` in a scratch
checkout. Criterion 3 fails on a single missing kernel.

## Re-card (2026-09-06, Codex session limit reached)

The Codex provider window is exhausted for this session, so the verifier seat
moved from `GPT-5.6 Sol` to `Claude Opus 5`, at the verifier effort of high the
card already specifies.

The Metadata pairing rationale above is left standing as the record of what was
designed, and this card is the one that loses most by the substitution: an
audit is precisely the case where the verifier must find what the worker
missed, and a Sonnet worker checked by an Opus verifier shares training lineage
in a way a Codex seat did not. The mitigation is procedural, not architectural
— the verifier runs its own grep across `src/sims` and builds its own list
before opening the worker's, and reports any kernel the worker did not
enumerate. If the two lists agree exactly, say so explicitly rather than
treating agreement as confirmation.


### Correction (2026-09-06 14:0xZ)

The Re-card section above is **wrong about this stage and is retained only as
the record of the mistake**. This stage's verifier had already run as
`GPT-5.6 Sol <gpt-5-6-sol@local>` and passed, at 10:30:18Z, before the
controller rewrote the identity at 10:47Z. The re-card was applied from a
10:05Z snapshot without re-reading state immediately before editing, so it
overwrote the record of an attempt that had already happened.

The identity has been restored to what actually ran, in both the Metadata
above and `state/state.yaml`. No git damage resulted: the commit (`d0b35e92`)
was made before the rewrite and already carries the correct
`Co-Authored-By: GPT-5.6 Sol <gpt-5-6-sol@local>` trailer.

The Codex session limit is real, but it bit after this stage was already done.
It only ever blocked card 81's worker, which was genuinely re-carded.
