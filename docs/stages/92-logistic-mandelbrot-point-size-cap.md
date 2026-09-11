# Stage card 92-logistic-mandelbrot-point-size-cap: let a splat grow without going opaque

## Metadata

- **Authored:** 2026-09-11
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/92-logistic-mandelbrot-point-size-cap
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 91-logistic-mandelbrot-detail-adjudication
- **Path claims:** src/app/orbit3d.ts, e2e/smoke.spec.ts, docs/images, docs/audits/2026-09-11-logistic-mandelbrot-point-size-cap.md
- **Pairing rationale:** both seats Claude, for the reason cards 85 and 91 gave:
  the worker has to shoot frames to tune against a pixel statistic, and the
  verifier has to re-shoot the same frame and look at it, and a Codex seat
  cannot open a browser on this machine. The worker is Opus 5 because the
  change is a one-file shader tweak whose difficulty is entirely in choosing
  and measuring the curve, not in the plumbing. The verifier is Sonnet 5
  because the gate is one number plus two by-eye checks with committed
  reference frames on both sides of it, which is the shape stage 89's Sonnet 5
  verifier handled at 7/7.
- **Type:** Rendering repair against a measured regression, with a
  before/after frame.
- **Serialises with:** nothing live. Card 91 is documentation only and lands
  first by the gate.

## Surfacing concern

Card 88 gave the point sprites a depth term so that a zoomed-in sheet stops
reading as a dot lattice. Card 91 adjudicated the result and found the fix
over-corrected: at the zoom clamp (`d = 0.35`) every point nearer than
eye-depth `0.353` saturates the 32 px ceiling at `src/app/orbit3d.ts:215-216`,
and the near face of the sheet goes uniformly opaque. Card 91's pair 04 puts
numbers on it: whole-frame pixels above luma 200 went from 0.012% (card 87's
before frame) to 76.238% (the after frame), and the sheet-interior crop went
from a full dot lattice to 100% blown out. The tan leaf and the swirl filigree
that were legible through the stipple are gone.

Card 91 scored this as card 87's defect 3 fixed and a new defect of the same
class introduced at the same distances. This card removes the new one without
giving back the old one. Reverting the depth term is not an option: pairs 03
and 05 in card 91's audit are what a revert would lose.

## Inputs (read these in your own context)

- `docs/audits/2026-09-11-logistic-mandelbrot-detail-adjudication.md`, card
  91's audit: the "Measurement conditions" section is the capture rig, the
  pair table gives the poses, and "Recommendation for what comes next" is
  this card's brief
- `docs/images/2026-09-11-logistic-mandelbrot-zoom-04-hold-10s.png`, the
  reference for *legible*: card 87's frame, stippled but with the leaf and
  filigree visible
- `docs/images/2026-09-11-logistic-mandelbrot-detail-after-04-hold-10s.png`,
  the reference for *no lattice*: card 91's frame, continuous but blown out
- `src/app/orbit3d.ts:213-216`, the depth scale and the clamp, and
  `:3221-3223`, the `u_cameraZoomOffset` uniform feeding it
- `docs/stages/88-logistic-mandelbrot-zoom-camera-repair.md`, deliverable 3,
  which is what the depth term was for and what must survive

## Deliverables

1. **A change to the point-size growth in the point vertex shader** in
   `src/app/orbit3d.ts` so that a zoomed-in splat can still grow with depth
   without the near face of the sheet saturating. Card 91 names three
   candidate shapes: a sub-linear growth term, a lower ceiling, or a
   depth-aware alpha that lets a point grow without going fully opaque.
   Choose one, or a combination, and say why in the audit. The choice is the
   card's job; the constraint is that the fix must hold at the clamp *and* at
   the intermediate distances card 91 measured (`d = 1.32` and the default
   `d = 5.10`). The tuning surface includes the point fragment shader's
   `haze`, `core` and `sparkle` radii (`src/app/orbit3d.ts:392-396`), not
   only the vertex-stage size. The operator's own screenshot at the clamp
   reads as a gaussian blur, not just a bright patch: a 32 px sprite whose
   haze fades across its whole radius is a blur kernel, so the falloff
   profile at large sizes matters as much as the diameter. A lower ceiling
   alone is expected to trade the blur for the lattice.
2. **A re-shoot of card 91's pair 04** at `d = 0.35000`, `az = 1.0240`,
   `el = 0.4353`, kernel defaults, zoomed to the clamp and untouched for 10 s,
   using card 91's rig (`--use-angle=metal --enable-gpu`, 1440x900 CSS at
   `devicePixelRatio` 1, `prefers-reduced-motion: no-preference`, route
   `#/logistic-mandelbrot`, downscaled to 1200 px wide). Commit it to
   `docs/images/` as `2026-09-11-logistic-mandelbrot-point-size-04-hold-10s.png`,
   plus the same `(380, 110) 400x400` sheet-interior crop card 91 used.
3. **The luma statistic**, computed the way card 91 computed it: whole-frame
   percentage of pixels above luma 200, and the same figure for the
   sheet-interior crop, reported next to card 91's 76.238% / 100% and card
   87's 0.012% / 0%.
