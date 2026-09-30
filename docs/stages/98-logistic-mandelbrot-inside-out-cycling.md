# Stage card 98-logistic-mandelbrot-inside-out-cycling: animate attraction contours across bulbs and sheets

## Metadata

- **Authored:** 2026-09-30
- **Orchestrator:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/98-logistic-mandelbrot-inside-out-cycling
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** Fable 5.1 works the bounded numerical/rendering integration at high effort, using the operator's greater available Fable session allowance. The card fixes the mathematical mapping and acceptance criteria in advance. Sol verifies at high effort across a different provider family, independently checking the numerical meaning, production shader paths, rendered output and regression evidence. Sol is preferred over Terra for the mathematical and visual judgement in these checks. No extra panel or parallel workers.

## Objective

Make Logistic Mandelbrot's existing Inside-out mode animate colours along attracting-bulb contours using the existing cycle-speed control, with matching interior ground colouring and no orbit-height contribution. Keep exterior colouring based on smooth escape time, so the picture communicates orbit behaviour rather than vertical position.

## Inputs (read these in your own context)

- `AGENTS.md`, `MODELS.md`, `docs/INTERFACE.md`
- `src/app/webglRenderer.ts`: `drawOrbit3d`, `ensureOrbit3dGround`, ground cache/texture lifetime, `palettePhase`, fractal escape-time shader
- `src/app/orbit3d.ts`: point/surface Inside-out branches, ground shader, `draw`, colour-mode and glow uniforms
- `src/app/orbitSampler.ts`: GPU attracting-cycle multiplier, returned metadata and CPU packing
- `src/sims/logistic-mandelbrot/model.ts`: `sampleAttractorCell`, `AttractorCellMeasure`, period detection and unresolved sentinel
- `src/sims/logistic-mandelbrot/kernel.ts`, `src/sims/logistic-mandelbrot/kernel.test.cjs`, `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
- `src/app/colormap.ts`, `src/app/simView.ts`, `src/app/controls.ts`
- `e2e/inside-out-cycling.contract.spec.ts`, `e2e/smoke.spec.ts`, `e2e/palette-sweep.spec.ts`, `e2e/harness/frame.ts`, `playwright.config.ts`
- `essays/logistic-mandelbrot.md`, `package.json`, `tsconfig.test.json`

Do not read anything else unless needed to resolve a named dependency.

## Deliverables

1. `src/app/webglRenderer.ts`: enable the shared signed time phase in Inside-out, including cache invalidation when changing colour mode; provide a cached, correctly classified interior attraction field for the ground. Use existing sampling primitives where practical. Rebuild numerical data only when its domain/sampling inputs change, never for time, palette, reverse or exposure. Release resources on replacement/destruction. Escape-time exterior colouring remains mathematical escape colouring.
2. `src/app/orbit3d.ts`: animate Inside-out in both cloud and hybrid surface shaders, and use the corresponding field for interior ground colour. Separate mode selection from the old `cycleBeam` flag where necessary so enabling Inside-out cannot accidentally select distance/height mapping. Retain hue through existing lighting without changing global tone mapping.
3. `src/sims/logistic-mandelbrot/kernel.ts` and `essays/logistic-mandelbrot.md`: correct the description from "escape depth" to attracting-cycle strength; explain cycling, stopping, band density, reversal and the bounded/unresolved case. Existing `inside-out` enum value stays valid.
4. `e2e/inside-out-cycling.spec.ts` (new, worker-authored): deterministic integration tests and evidence for criteria 2-6 below. Extend existing harness helpers rather than duplicate them. The frozen contract spec is an input and must remain unchanged.
5. `docs/audits/98-inside-out-cycling.md` (new): concise numerical method, measured error/timing, before/after evidence paths and each criterion's result; identify unresolved limitations explicitly. Screenshots and raw metrics go under ignored `e2e/artifacts/inside-out-cycling/` or Playwright `test-results/`, not tracked binary files.

Supporting changes are allowed only where necessary for these deliverables: `src/app/orbitSampler.ts`, `src/sims/logistic-mandelbrot/model.ts`, their existing tests, `src/app/simView.ts`, `src/app/controls.ts`, and `e2e/harness/insideOut.ts` (new test adapter). A small shared pure implementation module `src/app/orbitColour.ts` and its test/config inclusion are allowed if they avoid duplicating the actual calculation. Existing frozen assertions and frame metric helpers must not be weakened. State envelopes are dispatch infrastructure.

## Constraints

- This is one observable feature and one serial stage. No dependency gate: all implementation inputs already exist on dev. Recheck this before queueing if dev moves. Do not gate on historical stage 97's queue status: its card records direct implementation.
- Keep current default colour mode (`cycle`), Magma (cyclic), gamma 1.65, contrast 2.4, speed 0.1 and band density 1.5. This card makes Inside-out selectable and animated; a default switch awaits operator visual review.
- Preserve Cycle's existing distance-plus-height effect and Period/Mono behaviour. Do not modify orbit geometry, camera choreography, refinement, warmup/sample defaults, tone mapping or other simulations to make the colour tests pass.
- For a detected period-q attractor use `m = abs(product(2*z_j))`, the existing cycle multiplier. It is per complete cycle, not an iteration count or a period-normalised settling time. Zero denotes a superattracting centre; values approaching one indicate weak attraction. Do not claim a common convergence-time scale across different periods.
- Inside-out palette coordinate is `fract(k*m - phase)`, with `k = cycleBands` in laps per unit multiplier and `phase` from the existing signed time calculation. At a positive forward speed, a fixed colour travels towards increasing m, from the bulb centre towards its edge. Reverse changes phase direction exactly once; it must not also negate m and cancel the reversal. No height, Re(c), Im(c), or boundary-distance offset in this mode.
- At speed zero, phase is zero and colour is stationary. Stopping may return to the zero-phase colouring, consistent with the existing time calculation; phase-continuous stop/resume is out of scope. Cyclic palettes must wrap continuously; noncyclic palettes may have their existing endpoint seam, which must not be described as numerical structure.
- A cell with no detected period is unresolved, not evidence of a stable cycle or necessarily chaos. A clamped multiplier of one likewise does not certify attraction; treat it neutrally rather than inventing a settling rate. Give it a steady neutral treatment in Inside-out; do not interpret the current `interior = 1` sentinel as a measured multiplier. Escaped cells retain escape-time exterior colouring and no cloud points.
- Ground and sheets at the same c use the same classification, scalar definition, phase, palette and reversal. Brightness may differ because the ground is deliberately subdued. Do not promise continuous colour across the set boundary: interior attraction and exterior escape are different measures.
- Do not change the reviewed kernel-to-renderer contract shape. Renderer-internal texture metadata may change; if the public contract genuinely must change, stop and request a separate versioned card.
- No new packages, dependency reinstall, blanket formatting, commits by the worker, queue mutations, deployments or public publishing.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows. Build success or a changing phase uniform alone cannot satisfy a rendered criterion.

1. **Regression and frozen contract.** `npm run verify`; `scripts/check-contract-test-gate.sh --worktree`; `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1`; and `npx playwright test e2e/smoke.spec.ts --grep 'logistic-Mandelbrot|cyclic Magma|Magma|magma' --workers=1`. All pass with no skipped required cases. The frozen test requires a lit, stationary camera/geometry, visible temporal colour change in cloud and hybrid at speed 0.1, and stability at zero. Before implementing, run the frozen command on the unchanged production code and retain its expected animation failures as the baseline.
2. **Numerical meaning and classification.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'multiplier' --workers=1` exercises the production path. Check c=0 (period 1, m=0), c=0.1875 (period 1, m=0.5), c=-1 (period 2, m=0), c=-1.125 (period 2, m=0.5); absolute multiplier error <=0.01 on CPU and GPU paths. Add an off-axis analytic period-1 sample c=lambda/2-lambda^2/4 with lambda=0.3+0.4i (m=0.5). Test c=1 as escaped and c=-1.9 as bounded with no detected period under the existing sampler budget. Do not supply the expected multiplier as input to production sampling. Ground texel comparisons must account for actual texel-centre coordinates; snapping the expected scalar into the texture is forbidden.
3. **No vertical colour ramp.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'height independence' --workers=1` runs the production point and surface shader paths with isolated controlled geometry, equal multiplier/phase but different heights, and reads back their palette colours before lighting or compares normalised hue. Tolerance <=2/255 per palette RGB channel before lighting. Varying height must not move the palette coordinate; varying multiplier must. Shader source grep or a disconnected duplicate formula is insufficient. Verify two sheets over a period-2 point share hue in the real route as well.
4. **Phase, reversal and ground agreement.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'phase and ground' --workers=1` checks production renders at deterministic phases 0, 0.25, 0.5 and 1. Palette lookup agrees with the declared formula within 2/255 per RGB channel before lighting. Test both directions, cloud, hybrid, and interior ground; corresponding m=0.5 cells in period-1 and period-2 regions must agree. Phase 0 and phase 1 close the cyclic loop. Verify exterior output still depends on smooth escape time, not distance or multiplier; retain classification masks in evidence. Full-frame differences alone cannot prove this criterion.
5. **UI and lifecycle.** `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'controls and cache' --workers=1` selects Inside-out through controls, changes speed 0 to 0.1, reverses it, changes palette and bands, switches geometry, returns to Cycle, and resets. Check actual selected values and frames; no point-cloud rebuild for colour-only changes, no attraction-field recomputation every frame, no console/WebGL error, defaults restored. Record warm cache render timing and attraction-field construction time against the unchanged baseline on the same browser, quality and machine. A >20% sustained render-time regression across three matched samples requires explanation and verifier approval, never a hidden quality reduction.
6. **Visual and scope review.** Verifier opens before/after time sequences for cloud and hybrid, including a view of the ground and a period-2 bulb. Record whether contours originate around bulb centres, colour travels outwards in forward mode and inwards in reverse, sheets share hue vertically, the ground remains subdued, and the cloud retains readable colour. Record each judgement with literal artifact paths. Inspect `git diff` to confirm preserved defaults/legacy modes and accurate UI/essay wording. Missing browser evidence or any failed required judgement prevents PASS.

