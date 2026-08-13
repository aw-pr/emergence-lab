# Stage card 31-sweep-preset-promotion: promote interestingness-sweep winners into presets

## Metadata

- **Authored:** 2026-08-13
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The mechanical work (read ranked sweep results, edit
  `src/app/presets.ts`, record metric deltas) is well-specified TS editing — a
  Codex worker fit. Whether a promoted regime is *actually* more interesting
  than the preset it displaces is an aesthetic judgement over the captured
  frames, so a frontier Claude tier verifies by looking at the artifact PNGs
  and the metric table, not just the diff.

## Objective

The interestingness sweep (`SWEEP=1 npx playwright test e2e/sweep.spec.ts`)
was run on 2026-08-13 against the current kernels. Its ranked results live in
`e2e/artifacts/<slug>/results.json` with per-candidate grayscale PNGs and a
`report.md` per sim (gray-scott, boids, lorenz-attractor).

For each swept sim:

1. Read `e2e/artifacts/<slug>/results.json`. Compare the top-ranked candidates
   against the sim's existing presets in `src/app/presets.ts` (the reference
   sets in the results carry the current presets' scores).
2. Where a swept candidate beats the best existing preset's composite score by
   a meaningful margin (>10%), promote it: add or replace a preset in
   `src/app/presets.ts`, named descriptively, with a comment recording the
   composite score delta and the sweep date.
3. Do NOT remove the sim's default preset. Cap promotions at 2 new presets per
   sim. If nothing beats the references, promote nothing for that sim and say
   so in the completion note.
4. Re-run the always-on metrics sanity test to confirm the harness still
   passes: `npx playwright test e2e/sweep.spec.ts` (without SWEEP=1).

## Acceptance command

`npm run verify` (typecheck + kernel tests + production build) green, plus
`npx playwright test e2e/sweep.spec.ts` green.

## Out of scope

- Changing kernels, the harness, metrics, or `SWEEP_CONFIGS` grids.
- Touching shelved sims (`SHELVED_SLUGS` in `src/app/registry.ts`).
- Any renderer or UI work.

## Verifier brief

Check the diff is confined to `src/app/presets.ts`. For each promoted preset,
open the corresponding artifact PNG under `e2e/artifacts/<slug>/` and confirm
the frame shows coherent structure (not washout, not noise), and that the
claimed score delta matches `results.json`. Confirm no default preset was
removed and the promotion cap was respected. Run the acceptance command
yourself outside the worker sandbox.
