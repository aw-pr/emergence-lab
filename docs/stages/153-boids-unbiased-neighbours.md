# Stage card 153-boids-unbiased-neighbours: remove the compass bias from Boids neighbour sampling

## Metadata

- **Authored:** 2026-11-04
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** GPT-6 Astra <gpt-6-astra@local>
- **Verifier:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Base branch:** dev
- **Run branch:** autometta/153-boids-unbiased-neighbours
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** the worker has real design work: unbiased sampling at unchanged cost that also keeps flocks fast and clumped, where the two obvious fixes each failed in scratch. That is frontier-tier judgement, and the operator said on 2026-11-04 that Codex tokens are plentiful and to use Astra for the heavy work and Fable only where it makes sense. Fable verifies because the deciding judgement is visual (does this read as flocks or as speckle) and the seat must be in the other family.
- **Open decisions:** none
- **Readiness:** see Readiness review.

## Surfacing concern

Every clump heading in sweep 152 (189 readings across 27 sets and 3 references) sits at about -2.03 rad, whatever the parameters. `src/sims/boids/kernel.ts` caps each boid at `NEIGHBOUR_LIMIT` (48) neighbours and always scans bins from `dr = -1, dc = -1`. In a dense flock the cap is reached inside the up-left cell, so cohesion, alignment and separation are all sampled from one side and the population drifts up and left. Sweeps 144 and 152 measured that artefact, and the operator rejected all four 152 presets (`docs/UAT/uat-preset-review.md`): flocks align to one heading and shrink into tight balls.

Scratch findings on 2026-11-04, on a copy of the kernel at 17777 boids on 960×600, using 152 finalist settings (maxSpeed 24, alignment 0.15, visual radius 36, cohesion 0.035, so not the kernel defaults the oracle uses):

| Variant | Heading agreement | Speed (of 24) | 8-unit cells occupied |
|---|---|---|---|
| Current kernel, 300 steps | 0.995 | 22.8 | 5% |
| Cap removed | 0.28 | 3.1 | 32% |
| Fair sampling, no speed floor | 0.23 | 2.6 | 60% |
| Fair sampling, speed floor 0.7 × maxSpeed | 0.99 | 20.4 | 47% |

Three things follow. The cap is holding the flock together by accident, so it cannot simply be lifted: `repelX` and `repelY` are sums, and `limitVector` has no lower bound, so an unbiased crowd stalls. With fair sampling plus a speed floor, flocks hold six distinct headings at 100 steps and are all aligned by 300, and the final heading follows the seed rather than the compass. So the one-heading outcome is **partly genuine alignment coupling**. This card removes the bias only; keeping separate headings for longer is a search on the corrected kernel in a later sweep card. Finally, the scratch reference spreads much wider than the current tight balls and was never viewed, so the clumped look is unproven and is a judged criterion here.

## Objective

Make neighbour sampling free of any compass direction at no worse step cost, keeping flocks fast and visibly clumped at the existing parameter defaults. Step cost may rise by at most 15% (criterion 4). No parameter, default, preset or interface changes.

## Visual goal

The operator's words on the rejected shortlist: "when i said different directions i meant each bunch starts in a different direction", and "shrinks oddly". At the defaults with `obstacleLayout` none the opening frames should show separate flocks crossing in their own directions, and later frames should show coherent flocks with visible hulls.

- Shape reference: `docs/images/sweeps-2026-10-30/144-app-boids-144-current-balanced-flock-shipped-17777-t880-app.png`, dense, elongated, coherent bands with clear hulls.
- Failure reference: `docs/images/sweeps-2026-10-30/144-app-boids-144-boids-alignment0.25_cohesion0_initialFlocks12-shipped-17777-t880-app.png`, a near-uniform speckle. Anything that reads like this fails whatever the test says.
- Also a failure: tiny tight balls with hard straight edges, as in the 152 frames under `docs/images/sweeps-2026-11-03/`.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`: `computeForcesBinned`, `applySteer`, `limitVector`, `seedClusteredBoids`, `NEIGHBOUR_LIMIT`, `WANDER_STRENGTH`, `hashAngle`
- `src/sims/boids/kernel.test.cjs`: existing behaviour and `selfTest`
- `src/sims/boids/neighbourSampling.contract.test.cjs`: the frozen oracle (read, never edit)
- `docs/sweeps/boids-interestingness.md`: the 2026-11-03 section
- `docs/UAT/uat-preset-review.md`: the operator verdicts
- `docs/INTERFACE.md`: the `SimKernel` contract, which must not change
- `docs/audits/2026-11-04-boids-153-reference.patch`: the throwaway reference as a diff; read it, do not apply it wholesale (it reads `process.env` and allocates per step)

## Deliverables

1. `src/sims/boids/kernel.ts`: unbiased neighbour sampling in `computeForcesBinned`, and whatever steering change that needs so flocks stay fast and clumped. Everything stays deterministic from the seed: use `hashAngle` or an equivalent hash, never `Math.random`. New tuning values are module constants, not parameters.
2. `src/sims/boids/kernel.test.cjs`: additive tests for any new helper or constant, kept fast enough for `npm run verify`.
3. `docs/sweeps/boids-interestingness.md`: a `## 2026-11-04 — unbiased neighbour sampling (stage 153)` section recording the change, the readings in the Dispatch envelope, and a plain statement that the stage-144 and stage-152 Boids readings predate it and stay as historical evidence.

