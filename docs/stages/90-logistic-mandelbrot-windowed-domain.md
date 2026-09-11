# Stage card 90-logistic-mandelbrot-windowed-domain: let the sampler follow the camera in

## Metadata

- **Authored:** 2026-09-10
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6 Astra <gpt-6-astra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/90-logistic-mandelbrot-windowed-domain
- **Worker effort:** xhigh
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 89-logistic-mandelbrot-period-detection-window
- **Dispatch:** serial
- **Pairing rationale:** cross-family, worker chosen for the task. This is the
  largest and most open-ended change in the slate — a compile-time constant
  threaded through roughly twenty call sites, with a parity oracle and a
  geometry assertion to keep satisfied — which is the case the operator brought
  the Astra seat in for. The verifier is Claude because the acceptance is a
  picture as much as a test, and only a Claude seat can drive Chromium here.
  `Requires GUI: true` on this card is for the verifier.
- **Type:** Structural change behind a feature flag, with a visual gate.
- **Serialises with:** cards 88 and 89, both of which it builds on and whose
  files it re-enters. It declares serial dispatch for that reason and claims no
  paths: its blast radius is not knowable in advance from a claims line, and a
  claims line that understates it would make it eligible for an overlap it must
  not have.

## Surfacing concern

This is the card the operator's request is actually about. Cards 88 and 89
make the existing detail visible and correctly labelled; neither adds any.

The c-plane sampled by every path in this simulation is a fixed rectangle:

```
src/sims/logistic-mandelbrot/model.ts:17-20
export const RE_MIN = -2;  export const RE_MAX = 1;
export const IM_MIN = -1;  export const IM_MAX = 1;
```

Those four constants are read directly by the CPU sampler, the GPU sampler
(`src/app/orbitSampler.ts:647,651,721-731,821-822`), the hybrid surface, the
ground plane (`GROUND_DOMAIN`, `src/app/orbit3d.ts:721`) and the baker
(`scripts/bake-orbit3d.mjs`). `src/app/orbit3d.ts:3835` throws if the ground
plane and the sampler domain disagree, which is the guard rail you will meet
first.

Because the domain is fixed, the sample pitch is fixed. Zooming the camera
magnifies a cloud that was sampled once at that pitch: no camera motion is even
an input to the build key (`orbit3dBuildKey`,
`src/app/webglRenderer.ts:2750`), so a rebuild at a finer pitch cannot be
triggered. Detail near the bulbs and swirls is not being lost in the renderer;
it was never computed.

Two things make this tractable rather than speculative. The orbit arithmetic in
the GPU sampler is already split-double (`DOUBLE_SINGLE_GLSL`,
`src/app/orbitSampler.ts:28-69`, Dekker split constant 4097 at `:43`), so
precision is not the binding constraint anywhere near the window widths this
card will reach — fp32 is not the ceiling here, the grid pitch is. And
`CGridSpec` already exists as an unused type at
`src/sims/logistic-mandelbrot/model.ts:50`, which is the shape the plumbing
wants.

## Inputs (read these in your own context)

- `docs/audits/2026-09-11-logistic-mandelbrot-zoom-and-resolution-ceiling.md` —
  card 87's audit, Part B and the ranked defect list especially
- `src/sims/logistic-mandelbrot/model.ts` — the domain constants, `CGridSpec`,
  `cellCoordinate`, `sampleAttractorGrid`
- `src/app/orbitSampler.ts` — every site that reads the domain constants
- `src/app/orbit3d.ts` — `orbitCloudBuildPlan`, `GROUND_DOMAIN`,
  `assertOrbit3DGeometry`, the camera block, and the rebuild call sites
- `src/app/webglRenderer.ts` — `orbit3dBuildKey` and its call site
- `src/sims/logistic-mandelbrot/kernel.ts` — the param schema
- `src/sims/logistic-mandelbrot/gpu-parity.test.cjs` — the tolerances, read only
- `docs/plans/2026-08-15-logistic-mandelbrot-gpu-sampler-next-steps.md` — the
  standing constraint that `model.ts` is the parity oracle and the CPU sampler,
  ELPC and `applyPrebaked()` all stay