Run the entire new integration spec once as well: `npx playwright test e2e/inside-out-cycling.spec.ts --workers=1`. No required suite may pass with zero collected tests. The worker may add diagnostics tied to real production values; the verifier must trace them back to actual shader inputs/output and reject fabricated test-only values.

## Contract test

- **Test file:** e2e/inside-out-cycling.contract.spec.ts
- **Assertions digest:** `sha256:b3f8acd87e91fd566f4d3ade17bc362f8b9b5f4237261d5f88ebfe4a635973cb`

The whole contract body, including setup, frame capture and thresholds, is frozen. It proves actual animation and the zero-speed control, not the entire mathematical contract. Criteria 2-6 remain mandatory independent verification. The worker must not change this card, the frozen body, or `e2e/harness/frame.ts` to obtain a pass.

## Authoring verification

Baseline run on unchanged production code at dev `d40a1dfb4`, 2026-09-30:
`INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1`
collected four tests: speed-zero cloud/hybrid passed, speed-0.1 cloud/hybrid failed exactly at the positive colour-motion assertion. All four measured motion 0; lit-frame and stationary-camera/point-count checks passed. Runtime 44.2 seconds. This is the intended red baseline, not a completed implementation.

Copies of before/after frames and failure contexts are under ignored
`e2e/artifacts/inside-out-cycling/baseline/`; they are local evidence, not portable card inputs. The worker/verifier must reproduce their own baseline in the run worktree. Contract digest validation passed. Role-seat browser admission has not been exercised by this interactive browser run.

