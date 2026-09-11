# Stage card 59-sandpile-topple-conservation: conserve mass at any topple threshold

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Fable 5 <claude-fable-5@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/59-sandpile-topple-conservation
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** the fix is kernel physics with a numeric sweep gate —
  the heaviest reasoning in tonight's slate — so the Fable tier takes the
  worker seat (operator opened the Fable quota for heavy stages, 2026-08-24)
  and the Codex family verifies, cross-family. The verifier re-runs the
  Playwright sweep, hence Requires GUI for the codex seat.

## Objective

The 2026-08-23 sweep (`docs/sweeps/abelian-sandpile-interestingness.md`) found
that the sandpile kernel only conserves mass when `toppleThreshold === 4`. In
`step()` a toppling cell computes `bulk = floor(grains / toppleThreshold)`,
removes `bulk * toppleThreshold` grains, and adds `bulk` to each of four
neighbours — so every threshold above 4 destroys `(threshold − 4) * bulk`
grains per topple, the pile burns away, and 24 of 32 swept sets (and the
shipped "High threshold" preset, score 0.004) render a blank field. The UI
slider offers thresholds up to 12, so more than half its range is a blank
screen.

Fix the kernel so toppling conserves mass at every threshold the slider
offers, and show by re-sweep that "High threshold" comes alive.

## Inputs (read these in your own context)

- `docs/sweeps/abelian-sandpile-interestingness.md`
- `src/sims/abelian-sandpile/kernel.ts`
- `src/sims/abelian-sandpile/kernel.test.ts` (or the sim's existing test file)
- `src/app/presets.ts` (the three sandpile presets)
- `e2e/harness/sims.ts` (`ABELIAN_SANDPILE`), `e2e/sweep.spec.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/abelian-sandpile/kernel.ts` — a topple at threshold `h` removes
   exactly what it redistributes. The standard generalisation: remove
   `bulk * h` grains, give `floor(bulk * h / 4)` to each neighbour, and return
   the integer remainder (`bulk * h mod 4`) to the toppling cell so no grain is
   created or destroyed. If you choose a different conservative scheme, say why
   in the write-up.
2. A unit test asserting total grain count is invariant across `step()` for
   thresholds {4, 5, 6, 8, 12} (allowing only grains injected by
   `grainsPerStep`).
3. Re-run of the sandpile sweep with the fixed kernel; a dated appendix in
   `docs/sweeps/abelian-sandpile-interestingness.md` recording the new scores
   for the three shipped presets, "High threshold" especially.
4. `src/app/presets.ts` — retune "High threshold" only if the fixed kernel
   still leaves it weak; it must keep `toppleThreshold > 4` (a high threshold
   is the preset's identity). Carry the established delta comment form if
   changed.

## Constraints

- Do not change the metric stack or the sweep axes; this stage's evidence must
  be comparable with the 2026-08-23 run.
- Headless only; unattended; no operator input.
- Behaviour at `toppleThreshold: 4` must be bit-identical to today's kernel —
  the "Classic critical" and "Fast avalanches" presets are healthy and their
  recorded scores must reproduce.

## Acceptance criteria

1. `npm run verify` green.
2. The new conservation unit test passes for all listed thresholds.
3. `SWEEP=1 npx playwright test sweep.spec.ts -g "sweep abelian"` completes
   headless; "High threshold" scores with coverage > 0.05 and temporal flux
   > 0 (alive), against 0.001/0.0000 before.
4. "Classic critical" and "Fast avalanches" reference scores reproduce the
   2026-08-23 values exactly.
5. The write-up appendix records before/after scores for all three presets.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing the slider range, the metric, or any other sim.
- Merging to `dev` or `main`; deploys.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If a conservative kernel makes "High threshold" alive but ugly (a judgement
call), leave the preset params as shipped, record incumbent and candidate
scores in the write-up, and let the operator pick. The verifier judges the
numeric gate only.

## Verifier handoff

Re-run `npm run verify`, the conservation unit test, and the sandpile sweep;
confirm criteria 3–5 from the artefacts on disk. Judge numbers only.
