# Stage card 166-boids-fine-schools-opening: Boids opens on small radii and light alignment, sized per device tier

**DROPPED 2026-11-13. The operator looked at the imported presets and rejected them all ("fades to nothing"); the rethink is seeding, flocking and possibly GPU stepping. Kept only as a record of the sweep's numbers.**

## Metadata

- **Authored:** 2026-11-13
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local> (proposed)
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local> (proposed)
- **Base branch:** dev
- **Run branch:** autometta/166-boids-fine-schools-opening
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** a handful of constants, one tier-override function and regenerated test fixtures, so a coding-tier Codex worker; acceptance is visual, so the verifier is the Claude seat that reads frames against the Visual goal. No frontier seat and no Astra: the look itself is the operator's, recorded before queueing.
- **Open decisions:** three, see below. The card is not ready until they are answered.

## Open decisions (operator)

1. **Does Fine schools pass your look, on each tier?** Import `docs/sweeps/data/2026-11-13/boids-flow/boids-flow.presets.json` on the Presets page (12 entries, "Boids flow · <tier> <rank> · <name>", two references per tier for A/B). If you prefer another row (desktop 2 "Fast, eleven flocks", desktop 3 "Current radius, weak alignment", phone 2 "Wide swirl"), this card's numbers change to that row. If nothing beats today's opening, this card is dropped.
2. **One literal recipe on all tiers, or the phone variant?** The sweep's phone pick differs slightly (separation radius 9, separation 0.326, speed 26). The literal desktop and tablet set has not been run on the phone grid. Recommended: one recipe everywhere, with a phone re-run as part of this card's preparation.
3. **Card the kernel follow-up (167)?** See "What this card cannot do". Recommended: yes, and treat 166 as the interim opening.

## Surfacing concern

The operator, 2026-11-13: "I think maybe the large visual and spatial radius destroys the effect a little on smaller screens and can be a bit clunky with that many boids ... I like the colourful flowing patterns that keep chaotic as long as possible; by colourful I really mean flocking direction indication ... big boids do look great on a big screen but they feel a bit low res."

The 2026-11-13 flow sweep (`docs/sweeps/boids-interestingness.md`, section "2026-11-13 - flow sweep"; harness `scripts/sweep-boids-flow.mjs`) measured this on each tier's real grid (desktop 1707x960, tablet 768x534, phone 390x844) at the app's own step size:

- Today's opening (28000 boids, visual 14, separation radius 27, alignment 0.09) is one shared heading, a grey lattice, by about 60 s on every tier (global heading order 0.92 to 0.99).
- A separation radius above the visual radius pushes every visible neighbour apart. That gives the even, coarse spacing read as "low res", and alignment then sweeps it into one heading.
- Alignment strength matters most. Large radii hurt the small grids: Scatter's radius 24 holds 60 s on desktop and 20 s on tablet and phone.
- The pre-2026-11-05 defaults (17777, visual 25, separation radius 8) clump into a few balls and collapse; they are not the answer either.

## Objective

Make the "Fine schools" recipe the Boids opening on every tier: visual radius 5, separation radius 8, alignment 0.015, cohesion 0.018, separation 0.19, max speed 24, 9 initial flocks, point size 4, with the opening count following grid density (28000 desktop, 9750 tablet, 7750 phone). Shipped presets, kernel behaviour and the renderer are unchanged.

## Visual goal

Operator's words above. Reference images, to be copied to `docs/plans/assets/166/` at queueing (the sweep images are git-ignored): the desktop, tablet and phone contact sheets `docs/images/sweeps-2026-11-13/boids-flow-sheet-<tier>.jpg`.

- Target: at 60 s of app time a fresh load shows three or four heading colours in flowing patches on every tier, where today's opening is a single-colour lattice; grain inside the schools is tighter than today's.
- Failure: one shared heading by 60 s, tight balls, uniform confetti speckle, or frozen bands. "Numbers pass but the frames show one of these" is a FAIL.
- Known weaknesses the operator accepted by answering decision 1 (do not fail the card on them): dark sparse voids covering up to half the screen between about 20 and 60 s; muted blue, white and maroon rather than the full palette; collapse towards one or two headings by about 150 s on two of three seeds.

## Deliverables

