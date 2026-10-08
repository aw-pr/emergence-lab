# Stage card 96-cycle-palette-sweep-audit: attack the cycle-palette sweep's numbers and its argument

## Metadata

- **Authored:** 2026-09-19
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/96-cycle-palette-sweep-audit
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Requires GUI:** true
- **Path claims:** docs/audits/2026-09-20-cycle-palette-sweep-audit.md
- **Dispatch:** serial
- **Pairing rationale:** the sweep, its metric, its analysis and the
  cycle-mode render fix (card 97, worked directly) were all written by one
  Claude session on 2026-09-19, so the family that wrote them must not be
  the family that checks them. Sol works it because the job is to reproduce
  numbers and break an argument. `Requires GUI` widens the codex sandbox so
  the worker can run the headless GPU browser sweep itself; that is the
  one browser-dependent deliverable here and the operator confirmed the
  codex seat can drive the GPU as of 2026-09-20. Opus 5 verifies: same family as the author
  but a different model with none of this in its context, and the gate is
  "does the audit's arithmetic hold and did it engage the counter-cases",
  which is a reading task. The aesthetic pick stays with the operator per
  Escalation; no seat here decides a palette.
- **Type:** Audit. No code change, no metric change, no preset change.

## Surfacing concern

`docs/plans/2026-09-19-logistic-mandelbrot-colour-field-review.md` argues
that a bulb changes colour in Cycle mode because the band wavelength
(1/`cycleBands` c-units, 0.67 at the shipped 1.5) is wider than any bulb's
depth, and quotes the cardioid's maximum interior distance as "roughly 0.4"
and the period-2 disc's as 0.25. The first number was estimated, not
measured. If it is wrong the recommendation on `cycleBands` is wrong.

`scripts/sweep-cycle-palette.mjs` ranks palettes on a composite of six
hand-chosen preference ranges. The ranges encode the operator's brief as one
session read it. Whether the ranking is robust to those choices, or whether
the top table is an artefact of where the ranges were placed, has not been
tested.

`docs/sweeps/logistic-mandelbrot-palette-cycling.md` records browser-frame
metrics from `e2e/palette-sweep.spec.ts` before and after the card 97
render fix, and its appendix claims cloud chroma doubled and the sheets
still read as stacked light. Those frames were captured once, and the
visual judgement was the author's own. Nobody outside the authoring family
has run the sweep on the landed tree.

## Inputs (read these in your own context)

- `docs/plans/2026-09-19-logistic-mandelbrot-colour-field-review.md`
- `docs/sweeps/logistic-mandelbrot-palette-cycling.md`
- `scripts/sweep-cycle-palette.mjs`
- `e2e/harness/frame.ts`
- `e2e/palette-sweep.spec.ts`
- `docs/stages/97-orbit3d-hue-preserving-tonemap.md`, the Outcome section
- `src/app/orbit3d.ts` lines 150-200 and 540-580 (the cycle band formula)
- `src/app/orbitSampler.ts` `boundaryDistanceField`
- `src/sims/logistic-mandelbrot/model.ts` (`sampleAttractorCell`, domain constants)

## Deliverables

1. A dated audit under `docs/audits/` that opens with a verdict on each of
   three claims: (a) the cardioid and period-2 disc interior depths, (b)
   the robustness of the offline ranking, (c) whether the browser-frame
   conclusions follow from the recorded numbers.
2. **Measured interior depths.** Sample the c-plane escape mask on a grid
   of at least 512×512 over the model's domain using `sampleAttractorCell`
   with the kernel defaults, run `boundaryDistanceField` on it, and report
   the maximum chamfer distance in c-units inside the cardioid and inside
   the period-2 disc. State the grid, the warmup and the cell scale used.
3. **Ranking robustness.** Re-run `node scripts/sweep-cycle-palette.mjs` and
   confirm its `report.md` reproduces the committed write-up's top table.
   Then perturb each preference range's centre by ±20% one at a time (six
   ranges, twelve runs, via a copied script under `e2e/artifacts/`, not by
   editing the committed one) and report how many of the committed top ten
   distinct ramps survive in the top ten under each perturbation. A ramp
   that survives all twelve is robust; one that drops out under a single
   perturbation is an artefact of that range.