- `README.md`, section "Baking a local point cloud", for what the `.elpc`
  format assumes about the domain

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. **The c-domain becomes a value, not four constants.** A window
   (`reMin/reMax/imMin/imMax`, or a centre-and-width equivalent — say which and
   why) is threaded from the build call through the CPU sampler and the GPU
   sampler. The existing constants remain as the default window so that a
   caller who passes nothing samples exactly what it samples today.
2. **The camera can set that window, behind a control.** A settled zoom
   narrows the window to what the camera can see and triggers a rebuild at the
   finer pitch. "Settled" means a debounce, not every wheel tick; state the
   debounce and why you chose it. Add the camera-derived window to
   `orbit3dBuildKey` so the rebuild is triggered by the existing mechanism
   rather than a parallel one. Put this behind a parameter that defaults **off**
   unless card 87's audit and your own measurement both say the on state is
   strictly better; the operator can turn it on, and a default flip is a
   separate decision.
3. **Iteration budget follows the window.** A narrower window needs a longer
   warmup to separate cascade branches that a wide window never had to
   distinguish; `BOUNDARY_DETAIL_WARMUP = 20_000` and the GPU sampler's
   `MAX_WARMUP_ITERATIONS = 20000` (`src/app/orbitSampler.ts:13-14`) are the
   headroom you have. Couple warmup to window width, state the coupling, and
   state the frame-time cost you measured at the shipped desktop default.
4. **The full-domain default is unchanged, and proven so.** With the new
   control off, the built cloud is identical to today's. Demonstrate it, do not
   assert it: a point-count and a checksum or a per-attribute comparison over a
   fixed seed and fixed parameters.
5. **A measured improvement.** Pick one bulb — the period-2 bulb at
   c ≈ -1 is the obvious one — and report the sample pitch and the distinct
   detected periods inside a fixed small region at the default window and at a
   zoomed window. The number that matters is how much finer the pitch got and
   what appeared because of it.
6. **Frames.** Before-and-after close-ups of the same region, committed to
   `docs/images/` with dated names, captured by the verifier if you cannot
   capture them yourself.

## Constraints

- **Default behaviour does not change in this card.** Deliverable 4 is the
  hard one and it is not negotiable. This change touches the most-used code
  path in the simulation and the way it goes wrong is silently, at the default.
- The `gpu-parity.test.cjs` tolerances hold unchanged (2e-6 on `zr`, 0.05%
  period mismatch, at both production and baker settings). That file is not
  yours to edit and carries a frozen contract block for card 36.
- `model.ts` stays the parity oracle; the CPU path stays.
- The prebaked ELPC path must keep working at the full domain. ELPC v1
  quantises positions to u16 over the fixed domain
  (`scripts/bake-orbit3d.mjs:382-383`), so a windowed bake is a format change
  and is **out of scope**: if the new control is on, fall back to the live
  sampler rather than mis-dequantising a bake. Say in the deliverable notes
  what a windowed bake would require.
- `assertOrbit3DGeometry` (`src/app/orbit3d.ts:3832`) and the ground-plane
  domain check at `:3835` must still hold. If the ground plane has to move with
  the window, move it deliberately and say so; do not weaken the assertion to
  get past it.
- Do not commit anything under `public/baked/`. It is git-ignored and
  machine-local.
- Do not change the `SimKernel` interface shape; that is a versioned decision
  under `docs/INTERFACE.md`.
- No new runtime dependency.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which of
   its three outcomes it was and why that is correct for this card.
3. The GPU parity test passes at its existing tolerances, with the measured
   figures quoted for both settings.
4. Default-unchanged is demonstrated by a comparison over a fixed seed and
   fixed parameters, and the envelope carries the numbers. An assertion that
   "the default path is untouched" without a comparison fails this criterion.
5. The camera-driven window works: with the control on, zooming in and waiting
   past the debounce produces a rebuild at a finer pitch. The verifier confirms
   this in a browser, and the envelope names the observable signal (a
   `data-orbit3d-*` attribute or equivalent) the verifier can watch.