4. **A short audit, `docs/audits/2026-09-11-logistic-mandelbrot-point-size-cap.md`,**
   recording the shape chosen and why, the numbers, the matched frames, and
   one paragraph on what the default view and the `d = 1.32` view look like
   after the change, with a frame for each if either moved visibly.
5. **A regression assertion** in `e2e/smoke.spec.ts` next to card 88's zoom
   test: at the zoom clamp, the fraction of canvas pixels above luma 200 is
   below 0.25. This is the gate number with margin so the test is not brittle
   to the capture rig.

## Constraints

- **Do not touch the depth term's purpose.** Card 88's deliverable 3 (a
  depth-aware point size that removes the stipple) is landed and verified.
  The after frame must show no dot lattice in the sheet-interior crop. A fix
  that trades opacity for stipple has re-opened card 87's defect 3 and fails.
- The `u_pointSize` base value (`Math.min(3, Math.max(1.8, width / 650))`)
  and the default opening view are out of scope. Card 88 verified the default
  view unchanged and that must still hold: the default frame's luma statistic
  must not move by more than 1 percentage point.
- The frozen block in `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
  (`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`)
  is out of this card's claims and must not drift. The shader change is in
  the point pass (vertex size and, if needed, fragment falloff), not in the
  sampler.
- Do not commit anything under `public/baked/`.
- One coherent change to the point pass, size and falloff together if the
  shape needs both. If the chosen shape needs a new uniform, add it; if it
  needs a new control in the UI, stop and report, because that is a different
  card.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card.
3. The re-shot pair 04 frame and its sheet-interior crop are committed at the
   named paths, and the audit records the pose the app reported for the shot
   (read from the view-projection matrix, card 87's instrument) within card
   91's tolerance of the target pose.
4. Whole-frame pixels above luma 200 in the re-shot frame are **below 20%**.
   The verifier recomputes this from the committed frame, not from the audit's
   figure.
5. The sheet-interior crop shows **no dot lattice**, judged by eye against
   card 91's after crop (the no-lattice reference) and card 87's before crop
   (the lattice to avoid), and by the crop's `|lap|` figure staying well below
   card 87's 37.111 (card 91 measured 1.156 after; anything under 10 is
   continuous).
6. The tan leaf and the swirl filigree are **legible** in the re-shot frame,
   judged by eye against card 87's before frame. The verifier writes down its
   own answer before reading the worker's audit.
7. The default view is unchanged: a re-shot default frame's luma statistic is
   within 1 percentage point of card 91's after-01 frame, and the verifier
   sees no visible difference.
8. The e2e regression assertion exists, runs under the repo's Playwright
   config, and passes; card 88's zoom test still passes.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The e2e assertion is a plain regression test, not a frozen contract block, for
the same reason card 88 gave: the next card that touches point sizing may need
to adjust the threshold and should not be blocked by a digest.

## Out of scope

- A windowed sample domain. Card 91 recommends against reopening it, and card
  87's audit ranks the sample pitch "not a defect".
- Changing the zoom clamp distance, the camera, or anything card 88 landed
  outside the two lines named above.
- The `playwright.config.ts` `launchOptions.args` gap card 91 noted. It
  belongs to a harness card; this card carries the flags by hand in its own
  capture script, as 87, 88 and 91 did.
- Any change to the surface pass or the sampler.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes
- **Token baseline:** worker 4.0M, verifier 2.0M. The edit is small but the
  loop is shoot, measure, adjust, and card 88's worker ran 7.7M across five
  files. Above 7.0M on the worker, stop and report the best curve found with
  its numbers rather than continue tuning.

## Escalation

If no single-shader-change shape gets the frame under 20% blown out without
bringing the lattice back, do not widen the change. Commit the best candidate
behind the numbers it achieved, say plainly in the audit that the two
constraints conflict at this ceiling, and recommend what a further card would
need to touch (alpha blending state, the point budget, or the clamp distance).
A measured "these two goals need more than a size curve" is a pass on the
audit and a fail on criterion 4, and the operator wants to see it.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, or
the committed path and the number. Carry the chosen shape in one sentence and
the two luma figures (whole frame, crop). State your token spend.

## Verifier handoff

Open the three pair-04 frames side by side before reading the audit: card 87's
before, card 91's after, and this card's re-shoot. Write down whether the
re-shoot is legible and whether it has a lattice. Then recompute criterion 4
from the committed frame yourself; the audit's figure is the worker's claim,
not the evidence.

Two failures to catch.

The first is a pose drift. A re-shoot a little further out than `d = 0.35`
will pass the luma gate for free because fewer points are near the eye. Check
the pose the audit reports against the target and against card 91's tolerance,
and if the audit does not report a pose, that is a fail on criterion 3.

The second is the stipple coming back quietly. A lower ceiling is the easy fix
and it passes the luma gate, and at a 12 px ceiling the lattice is back. Look
at the crop, not the whole frame; the lattice is a crop-scale defect.

## Family-specific notes

Both seats are Claude. Launch Chromium with `--use-angle=metal --enable-gpu` or
the WebGL2 canvas crashes the headless browser on this machine.

The run worktree needs `node_modules` before `npm run verify` will do anything
but exit 127; run `npm ci` first.

The luma and `|lap|` figures come from card 91's measurement script if it
committed one; if it did not, the audit's "Measurement conditions" section
describes the computation and a few lines of Node with `pngjs` reproduce it.