## Out of scope

- Making Inside-out the default; removing or redesigning Cycle; phase-continuous pause/resume.
- Lyapunov exponents, a new convergence-time solver, exact boundary classification, new geometry or performance redesigns.
- Other simulations, public interface changes, fleet configuration, provider routing, quota resets and release/deployment.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes
- Stop with an explicit partial result if the timebox cannot cover the remaining checks. A retry needs a re-brief; do not silently loop or substitute a same-family validator.
- Planning evidence: `state/cost-log.jsonl`, inspected 2026-09-30. Recorded nonzero usage: worker n=51, median 1,900,404 tokens, nearest-rank p95 8,431,105; verifier n=48, median 1,411,152.5, p95 5,498,589. Recent 30 records have role medians 2,793,887.5 and 2,038,406. Stage 96's visual audit used 2,905,393 + 2,116,031 = 5,021,424 tokens. These are mixed historical models/tasks and include cached inputs; they are planning proxies, not Fable/Sol-specific prices or promised usage.
- Plan about 5M accounted tokens for the pair. Historical maximum single-role outlier is 14,360,353; reserve about 19.4M for the run including one such outlier. The current inspected repo headroom is only 8,205,478, so the conservative allowance is not currently admitted. Recheck the live ledger/caps and operator's intended allocation before launching; this design changes no caps. Caps gate admission and do not guarantee an in-flight spend ceiling. No cash estimate from mixed subscription accounting.
- Serial only: one worker then its independent verifier; no overlap or two-dispatch headroom assumption. If using a temporary drain, set its expiry inside the UTC day in which it is opened and allow the full 150-minute role budget before that expiry. Use natural provider quota waits, not reset redemption, purchased credits or API fallback.