A reference that passed the oracle, as a starting point and not a required design: bins flattened by counting sort, up to 12 candidates per cell across all nine cells from a hash-chosen offset with no accepted-neighbour cap, and speed raised to at least 0.7 × `maxSpeed` after `limitVector`. It spreads wider than the Visual goal wants; a finer pass for separation is one untested idea for holding hulls.

## Constraints

- Work from current `dev`. Only the paths in Path claims change. `src/app/**`, every preset, and `particle-life` stay untouched.
- `paramSchema` keys, types, defaults and ranges stay exactly as they are; `SimKernel` shape stays exactly as it is.
- The fields `x`, `y`, `vx`, `vy` and the `initialFlocks` assignment of boid `i` to flock `i % count` stay, because the oracle reads them.
- Step cost: at most 15% over the base, by criterion 4. The current kernel takes about 28 ms per step on this machine.
- Below `BINNING_MIN_BOIDS` (256) behaviour stays byte-identical, because `computeForcesBrute` has no compass bias and shares `applySteer` with the binned path and an existing byte-exact fixture covers it. Any steering change such as a speed floor applies to the binned path only.
- Do not chase separate headings past 100 steps by tuning defaults. That is the later sweep's question.
- Keep "session limit", "usage limit", "rate limit" and "429" out of any envelope prose.

## Acceptance criteria

1. Worker and verifier: `npm run verify` exits 0.
2. Worker and verifier: `npm run build:test && BOIDS_153=1 node --test src/sims/boids/neighbourSampling.contract.test.cjs` passes all six tests with no skips, with `BOIDS_153_KERNEL` unset, and `scripts/check-contract-test-gate.sh print src/sims/boids/neighbourSampling.contract.test.cjs` prints the digest recorded below. Baseline at the card's commit: three fail (c1 net drift 0.136, c2 seed resultant 0.993, c4 flock resultant 0.999), three pass.
3. Worker and verifier: readings table in the report at 960×600 for 17777 boids, defaults with `obstacleLayout` none, seeds 0 to 2, at 100, 300 and 600 steps: global heading agreement, final heading, mean speed, and share of 8-unit cells occupied. Definitions: agreement is the length of the mean unit velocity; final heading is `atan2` of that mean; occupied share is distinct `(floor(x/8), floor(y/8))` pairs over 120×75. Use `init(960, 600, ...)` and `step(1)`. Reported, not thresholded; the verifier recomputes at least one seed.
4. Worker and verifier: mean step time at 960×600 and 17777 boids over steps 101 to 200, defaults with `obstacleLayout` none, `init(960, 600, ...)`, seed unset, `step(1)`, in one Node process per kernel, median of three runs, on the base kernel and the new kernel on the same machine. The new kernel must be no more than 15% slower.
5. Verifier: at an isolated port with cleared storage and a 1280×800 viewport, open `#/boids`, set the layout to none, press Clear boulders, and capture frames at about 5, 15, 30 and 60 seconds at the default speed, on two page loads (the app seeds randomly, so one load proves little). Judge them against the Visual goal in kind: PASS needs distinct flocks in the opening frames and coherent flocks with visible hulls later, neither of the two failure looks. Retain the frames and say which reference each is closest to.
6. Verifier: no console errors in that run, and the frame rate over the same 60 seconds is reported beside a reading from the base commit in the same viewport.
7. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims.
8. Operator: looks at it on `dev`. A verifier PASS accepts the change on `dev` only; `main`, labs and the public mirror stay out.

## Contract test

- **Test file:** src/sims/boids/neighbourSampling.contract.test.cjs
- **Assertions digest:** `sha256:9a2f256bb06255524d57498306881f47ad8499013f628b0f5fb71373aa28edb5`
- **Oracle proof:** On the base (`c4d5a02e0`) `BOIDS_153=1 node --test` ran 6 tests: 3 failed (c1 net drift 0.136 over 0.1; c2 seeds share a heading at 0.993 over 0.7; c4 seed 0 flocks share a heading at 0.999 over 0.75) and 3 passed (c3 speed, c5 reproducibility, c6 schema, which are regression guards and correctly green). A throwaway scratch reference (described under Deliverables, loaded through `BOIDS_153_KERNEL`) passed 6 of 6, before two test titles were reworded with no assertion change. It is saved as `docs/audits/2026-11-04-boids-153-reference.patch`, is not in the dispatch baseline and is not delivered. Limitation: the reference was not judged against the Visual goal, so criterion 5 has no positive proof.

