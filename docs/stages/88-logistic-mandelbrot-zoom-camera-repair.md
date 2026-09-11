# Stage card 88-logistic-mandelbrot-zoom-camera-repair: make the zoom go where you point it and stay there

## Metadata

- **Authored:** 2026-09-10
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/88-logistic-mandelbrot-zoom-camera-repair
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 87-logistic-mandelbrot-zoom-diagnostic
- **Path claims:** src/app/orbit3d.ts, src/app/fractalCanvas.ts, src/app/renderer.ts, src/app/webglRenderer.ts, src/app/rendererBackend.ts, src/app/simView.ts, e2e/smoke.spec.ts
- **Pairing rationale:** cross-family, worker chosen for the task. This is
  interaction plumbing across five files with a live camera invariant to hold,
  which is the software-engineering shape Astra is the frontier seat for. The
  verifier is Claude because acceptance is partly "does the picture do what the
  gesture asked", and a Claude seat can drive Chromium on this machine where a
  Codex seat cannot. `Requires GUI: true` on this card is for the verifier.
- **Type:** Interaction repair with a regression test.
- **Serialises with:** card 90, which also claims `src/app/orbit3d.ts` and
  `src/app/webglRenderer.ts`. 88 lands first. Card 89 claims a disjoint set and
  may overlap this one; see the landing policy below.

## Surfacing concern

Card 87 measured the zoom. This card fixes what it found. Three defects are
believed independent and all three are on the path between a scroll gesture and
what the user sees. Card 87's ranked list is the authority on which of them
matter most; where this card and that audit disagree, the audit wins and you
say so.

- **The camera does not keep the distance you set.** `syncCameraToSweep`
  (`src/app/orbit3d.ts:1255-1280`) drives `this.camera.distance` toward a
  choreographed value, and `pauseOrbit3dAutoRotate`
  (`src/app/renderer.ts:676`) only holds it off for
  `ORBIT_AUTO_ROTATE_RESUME_SECONDS = 4` (`src/app/renderer.ts:51`). With the
  shipped defaults `autoRotate` (`src/sims/logistic-mandelbrot/kernel.ts:198`)
  and `realAxisSweep` (`:213`) both true, a zoom is reeled back out a few
  seconds after the user stops scrolling. This is the most likely single
  source of "it never worked properly".
- **The zoom is not anchored on the cursor.** `dolly(factor)`
  (`src/app/orbit3d.ts:1282`) changes only `camera.distance`; the wheel handler
  (`src/app/fractalCanvas.ts:270-271`) discards `ev.clientX` and `ev.clientY`,
  and the `dolly` signature (`:106`) cannot carry them. So zooming always
  approaches the orbit target, and an off-centre bulb slides out of frame as
  you close on it. The 2D fractal path already does this correctly with
  `zoomAroundCursor` (`src/app/fractalCanvas.ts:447`), regression-tested to
  1e-10 at `e2e/smoke.spec.ts:304-311`.
- **Splats do not grow as the camera closes.** Point size is
  `Math.min(3, Math.max(1.8, width / 650))` (`src/app/orbit3d.ts:3179`), a
  screen-space constant with no depth term in `gl_PointSize`
  (`:209`, `:436`). Magnifying a fixed point count with fixed-size splats
  spreads the samples apart while the dots stay the same size, so zooming in
  turns a sheet into stipple and, under the additive blend at `:3170`, also
  darkens it.

## Inputs (read these in your own context)

- `docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md` —
  card 87's audit, especially Part A and the ranked defect list
- `src/app/orbit3d.ts` — the camera block at `:632-646`, `orbit`, `pan`,
  `dolly`, `syncCameraToSweep`, the point vertex shader and the draw pass
- `src/app/fractalCanvas.ts` — `attachLogisticMandelbrotCanvasInteractions`,
  and `zoomAroundCursor` as the worked example of cursor anchoring
- `src/app/fractalView.ts` — `zoomAroundPoint`, the tested maths to reuse
- `src/app/renderer.ts` — `dollyOrbit3d`, `advanceOrbit3dCamera`,
  `pauseOrbit3dAutoRotate`
