# Stage card 61-cyclic-ca-crystal-rescue: fine von Neumann pass for Crystal lattice

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/61-cyclic-ca-crystal-rescue
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** same shape as stage 60 — a narrow follow-up sweep on
  the existing harness, Codex worker, Claude verifier, cross-family. Worker
  drives Playwright, hence Requires GUI.

## Objective

The 2026-08-23 sweep (`docs/sweeps/cyclic-ca-interestingness.md`) found the
"Crystal lattice" preset (states 12, threshold 2, vonNeumann) frozen solid:
score 0.283, temporal flux exactly 0.0000. Every von Neumann set the sweep
tried at threshold ≥ 2 froze, but the sweep never sampled `states: 12` itself
and its von Neumann coverage was coarse. This card runs the finer pass the
escalation asked for: states 10–16 × threshold {1, 2} on von Neumann, to
either find a live crystalline regime or prove none exists in that
neighbourhood.

## Inputs (read these in your own context)

- `docs/sweeps/cyclic-ca-interestingness.md`
- `e2e/harness/sims.ts` (`CYCLIC_CA`), `e2e/sweep.spec.ts`
- `src/app/presets.ts` (the "Crystal lattice" preset)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A sweep pass with axes `states ∈ {10, 11, 12, 13, 14, 15, 16}` ×
   `threshold ∈ {1, 2}`, neighbourhood pinned to vonNeumann, other settings
   identical to the 2026-08-23 `CYCLIC_CA` config. 14 sets, all recorded.
2. A dated appendix in `docs/sweeps/cyclic-ca-interestingness.md` with the
   ranked table and, for each set, whether it is alive (flux > 0) or frozen.
3. `src/app/presets.ts` — promote "Crystal lattice" only if a set exists with
   temporal flux > 0.01, spatial autocorrelation > 0.5, and `threshold: 2`
   or `states` within 10–16 at threshold 1 that is visually distinct from
   "Demons" (states 14, thr 1 — its exact twin does not count as distinct).
   Carry the delta comment form. Otherwise promote nothing and follow
   Escalation.

## Constraints

- Metric stack unchanged; scores comparable with the 2026-08-23 run.
- Headless only; unattended.
- Do not touch "Demons" or "Turbulence" (already promoted at stage 57).

## Acceptance criteria

1. `npm run verify` green.
2. The fine pass completes headless; the appendix records all 14 sets with an
   alive/frozen verdict each.
3. Re-running one recorded set reproduces its four metric scores exactly.
4. Either "Crystal lattice" is promoted to a set meeting the gate in
   deliverable 3, or the appendix records the escalation with the best
   candidate and incumbent side by side.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Moore-neighbourhood sets; kernel changes; metric changes; merging; deploys.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If every set at threshold 2 freezes and the only live sets are Demons
lookalikes, promote nothing. Record the three operator options from the
2026-08-23 escalation (accept a Demons-like replacement, drop the preset, or
widen the search again) with the evidence for each. The operator picks.

## Verifier handoff

Re-run `npm run verify` and the fine pass; confirm reproduction of one set and
that the appendix covers all 14. Judge numbers only; the "visually distinct
from Demons" call, if promotion happened, goes to the operator per Escalation
— flag it in the handoff rather than deciding it.
