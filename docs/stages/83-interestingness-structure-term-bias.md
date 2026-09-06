# Stage card 83-interestingness-structure-term-bias: the term that is 55% of every score rewards blur

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/83-interestingness-structure-term-bias
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Path claims:** docs/audits/2026-09-07-interestingness-structure-bias.md
- **Pairing rationale:** cross-family, and both seats at high effort because
  the finding under audit is a reasoning claim, not a measurement. The worker
  must argue a case about a metric's construction across nine write-ups; the
  verifier's job is to try to break that argument, which needs the same tier.
- **Type:** Audit. No code change, no metric change.

## Surfacing concern

The composite is `coverageFactor * (0.55*structure + 0.45*detail) * liveliness`
(`e2e/harness/metrics.ts:353`), where `structure` is lag-1 spatial
autocorrelation. Blurring a field raises its lag-1 autocorrelation. So the
term carrying the largest single weight in every interestingness score rewards
exactly the smoothing that the Belousov-Zhabotinsky parameter note calls
blur — and stage 81 found a score that ramps monotonically to the edge of a
slider, carried almost entirely by that term, and refused to promote on it.

If that bias is real, it is not confined to BZ. Nine sweep write-ups in
`docs/sweeps/` rank presets by this composite, and promotions have been made
on it.

## Inputs (read these in your own context)

- `e2e/harness/metrics.ts` — the composite, the structure term, and the
  comment block at lines 325-340 stating the design intent
- `e2e/harness/sims.ts` — the note at line 668 on the structure term being 55%
  of the composite
- `docs/sweeps/belousov-zhabotinsky-interestingness.md` — the 2026-09-06
  appendix, which is the case that prompted this
- The other eight files in `docs/sweeps/` — the ranking tables and any
  promotion sections. You do not need their prose in full; you need the
  rankings and what was promoted.

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A dated audit under `docs/audits/` stating whether the structure term's
   preference for smoothness is a defect, a deliberate tradeoff, or
   circumstantial — argued from the metric's construction, not asserted.
2. A table of every promotion made on this composite across the nine sweeps,
   with the margin that justified it and whether that margin survives if the
   structure term is discounted. Show the arithmetic; do not re-run sweeps.
3. A named test that would distinguish "the metric rewards blur" from "blurred
   fields are genuinely more coherent": what you would measure, on what, and
   what result would settle it. This is the design for a future card, not work
   to do here.
4. An explicit verdict: does any shipped promotion need revisiting, and which.

## Constraints

- No change to `e2e/harness/metrics.ts` or any weight, threshold or term.
  A metric change is its own card with its own re-baseline of nine sweeps.
- No sweep runs. Every number in the audit comes from a write-up already on
  `dev`, cited by file and section.
- No preset changes.
- If a write-up's numbers do not support a claim you want to make, say the
  evidence is absent rather than generating it.

## Acceptance criteria

1. `npm run verify` green (nothing should have changed, so this is a check that
   nothing did).
2. The contract-test guard passes on the staged change set, invoked with the
   test file named explicitly.
3. The audit takes a position in its first paragraph — defect, tradeoff, or
   circumstantial — and the rest of the document supports that position.
4. Every promotion across the nine sweeps appears in the table, or the audit
   states which sweeps made none.
5. Every number cited is traceable to a file and section already on `dev`.
6. The distinguishing test in deliverable 3 is specific enough that a later
   card could be written from it without further design.

## Contract test

- **Test file:** none.

This card stages one document and changes no code, so no frozen block is in
its claims. Criterion 2 is satisfied by the gate running over your staged set
and reporting no violation.

## Out of scope

- Fixing the metric.
- Re-running any sweep.
- Re-scoring or un-promoting any preset. This card produces the case; the
  operator decides whether a correction card follows.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the nine write-ups turn out not to record their promotion margins
consistently enough to build the table, stop and report which ones are missing
what. An incomplete table presented as complete is worse than no table.

## Verifier handoff

Attack the central argument. The claim "high autocorrelation means blur" is
plausible and may still be wrong — a sharp periodic pattern also has high
lag-1 autocorrelation. If the audit does not address that counter-case, it has
not made its argument, however confident the prose sounds.