4. **Browser sweep re-run on the landed tree.** Run
   `PALETTE_SWEEP=1 npx playwright test palette-sweep` headless (the repo's
   Playwright config carries the GPU flags) and tabulate your
   `browser-report.md` static and travel numbers beside the write-up's
   appendix table. State whether the appendix's claims (chroma roughly
   doubled on the cloud, white clip down, travel up, no neon) reproduce
   within 10%, and name any that do not. Then look at your own
   `frames/magma-k1-8-b5.png` and `frames/rosewood-b5.png` and answer card
   97's criterion 5 in words: do the sheets still read as stacked light, does
   the chaotic band still glow brighter than the periodic sheets, and is the
   palette's hue visible on the cardioid sheet.
5. The one counter-case the verifier will look for: a palette that scores
   well on every offline term and would still look bad on the cloud, or
   the reverse. Say whether the offline metric can see it and why.

## Constraints

- No change to `scripts/sweep-cycle-palette.mjs`, `e2e/harness/frame.ts`,
  `src/app/colormap.ts` or any preset. The perturbation runs use a copy.
- Run the browser sweep headless against a dev server you start yourself;
  never attach to the operator's Chrome. If the sweep cannot obtain a GPU
  context (the canvas reports `orbit3d-fallback-field`), stop and report
  that as the finding for deliverable 4 rather than scoring software frames.
- Every number in the audit is either reproduced by a command you ran and
  quote, or cited to a committed file and section. No estimates.
- Do not choose a palette. If the audit finds the ranking unsound, say so
  and stop at that finding.

## Acceptance criteria

1. `npm run verify` green: nothing should change, so this checks nothing did.
2. `scripts/check-contract-test-gate.sh --worktree` reports its exit code and
   message verbatim, with one sentence naming which of the three outcomes
   (real pass, nothing to inspect, real violation) it was. For a card whose
   claims are one document, "nothing to inspect" is the expected outcome.
3. The audit's first paragraph takes a position on all three claims.
4. Deliverable 2 gives two measured depths with the grid and scale stated.
5. Deliverable 3 gives a twelve-row table, one per perturbation, with the
   survival count for each.
6. Deliverable 4 gives the re-run's numbers beside the appendix's, a
   reproduce-or-not verdict per claim, and the three visual answers in words.
7. Deliverable 5 names a concrete counter-case, not a category.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing the metric, its ranges, or the composite form.
- Changing any shader or renderer code, whatever deliverable 4 finds.
- Promoting, demoting or renaming any preset.
- Changing the shipped default palette, gamma or contrast.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

The palette the lab ships is the operator's decision, made from the write-up's
contact sheets. This card informs that decision and does not make it. If the
measured depths differ from the estimate by more than 25%, say so in the
first paragraph so the operator re-reads the `cycleBands` recommendation
before choosing.

## Verifier handoff

Attack deliverable 3 first: a survival table is easy to fill in with
plausible numbers. Pick two perturbations, re-run them yourself from the
worker's copied script, and confirm the counts. Then deliverable 4: the
three visual answers must be the worker's own reading of its own frames,
not a paraphrase of the appendix; if the wording tracks the appendix, open
the worker's frames yourself. Then attack deliverable 5:
"a rainbow palette" is a category, not a counter-case; the audit needs a
specific ramp and a reason the metric misreads it.

## Family-specific notes

- The sweep script imports `src/app/colormap.ts` directly; Node 22.18+ strips
  types at import, so `node scripts/sweep-cycle-palette.mjs` runs as is.
- `e2e/artifacts/` is git-ignored. Perturbation copies, the sweep re-run's
  output and its frames go there and are not committed; the audit quotes
  their numbers and names the frame paths.
- Headless Chromium on this machine needs `--use-angle=metal --enable-gpu`,
  already set in `playwright.config.ts` on darwin; the sweep takes about
  three minutes and starts the Vite dev server itself on port 5173.
- `docs/INTERFACE.md` and the kernel contract are untouched by this card.