## Dispatch envelope

Design only: the operator requested cards to implement through Autometta. This session does not queue or launch the stage. Save the card and frozen spec together on dev before dispatch so both seats receive identical files. Intended queue command, from the repo root after admission:

```sh
autometta add-stage . docs/stages/98-logistic-mandelbrot-inside-out-cycling.md
```

Confirm the scoped queue's NEXT entry before handing control to the tick. Preflight actual worker and verifier seats for local Playwright WebGL2 launch and screenshot capture, using the repo's existing Chromium installation and macOS GPU flags. `Requires GUI: true` is declared for both seats but is not proof that either seat works. Quota and GUI admission remain launch-time checks, not claims of this design.

Worker returns changed paths, commands/results, numerical/cache decisions, evidence paths and unresolved criteria in `state/envelopes/98-logistic-mandelbrot-inside-out-cycling.json` using the current dispatch template. Verifier writes the schema-valid `state/verifiers/98-logistic-mandelbrot-inside-out-cycling.json`, with one result and literal evidence paths per numbered criterion. Overall PASS requires all six, including the visual review. The orchestrator alone commits/integrates to private dev after PASS; deployment is a separate operator action.

## Family-specific notes

Both roles use the repo's subscription CLI routes. Do not change auth routing to work around quota or browser failures. Resolve the named canonical model identities through the installed Autometta model resolver before admission; do not silently downgrade or substitute a family. Use the installed dispatch wrappers and their stdin/log handling, not handwritten agent commands.

## Re-brief 1 (2026-09-30, attempt 2)

Attempt 1 (Fable 5.1) completed nearly all implementation and is preserved at
`934f551700729ea706b5e1abf4b2d60c2ab2e495` on
`wip/98-logistic-mandelbrot-inside-out-cycling-attempt-1`. It stalled with no
dispatch envelope: its final turn launched the remaining test chain as a
background task and ended the turn to "wait for its completion notification".
Headless `-p` dispatch exits when the turn ends, so no notification arrives.

Attempt 2 instructions, in addition to everything above:

1. Start from the preserved work: `git checkout 934f551700729ea706b5e1abf4b2d60c2ab2e495 -- .`
   in the run worktree, then `git rm --cached test-results/.last-run.json`
   (and delete it) because it was swept into the WIP commit and must not ship.
   Do not re-implement from scratch; review the diff against the card and fix only
   what is wrong or missing.
2. **Run every command in the foreground and wait for it to exit.** Never use
   `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a
   command is outstanding. If a suite is slow, run it with a sufficient timeout.
3. The attempt-1 evidence under ignored `e2e/artifacts/inside-out-cycling/` was
   lost when the worktree was reaped. Regenerate the baseline and after evidence
   yourself; do not cite attempt-1 artifact paths.
4. Replace `SMOKE_PLACEHOLDER` in `docs/audits/98-inside-out-cycling.md` with
   real results, re-run all criterion 1-5 commands plus the full new spec, and
   update the audit's numbers from this attempt's runs.
5. Write the dispatch envelope before finishing, as the final action of your
   last turn. A partial result with a written envelope is better than none.
6. Budget: attempt 1 spent 21.2M tokens (97.8% cached input). Keep context
   lean: read files by range, do not re-read large files or dump full logs.