- `src/app/simView.ts` — the wiring block around `:916`
- `e2e/smoke.spec.ts` — the existing logistic-Mandelbrot cases and the
  `zoomAroundPoint` invariance test as the pattern for your new one

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. **A manual zoom is not undone.** After a wheel or pinch gesture, the camera
   holds the distance the user set until the user asks otherwise. "Asks
   otherwise" means a double-click reset (`resetCamera`), a camera-pose change,
   or a parameter change that rebuilds. Elapsed time is not a request. Choose
   the mechanism and say why in the deliverable notes: a sticky
   manual-camera flag consulted by `syncCameraToSweep` is the obvious one, and
   an unbounded `pauseOrbit3dAutoRotate` is not, because the operator asked for
   a working zoom and not for the loss of the ambient orbit.
2. **Cursor-anchored dolly.** The `dolly` contract carries the pointer position
   from the wheel and pinch handlers through `simView.ts`, `renderer.ts` and
   `webglRenderer.ts` to `orbit3d.ts`, and the camera target advances so that
   the world point under the cursor stays under the cursor across the gesture,
   within the pan clamp. Where the clamp binds, the anchor degrades toward the
   current behaviour rather than jumping.
3. **Depth-aware point size.** `gl_PointSize` acquires a distance term so that
   splats grow as the camera closes and the sheet stays a sheet rather than
   becoming stipple. Keep a floor so distant points do not disappear and a
   ceiling so a close camera does not fill the screen with a handful of
   squares. State both, and state what you did about the exposure change the
   additive blend produces if you changed anything.
4. **Camera clamps revisited, with a reason.** `CAMERA_MIN_DISTANCE` 0.35 and
   `CAMERA_PAN_LIMIT` 1.6 (`src/app/orbit3d.ts:635-636`) bound how close and
   how far off-centre the user can get. If card 87's audit says either binds
   before the picture stops being useful, move it and say what the new value is
   bounded by. If neither binds, leave both alone and say that instead. Do not
   move `CAMERA_NEAR_PLANE` or `CAMERA_FAR_PLANE` without saying what
   `assertOrbit3DGeometry` (`src/app/orbit3d.ts:3832`) then permits.
5. **A regression test in `e2e/smoke.spec.ts`** that fails on the current dev
   behaviour and passes after your change: perform a zoom-in on the
   logistic-Mandelbrot canvas, wait past
   `ORBIT_AUTO_ROTATE_RESUME_SECONDS`, and assert the camera has not returned
   to its pre-gesture distance. Expose whatever read-only signal the assertion
   needs on the canvas dataset in the style of the existing
   `data-orbit3d-*` attributes rather than reaching into internals.

## Constraints

- **No resampling in this card.** The domain stays fixed and no camera motion
  may trigger a rebuild. Card 90 does that, and doing it here would put two
  large changes in one diff and one bisect.
- No change to sampling, iteration, warmup or period-detection behaviour.
  `src/sims/logistic-mandelbrot/**` and `src/app/orbitSampler.ts` are not in
  your claims. Card 89 owns them and may be running concurrently.
- The default opening view is unchanged. A user who loads the page and touches
  nothing sees what they see today, including the ambient orbit and the real-
  axis sweep.
- Pinch and wheel behave the same way. A fix that only lands on the wheel path
  is half a fix.
- Do not modify `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`; it carries
  a frozen contract block for card 36.
- `public/baked/` is git-ignored and machine-local. Do not commit an `.elpc`
  file or a manifest entry.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card.
3. The new regression test exists in `e2e/smoke.spec.ts`, and the envelope
   records that it was run against the unmodified dev behaviour and failed
   there. A test that passes both before and after is not a regression test.
4. Zoom-and-wait: after a zoom-in gesture and 15 seconds of no input, the
   camera distance is within 2% of where the gesture left it. Verified in a
   browser by the verifier, not asserted from the code.
5. Cursor anchoring: with the camera off the default pose, a zoom-in centred on
   an off-axis feature keeps that feature under the cursor. The verifier checks
   this by eye on a captured pair of frames, and the worker states the
   numerical invariant it implemented and its tolerance.
6. Zoom-in no longer stipples: at maximum zoom-in the sheet reads as a surface,
   not as separated dots, compared against the equivalent frame card 87
   captured. Frames for the comparison are committed by the verifier or named
   from card 87's set.
7. The default opening view is unchanged: a frame at load with no input matches
   card 87's default frame in composition and brightness.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The new e2e case is a plain regression test, not a frozen contract block; card
