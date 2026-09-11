# Stage card 87-logistic-mandelbrot-zoom-diagnostic: measure the zoom, and measure the ceiling

## Metadata

- **Authored:** 2026-09-10
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** GPT-6 Astra <gpt-6-astra@local>
- **Base branch:** dev
- **Run branch:** autometta/87-logistic-mandelbrot-zoom-diagnostic
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md, docs/images
- **Pairing rationale:** cross-family, and the browser decides the seat. The
  deliverable is measured behaviour in a live WebGL2 canvas, and a Codex seat
  cannot open Chromium on this machine (stage 82 attempt 1, 2026-09-07:
  `bootstrap_check_in ... Permission denied (1100)`), so the worker is Claude.
  The verifier is Astra because the second half of this card is arithmetic over
  source constants, which a frontier reasoning seat can re-derive independently
  without a browser.
- **Type:** Diagnostic. Instrumentation before repair.
- **Serialises with:** nothing. This is the first card of the slate and the two
  repair cards both gate on it.

## Surfacing concern

The operator's report is that the logistic-Mandelbrot has a zoom feature and
"TBH it never worked properly", and that close-up detail of the bulbs and
swirls is not there. Both halves are believed to have identifiable causes in
the source, but nobody has watched the thing and written the numbers down.
Cards 88, 89 and 90 will change behaviour on the strength of what this card
measures, so a wrong measurement here is a wrong slate.

Read the code first and then confirm in the browser. The following are the
orchestrator's readings of `dev` at `27f10e58`; treat them as claims to check,
not as findings you may restate.

- `src/app/orbit3d.ts:1282` — `dolly(factor)` mutates `this.camera.distance`
  and nothing else, clamped to `CAMERA_MIN_DISTANCE` 0.35 and
  `CAMERA_MAX_DISTANCE` 12 (`:635`, `:637`).
- `src/app/webglRenderer.ts:2750` — `orbit3dBuildKey` carries no camera term,
  so no camera motion can trigger a rebuild.
- `src/app/orbit3d.ts:1255-1280` — `syncCameraToSweep` drives
  `this.camera.distance` back toward a choreographed value, and
  `src/app/renderer.ts:51` sets `ORBIT_AUTO_ROTATE_RESUME_SECONDS = 4`.
- `src/app/orbit3d.ts:3178` — point size is
  `Math.min(3, Math.max(1.8, width / 650))`, a screen-space constant with no
  depth term (`gl_PointSize` at `:209` and `:436`).
- `src/sims/logistic-mandelbrot/model.ts:104` —
  `const limit = Math.min(maxPeriod, count - 1)`, with the shipped default
  `DEFAULT_KERNEL_SAMPLES = 8` (`src/sims/logistic-mandelbrot/kernel.ts:55`).