1. `src/sims/boids/kernel.ts`: the `DEFAULT_*` constants to the recipe (count stays 28000; flocks 8 to 9; visual 14 to 5; separation radius 27 to 8; max speed 36 to 24; alignment 0.09 to 0.015; cohesion 0.011 to 0.018; separation 0.22 to 0.19). No other kernel line.
2. `src/app/qualityProfiles.ts`: `tierParamOverridesFor` returns `{ boidCount: 9750 }` on tablet and `{ boidCount: 7750 }` on phone; comment updated to the measured density (about 0.024 boids a cell).
3. `src/app/qualityProfiles.test.cjs` and `src/sims/boids/kernel.test.cjs`: expectations and trajectory fixtures regenerated for the new defaults; binned-geometry tests keep their pinned radii.
4. `docs/sweeps/boids-interestingness.md`: one closing line under the 2026-11-13 section recording the promotion.

## Constraints

- `src/app/presets.ts`, `src/app/trialPresets.ts`, the renderer, palettes and every other sim are untouched.
- `public/thumbnails/boids.png` stays (a captured frame; regenerating it is a separate question).
- Frozen oracles that pin older Boids defaults (`neighbourSampling.contract.test.cjs`, `openingDefaults.contract.test.cjs`, `shippedPresets.contract.test.cjs`) go or stay red under their own flags; do not edit them.

## Acceptance criteria (to be finalised with the oracle)

1. `npm run verify` exits 0 (base 2026-11-13: 516 tests, 433 pass, 0 fail, 83 skipped).
2. The frozen oracle passes: schema defaults equal the recipe; `tierParamOverridesFor` returns the three counts; shipped Boids presets are byte-identical.
3. Verifier, offline: `scripts/sweep-boids-flow.mjs` on each tier grid, seeds 0, 1, 2 and one unused seed: global heading order at 60 s is below 0.5 on at least three of four seeds per tier (today: 0.92 to 0.99), and uncontended ms per step is no higher than today's opening on that tier (today 19 to 22 desktop, 4.7 to 5.0 tablet, 3.2 to 3.3 phone).
4. Verifier, browser, each tier's emulation with cleared storage: fresh load reads the recipe's values and the tier's count; retained frames at 20, 60 and 150 s judged against the Visual goal.
5. Scope: only the four deliverable paths plus fixtures.
6. Operator look on desktop, iPad and phone after landing, recorded in `HANDOFF.md` before any further Boids card.

## Contract test

Not authored. To be written and frozen (autometta-oracle) once decisions 1 and 2 fix the numbers.

## What this card cannot do

The sweep's judges and its skeptic agree this is a delay, not a fix. Stated plainly so the look is judged against the right expectation:

- **Nothing lasts.** No parameter set on any tier kept many headings for 3 minutes on all seeds. Fine schools holds about 60 to 75 s (worst seed) against 10 to 20 s today; on tablet and phone about 30 to 60 s. A fresh seed gave 45 s on tablet.
- **Frame rate changes the picture.** Steering is applied once per rendered frame and is not scaled by the time step, so a 120 Hz iPad collapses in half the wall time, and today's desktop (about 32 fps at 28000 boids) behaves differently from the 60 steps a second the sweep assumed. Fine schools is about 1.6 times cheaper per step on desktop, so it will run faster and collapse sooner in seconds than the sweep's figures.
- **"Low res" is mostly the grid.** The glyph cannot go below 2 cells radius (point size minimum 4), which is about 6 CSS px on a 2560 wide screen. Spacing between boids is not reliably finer than today across seeds (6.83 to 6.93 against 6.87 to 7.59 CSS px on desktop).
- **Today's 20 s frame is still the best single picture.** No candidate keeps that full-screen ribbon look and also lasts.

Proposed card 167 (kernel, not written): scale steering by the time step so the look is the same at 30, 60 and 120 Hz; add a mechanism that keeps heading variety alive (stronger or spatially correlated wander, or a limited field of view); and allow a smaller glyph or a finer Boids grid on large screens. That is a behaviour change to the kernel, not to the `SimKernel` interface shape.

## Out of scope

Shipped Boids presets, obstacle layouts, palette or dimming changes, the thumbnail, any kernel behaviour change, committing the git-ignored sweep evidence.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** card 162 (two default constants, same shape) cost about 5M tokens for the pair; plan one median pair plus the offline re-runs, about 8M.

## Readiness review

Not ready. Outstanding: the three operator decisions; the phone re-run of the literal recipe; reference images copied out of the ignored path; the frozen oracle and its red and green proof; a cold read by the other family; card-lint under `--strict`.