The frozen block covers steering isotropy on a still crowd, seed-dependent settling, speed at the default population, per-flock headings at 100 steps, seed reproducibility, and the schema and state layout. Step cost and the look are not in the block; criteria 4 and 5 judge them from their commands. The kernel path override is used only for the reference proof and must stay unset for criterion 2.

## Path claims

Implementation claims: `src/sims/boids/kernel.ts`, `src/sims/boids/kernel.test.cjs`, `docs/sweeps/boids-interestingness.md`. Evidence, untracked: `e2e/artifacts/153-boids-unbiased-neighbours/`. Orchestrator-owned and frozen: this card, `src/sims/boids/neighbourSampling.contract.test.cjs` and `docs/audits/2026-11-04-boids-153-reference.patch`.

## Operator decisions (2026-11-04, orchestration chat)

1. This card may change how Boids behaves on `dev`, including the current default look. Accepted ("yes write the card and queue it behind 145"), after being told nothing here goes to `main`.
2. Seats: "we have a load of codex tokens so use astra for the heavy work and fabel only where it makes sense". Astra worker; Fable verifier for the visual judgement.
3. Fix first, then look, then a new sweep. The earlier idea of a second sweep on the current kernel is dropped.

## Out of scope

Separate headings past 100 steps; new parameters; default or preset changes; the Boids thumbnail (regenerate after the operator's look, not before); a re-sweep; re-scoring sweeps 144 or 152; `particle-life`, which has its own `NEIGHBOUR_LIMIT` of 64 with a similar early exit and is a separate question; obstacles; `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** no Astra kernel card is directly comparable; the 137 to 152 cards ran 0.8M to 8M worker tokens. Plan 12M cached-inclusive tokens for the pair, no automatic retry.

## Escalation

If unbiased sampling cannot meet criterion 2 and criterion 5 together inside the step-cost limit, stop and report the best variants with their readings and frames; that is a finding for the operator, not a reason to relax a criterion or change defaults. If WebGL2 cannot start, record the error and stop.

## Dispatch envelope

Report every command and exit, the criterion 3 table, the criterion 4 timings, the design chosen and the alternatives tried, any new constants with their values, the `git diff --name-only` against the base, and anything not done.

## Family-specific notes

Criterion 2 runs in plain Node. Browser work needs headless Chromium with `--use-angle=metal --enable-gpu` (already in `playwright.config.ts`). Do not use port 5173 or 5190; pick an isolated port and stop only your own server. The Boids default layout is reef, so criteria 3 to 5 set `obstacleLayout` none, and any dropped boulders in storage must be cleared first.

## Verifier handoff

Re-run criteria 1, 2 and 4 yourself, recompute one seed of criterion 3, then judge criterion 5 from your own frames against both failure references. A green oracle does not decide the look. Run the scope check last.

## Readiness review

Base is the dispatch tip of `dev` after 145 lands; 145 touches only sweep files, so the readings below hold. Baseline at `c4d5a02e0` (clean `dev`, 145 running in its own worktree): `npm run verify` evidence reused from 151's verifier PASS at `8cda459a4`, since `src` is unchanged since then and this card adds only an opt-in test file; oracle baseline in Contract test above. Claims closure: `NEIGHBOUR_LIMIT` is used only inside each kernel; nothing outside `src/sims/boids` reads the Boids sampling internals; the `e2e/sweep-14*` and `152` contract specs are opt-in; they pin configs and historical data, and 144's also hashes production source, so it already fails on later trees and stays historical.

Cold read: GPT-6.1 Sol via `codex exec --sandbox read-only` on 2026-11-04 (62k tokens). Folded in: base at dispatch tip; the 15% limit stated consistently; brute path byte-identical; exact bench, metric and browser procedures; the gate command swapped for a digest print, because `--worktree` exits 2 on a clean tree; c4 and c6 titles corrected to what they prove; the 144 source hash; the scratch table labelled with its settings; the reference saved as a patch. Accepted as limits, not fixed: c1 cannot rule out opposing biases that cancel, c2 can pass on a disordered crowd, and c4 does not prove spatial separation. Criteria 3 and 5 cover those by reading and by eye.

Preparation spend: about 60 minutes of orchestrator time, over the 15-minute checkpoint. Justified because the scratch runs reversed the card's premise: the first draft would have promised separate headings that the kernel fix cannot deliver.