- `scripts/bake-orbit3d.mjs:382-383` — `q16` quantises positions to u16 over
  the fixed domain in `src/sims/logistic-mandelbrot/model.ts:17-20`.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` — the camera block, `dolly`, `pan`, `syncCameraToSweep`,
  `updateBoundaryDetailFade`, the point draw pass and the accumulation target
- `src/app/fractalCanvas.ts` — `FRACTAL_SLUGS` and
  `attachLogisticMandelbrotCanvasInteractions`
- `src/app/renderer.ts` — `dollyOrbit3d`, `advanceOrbit3dCamera`,
  `pauseOrbit3dAutoRotate`
- `src/app/webglRenderer.ts` — `orbit3dBuildKey` and its call site
- `src/sims/logistic-mandelbrot/model.ts` and `kernel.ts`
- `src/app/orbitSampler.ts` — the split-double block and the sampler domain
- `scripts/bake-orbit3d.mjs` — the ELPC v1 layout and `q16`
- `README.md`, section "Baking a local point cloud"
- `docs/plans/2026-08-15-logistic-mandelbrot-gpu-sampler-next-steps.md`
- `docs/spikes/2026-08-14-fp32-orbit-precision.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md`,
   a dated audit in two parts.

   **Part A, what zoom does.** Trace the wheel and pinch events to the one
   piece of state they mutate, and state in one sentence what a user's scroll
   gesture actually changes. Then answer, each with a number and a `file:line`:
   - What is the usable magnification range, from the default camera distance
     to the point where the camera enters the cloud or geometry starts clipping
     the near plane? Give the default distance from `DEFAULT_CAMERA_EYE`, the
     bounding radius from `ORBIT3D_BOUNDING_RADIUS`, and the ratio.
   - Does any zoom gesture cause a resample? Say which build inputs exist and
     which of them a camera can move.
   - Is the zoom anchored on the cursor or on the orbit target?
   - Does the camera hold the distance the user chose? Time it: scroll in,
     stop, and record the camera distance at 1 s, 5 s and 15 s under the
     shipped defaults. Report the parameter defaults that put it on that path.

   **Part B, the resolution ceiling.** Four numbers, each derived rather than
   asserted, each with the `file:line` it comes from:
   - The live c-plane sample pitch at the shipped desktop default, in units of
     Re. Show the arithmetic from the preset cell count, `POINT_BUDGETS`, the
     default `sampleCount` and `SURVIVING_CELL_ESTIMATE`.
   - The same pitch with Boundary detail at maximum.
   - The highest orbit period the shipped default can label at all, from
     `estimatePeriod`. If it is lower than `MAX_DETECTABLE_PERIOD`, say by how
     much and what the excess-period cells are coloured as instead.
   - The u16 position step of an ELPC bake in units of Re, compared against the
     level-2 refinement sub-cell pitch of the default `--refine-fraction` bake.
     State whether the format quantisation floor is above or below the finest
     pitch the baker produces.

2. A ranked list, at the end of the audit, of the defects that stand between
   the operator and "more detail in the bulbs and swirls close up". Rank by how
   much visible detail each unlock buys, not by how hard it is. Each entry
   names the file and the mechanism.

3. Frames in `docs/images/`, dated, at least four: the default view; the same
   view at maximum zoom-in; a close-up on the period-2 bulb region; and one
   frame captured 10 seconds after a zoom gesture with no further input, which
   is the evidence for the hold-the-distance question. Name in the audit the
   parameter values and the sampler path (`data-orbit3d-sampler`) each frame
   was captured on.

## Constraints

- **Change no behaviour.** This card measures. No file outside the two path
  claims may be modified, and the audit's value is destroyed if the thing you
  measured is not the thing that ships.
- Every number in the audit is derived in the audit or read from a live page.
  A number you cannot show the arithmetic for does not go in.
- Capture on the shipped defaults unless a frame's purpose is a non-default
  setting, in which case say so beside the frame.
- Use the live sampler path, not a prebaked cloud, for the ceiling numbers
  unless a claim is specifically about the bake. `public/baked/` is
  machine-local and git-ignored; do not add to it, and do not commit any
  `.elpc` file.
- If a claim in Surfacing concern is wrong, say so plainly and give the correct
  reading. The orchestrator's line numbers are not evidence.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card. This card
   claims only documentation and images, so the expected outcome is exit 2 with
   `no relevant changed files to inspect in the working tree`, and that
   satisfies this criterion. Do not stage extra files to make the gate find
   something.
3. The audit answers all four Part A questions and all four Part B numbers,
   each with a `file:line` and, where it is a derivation, the arithmetic.
4. The hold-the-distance measurement exists as three timed readings, not as a
   description of what the code would do.
5. At least four dated frames in `docs/images/`, each with its parameters and
   sampler path named in the audit.
6. The ranked defect list exists and is ranked by visible detail unlocked, with
   the ranking's reasoning stated.

## Contract test

- **Test file:** None
- **Assertions digest:** None

`src/sims/logistic-mandelbrot/gpu-parity.test.cjs` carries a frozen block for
card 36 whose declared digest is
`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`.
This card must not touch that file, so the gate has nothing to inspect.

## Out of scope

- Any repair. Cards 88, 89 and 90 are the repairs and they read this audit.
- Baking a new point cloud.
- The analytic edge-curve arc (stages 52-56), which is landed and separate.
- The 2D Mandelbrot and Julia sims, whose zoom works and is the contrast case,
  not the subject.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 40 minutes
- **Token baseline:** worker 3.0M, verifier 1.5M. The repo's worker median is
  1.72M and its p95 7.2M; a browser-capture card with a large read set sits
  above the median. Above 6.0M on the worker, stop and report rather than
  continue.

## Escalation

Two stopping conditions.

- If the timed hold-the-distance measurement shows the camera holding the
  distance the user set, the central claim behind card 88 is wrong. Stop,
  record the measurement, and say so. Do not soften it into agreement.
- If the shipped page does not reach the live GPU sampler path
  (`data-orbit3d-sampler` is not `gpu-sampled`), stop. Every ceiling number in
  Part B is about the live path, and measuring a fallback and labelling it the
  ceiling is the failure this clause exists to prevent.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, or
the committed path. State your token spend. If you stopped on an escalation
clause, name the clause and say what you did and did not land.

## Verifier handoff

Re-derive Part B's four numbers yourself from the source before reading the
worker's arithmetic, then compare. You do not need a browser for that half and
should not attempt one.

The specific failure to catch is a number asserted from a constant that does
not bind. The sample pitch in particular runs through two caps — the point
budget and the compute grid — and only one of them is the binding constraint
at the shipped default; an audit that quotes the wrong one has the wrong pitch
however confident the prose. Likewise the period cap: check whether
`MAX_DETECTABLE_PERIOD` or `count - 1` wins at the shipped default, and reject
an audit that quotes the constant without checking which term the `Math.min`
selects.

For Part A, you cannot re-run the timings. Check instead that the reported
timings are consistent with the code path the worker names, and that the
parameter defaults quoted are the ones actually shipped.

## Family-specific notes

Claude worker: this card declares `Requires GUI: true` for the browser
captures. Launch Chromium with `--use-angle=metal --enable-gpu`; without those
flags a WebGL2 sim crashes the headless browser on this machine.

Astra verifier: do not attempt to open a browser. Codex seats are refused at
the Mach-port rendezvous on this machine and the attempt costs the stage its
wall clock. Your half of this card is source arithmetic.

## Re-card 2026-09-11 (attempt 4): worker seat moved to Claude Sonnet 5

Attempts 1-3 on Claude Opus 5 each did four to ten minutes of correct work
(built the app, drove Playwright with the Metal flags, captured frames) and
then hung after a routine tool result: no transcript writes, no live sockets,
no children, for 27-52 minutes each. The same hang took an Opus design agent
in the operator's session at 20:50Z, while Fable 5.1 sessions ran unaffected
across the same hours and a fresh `claude -p` probe on Opus answered in 2s.
status.claude.com carried an "elevated latency, some request timeouts" incident
from 21:43Z. Nothing about the card was wrong; the seat moves to Sonnet 5 as
the cheaper Claude seat that can still drive the browser. The verifier stays
on GPT-6 Astra, so the pairing remains cross-family. Attempt 3's frames were
under a temp dir and are not preserved; this attempt starts clean.

## Re-card 2026-09-11 (attempt 5): worker seat moved to Claude Fable 5.1

Attempt 4 on Sonnet 5 never received its first response: seventeen transcript
rows, no tool call, closed sockets, silent for twelve minutes. So the hang is
not Opus-specific. Every hang tonight is a request that never returns while
status.claude.com carries an open latency incident, and the only Claude seat
that has run clean through the same hours is Fable 5.1. The seat moves there
for one attempt; the verifier stays GPT-6 Astra. If this attempt hangs as
well, the stage is held until the incident clears rather than re-dispatched.

## Re-card 2026-09-11 (attempt 6): worker back on Claude Opus 5; the hang was the CLI build

Attempt 5 on Fable 5.1 hung after six minutes and 72 tool calls, so the seat
was never the variable. The variable was the binary: the `claude` launcher
symlink moved to Claude Code 2.1.268 at 21:02Z tonight, minutes before the
first hang, and every worker since has run 2.1.268 while the operator's own
session, which never hung, is still on 2.1.267. A `sample` of the hung worker
shows its main thread parked in a lock wait inside the 2.1.268 binary with no
open sockets and no children. The launcher is pinned to 2.1.267 and
auto-update is off for the night. The seat returns to Opus 5 as designed.