6. The measured improvement exists: pitch before, pitch after, and the distinct
   detected periods in the fixed region at each.
7. Before-and-after frames of the same bulb exist in `docs/images/`, and the
   after frame shows structure the before frame does not.
8. Card 88's regression test and card 89's new tests still pass. This card
   lands on top of both and a regression in either is a failure of this stage,
   not someone else's problem.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The frozen block in `src/sims/logistic-mandelbrot/gpu-parity.test.cjs`
(`sha256:111b37b263b2afb8137c4628eae41ec55f035d2a2c8955f939ad82816d7be30e`)
must not drift.

## Out of scope

- A windowed ELPC bake and any change to the ELPC format.
- Error-driven or curvature-driven adaptive sample placement. The right next
  card after this one; card 87's audit should say so and this card should not
  pre-empt it.
- Re-tessellating the hybrid surface on camera change.
- The accumulation target's half-float precision.
- Flipping the new control on by default. A separate decision on this card's
  evidence.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 60 minutes
- **Token baseline:** worker 7.0M, verifier 3.0M. This is at the repo's worker
  p95 (7.2M) by design; it is the largest card in the slate. Above 11.0M on the
  worker, stop and land the partial described under Escalation.

## Escalation

This card has a defined partial and you should take it rather than overrun.
**Deliverables 1 and 4 alone are a landable stage**: the domain threaded as a
value, the default proven unchanged, the camera coupling not yet wired. That is
a real and reviewable increment and it unblocks the follow-on card. If at any
point the camera coupling looks like it will cost you deliverable 4, drop the
coupling.

Stop outright, without landing, if either of these is true: the default-
unchanged comparison does not come out identical and you cannot explain the
difference; or the parity tolerances cannot be held. Both mean the thread has
gone through a site that was doing something you have not understood, and
landing on that is worse than landing nothing.

If card 87's audit ranked the fixed domain below something else as the cause of
missing close-up detail, say so and follow the audit — but do not substitute a
different change into this card's claims. Report and stop.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it passed
and the evidence: the command run and its verbatim exit code and message, the
measured numbers, or the committed path. Carry the default-unchanged comparison
and the parity figures inline. State your token spend. If you took the defined
partial, say exactly which deliverables landed and which did not, and why.

## Verifier handoff

Deliverable 4 is the one to attack, and attack it before anything else. A
comparison that runs with the new control off but through the new code path is
the evidence; a comparison that quietly takes the old path is not. Check which
one ran. Then check that the comparison is over something that would actually
differ — a point count alone will match even if every position moved.

Second: drive the page and watch a zoom trigger a rebuild. Then zoom back out
and check that the wide view is still correct. A window that narrows and never
widens is a common shape of this bug and looks fine as long as you only zoom in.

Third: this card lands on top of 88 and 89. Run their tests, not only this
card's. Criterion 8 is there because a change this wide is exactly where a
prior gate regresses.

Do not accept "the default is untouched" as prose. It is the whole risk of the
card.

## Family-specific notes

Astra worker: do not attempt to open a browser. Codex seats on this machine are
refused at the Mach-port rendezvous (`bootstrap_check_in ... Permission denied
(1100)`). Your evidence is `npm run verify`, the parity harness under node, and
the numeric comparisons. Do not fabricate frames; the verifier captures them.

Claude verifier: launch Chromium with `--use-angle=metal --enable-gpu` or the
WebGL2 canvas crashes the headless browser on this machine.

The run worktree needs `node_modules` before `npm run verify` will do anything
but exit 127.

## Superseded 2026-09-11

Retired at orchestrator decision after one dispatch. The GPT-6 Astra worker
stopped under this card's own Escalation clause at 06:00Z, 268k tokens, no
files changed: card 87's audit ranks the period window, the hidden
boundary-detail tier and the constant point size as the causes of missing
close-up detail, and states in terms that "the sample pitch itself" is not a
defect, because the live grid is already finer than the point size can draw.
All three ranked causes landed in cards 88 and 89. A windowed domain would put
more points behind the same dots. The card file stays so the reasoning
survives; nothing here should be dispatched without a fresh measurement that
contradicts the audit.
