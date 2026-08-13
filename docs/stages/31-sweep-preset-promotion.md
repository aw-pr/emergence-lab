# Stage card 31-sweep-preset-promotion: promote interestingness-sweep winners into presets

## Metadata

- **Authored:** 2026-08-13
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The mechanical work (read ranked sweep results, edit
  presets, record metric deltas) is well-specified TS editing — a Codex worker
  fit. Whether a promoted regime is *actually* more interesting than the preset
  it displaces is an aesthetic judgement over the captured frames, so a
  frontier Claude tier verifies against the artifact PNGs and metric tables,
  not just the diff.

## Objective

The interestingness sweep (`SWEEP=1 npx playwright test e2e/sweep.spec.ts`)
was run on 2026-08-13 against the current kernels. Promote swept parameter
sets that measurably beat the existing presets into `src/app/presets.ts`.
Headline finding to act on: lorenz-attractor's top candidates score 0.69-0.73
against the app default's 0.610. Gray-Scott gains are marginal (its June
promotions already lead). Boids found nothing beating the "Tight flock"
reference (0.040 vs 0.033 best swept) — promote nothing there.

## Inputs (read these in your own context)

- e2e/artifacts/lorenz-attractor/results.json (and report.md)
- e2e/artifacts/gray-scott/results.json (and report.md)
- e2e/artifacts/boids/results.json (and report.md)
- src/app/presets.ts
- e2e/harness/sims.ts (for how swept params map to kernel params)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. src/app/presets.ts — for each sim where a swept candidate beats the best
   existing preset's composite score by more than 10%, add (or replace a
   non-default) preset, named descriptively, with a comment recording the
   composite score delta and the sweep date 2026-08-13. Cap: 2 new presets
   per sim. Never remove or rename a sim's default preset. If nothing
   qualifies for a sim, change nothing for that sim and say so in the
   completion note.

## Constraints

- Only `src/app/presets.ts` may be modified.
- Do not touch kernels, the harness, metrics, `SWEEP_CONFIGS`, the renderer,
  or shelved sims (`SHELVED_SLUGS` in src/app/registry.ts).
- Preset param values must come verbatim from the swept candidate in
  results.json.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. `npx playwright test e2e/sweep.spec.ts` green (without SWEEP=1).
3. Diff confined to src/app/presets.ts.
4. Every promoted preset's params match a candidate in the corresponding
   results.json, the claimed score delta is correct, and the candidate's
   artifact PNG shows coherent structure (not washout, not noise).
5. No default preset removed or renamed; at most 2 promotions per sim.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Kernel, harness, metric, or UI changes.
- Shelved sims.
- Any push or publish-branch work.

## Budget

- **Worker wall-clock:** 30 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker reports, per sim: promoted preset name(s), source candidate id, score
delta vs the previous best preset, or "no promotion" with the reason.

## Family-specific notes

None