90 may need to extend it and should not be blocked by a digest. The frozen
block in `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
(`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`) is
out of this card's claims and must not drift.

## Out of scope

- Resampling on zoom, a variable c-domain, and iteration budgets that follow
  the camera. Card 90.
- Period detection and the sample window. Card 89.
- The hybrid surface re-tessellating on camera change. Named in card 87's audit
  and deliberately deferred; it is a separate mechanism from the point cloud
  and does not fit in this card's budget.
- Preview/commit render staging for the orbit3d path. Worth doing, not now.
- The 2D fractal sims, which already work and are only the reference here.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes
- **Token baseline:** worker 5.5M, verifier 2.5M. Comparable code cards in this
  repo have run 7.2M on the worker (stage 84, `src/sims/gray-scott/kernel.ts`);
  this one spans five files but each edit is small. Above 9.0M on the worker,
  stop and report what is done rather than continue.

## Escalation

If card 87's audit found that the camera *does* hold its distance, deliverable
1 has no defect to fix. Do not invent one. Implement deliverables 2, 3 and 5,
state plainly that 1 was withdrawn on the audit's evidence, and continue.

If cursor anchoring cannot be made to hold within the existing pan clamp
without a visible jump, stop at a partial: land deliverables 1, 3 and 5, and
write what the anchoring needs — a wider clamp, a different target model — as a
finding for a later card. A jumping camera is worse than a centred one.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, or
the committed path. State your token spend. If you stopped on an escalation
clause, name the clause and say what you did and did not land.

## Verifier handoff

Drive the page yourself before you read the diff. Zoom in, take your hands off
the mouse, count to fifteen, and look. Then zoom in on an off-axis bulb and see
whether it is still under your cursor.

Two failures to catch specifically.

The first is a fix that suppresses the ambient orbit entirely. The card asks
for the zoom to survive, not for the sim to stop moving; if the object no
longer rotates on its own after a zoom, that is a regression the operator did
not ask for, whatever the test says.

The second is a depth term on `gl_PointSize` with no ceiling. At the closest
camera distance a naive `1/distance` produces enormous quads and a white
screen, which will look like a pass in a mid-range frame and a failure in the
frame that matters. Capture at maximum zoom-in specifically.

## Family-specific notes

Astra worker: do not attempt to open a browser. Codex seats on this machine are
refused at the Mach-port rendezvous (`bootstrap_check_in ... Permission denied
(1100)`), which cost stage 82 its first attempt. Your acceptance evidence is
`npm run verify`, the new e2e case as run by the harness, and a clear statement
of the invariants you implemented. Do not fabricate frames, and do not write an
appendix that implies you looked at one. The verifier looks.

Claude verifier: launch Chromium with `--use-angle=metal --enable-gpu` or the
WebGL2 canvas crashes the headless browser on this machine.

The run worktree needs `node_modules` before `npm run verify` will do anything
but exit 127.

## Re-brief 2026-09-11, before first dispatch: card 87's audit corrects deliverable 1

Card 87's audit (`docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md`,
section A4 and ranked defect 5) measured the camera **holding** the zoomed
distance exactly, indefinitely, at the shipped defaults: `0.35` at every one of
31 readings over 15 s. The reel-out this card was written against is real but
**conditional**: it fires only when "Continuous camera spin" (`continuousSpin`,
default `true` at `src/sims/logistic-mandelbrot/kernel.ts:205`) is unticked,
which routes `advanceOrbit3dCamera` (`src/app/renderer.ts:649-665`) into
`syncCameraToSweep`. Measured in that configuration: `0.35 -> 1.93 -> 4.48`
over 10 s, and elevation dragged `0.4353 -> 0.2462`. The audit's ranked list
puts the period window and the hidden boundary-detail tier above every camera
defect; those are cards 89 and this re-brief's deliverable 6 respectively.

The Escalation clause's first paragraph does **not** apply: the camera holds at
defaults, but there is still a defect to fix, so do not withdraw deliverable 1.
Read the deliverables and criteria with these amendments:

- **Deliverable 1, amended.** The hold must be unconditional: with "Continuous
  camera spin" unticked, a manual zoom must survive `syncCameraToSweep` the
  same way it already survives the spin path. The sticky manual-camera flag
  consulted by `syncCameraToSweep` remains the obvious mechanism; the sweep may
  keep driving azimuth and elevation if you decide the choreography needs
  them, but say so, and it may never write `distance` after a manual zoom
  until a reset or a rebuild.
- **Deliverable 5, amended.** The regression test must set `continuousSpin`
  to `false` (through the control panel or the param interface, not by editing
  the default) before the zoom gesture, because that is the only configuration
  in which the current dev behaviour fails. A test at the defaults passes
  before and after and is not a regression test. Also assert, in the same
  test or a sibling, that the default configuration still holds the distance,
  so the fix cannot regress the path that already works.
- **Deliverable 6, added (audit defect 2).** `BOUNDARY_DETAIL_SHOW_DISTANCE
  0.9` and `HIDE 0.95` (`src/app/orbit3d.ts:641-642`) draw the only finer-pitch
  tier in the build at zero opacity until the camera is 5.665x closer than its
  default, i.e. already inside the cloud. Raise both thresholds so the tier is
  visible from a moderate zoom (the audit's default distance is `5.098`; a
  first proposal is show at `2.5`, hide at `2.8`, but you choose from what the
  frames show) and state the values chosen and why. Keep the fade width. The
  default opening view (criterion 7) must remain unchanged, so the thresholds
  must sit below the default distance.
- **Criterion 3, amended:** the envelope records the test failing on
  unmodified dev *with `continuousSpin` false*.
- **Criterion 4, amended:** zoom-and-wait is verified twice in the browser,
  once at defaults and once with "Continuous camera spin" unticked; both must
  hold within 2%.
- **Criterion 8, added:** a frame at camera distance ~2.5-3.0 shows the
  boundary-detail tier where the same view on dev shows none; the worker names
  the frame pair and the verifier confirms it by eye.
- **Path claims** are unchanged; deliverable 6 lives in `src/app/orbit3d.ts`.
- **Token baseline** rises to worker 6.5M for the extra deliverable; the
  stop-and-report line moves to 10.0M.

## Re-brief 2026-09-11 (attempt 2): the path claims omitted `rendererBackend.ts`

Attempt 1 (GPT-6 Astra) landed deliverables 1, 3, 4, 5 and 6 and the verifier
passed seven of eight criteria on them: `npm run verify` green, the gate
clean, the spin-parameterised regression test at `e2e/smoke.spec.ts:302-338`,
the hold measured at zero drift over 15 s in both configurations, the
default view pose-matched to card 87's frame 01, and the boundary-detail
tier now visible below the new show threshold. It stopped short of
deliverable 2 because the typed dolly chain runs through
`src/app/rendererBackend.ts` (`orbit3dDolly?(factor: number): void`), which
the card did not claim, and the worker correctly declined to edit an
unclaimed file. That was a card defect, now fixed: the Path claims line above
includes `src/app/rendererBackend.ts`.

Attempt 1's work is preserved at `062fc3f2` on
`wip/88-logistic-mandelbrot-zoom-camera-repair-attempt-1` (`e2e/smoke.spec.ts`,
`src/app/orbit3d.ts`, `src/app/webglRenderer.ts`). **Start from it**: in your
fresh worktree run `git checkout 062fc3f2 -- e2e/smoke.spec.ts src/app/orbit3d.ts
src/app/webglRenderer.ts`, confirm `npm run verify` is green, then finish
deliverable 2 only: extend the `orbit3dDolly` declaration with optional
viewport coordinates, forward `ev.clientX`/`ev.clientY` from the wheel and
pinch handlers in `src/app/fractalCanvas.ts` (the option type at `:106` and
the calls at `:205` and `:271`), through `src/app/simView.ts:916` and
`src/app/renderer.ts` to the dolly core attempt 1 already wrote in
`src/app/orbit3d.ts`, normalising against the canvas rectangle. Do not redo
deliverables 1, 3, 4, 5 and 6, and do not change what attempt 1 wrote there
unless deliverable 2 requires it; say so if it does. The verifier's frames
for criteria 6, 7 and 8 stand; the second verification re-checks criterion 5
by eye on a captured pair plus criteria 1-3 mechanically, and spot-checks 4.
The token baseline for this attempt is 3.0M on the worker; stop and report
above 5.0M.

## Re-card 2026-09-11 02:25Z: attempt 2's worker seat moves to Claude Sonnet 5

The Codex 5-hour window hit its limit at 01:57Z (the provider refused stage
89's Astra verifier outright; reset 05:58Z). An Astra worker for this attempt
would be refused the same way, and each refusal pauses the whole repo for an
hour, which would also hold the Claude seats that still have headroom. Attempt
1, the substantive work on this card, was GPT-6 Astra's and stays credited to
it at `062fc3f2`; attempt 2 is the small plumbing of deliverable 2 and runs on
Claude Sonnet 5, so the Opus 5 verifier that does the by-eye frame checks
stays a different model from the worker.
