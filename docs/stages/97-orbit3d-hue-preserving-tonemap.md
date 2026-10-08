# Stage card 97-orbit3d-hue-preserving-tonemap: stop the cloud bleaching every palette to white

## Metadata

- **Authored:** 2026-09-19
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/97-orbit3d-hue-preserving-tonemap
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Requires GUI:** true (verifier only)
- **Gate:** stage-completed: 96-cycle-palette-sweep-audit
- **Path claims:** src/app/orbit3d.ts, e2e/smoke.spec.ts, e2e/palette-sweep.spec.ts
- **Dispatch:** serial
- **Pairing rationale:** the acceptance is visual, so per the repo's
  established pairing the codex seat works it sandboxed and the Claude seat
  verifies with a browser. Terra rather than Sol because this is a bounded
  shader change against a numeric target, not a reasoning task. Opus 5
  verifies because the gate has a judgement in it: the numbers can improve
  while the cloud loses the additive glow that makes the sheets read as
  light, and only a look tells those apart.
- **Type:** Renderer change, one shader, no kernel or contract change.

## Surfacing concern

`docs/sweeps/logistic-mandelbrot-palette-cycling.md` measured mean OKLab
chroma over lit pixels of the rendered orbit3d frame at 0.012 to 0.023 for
six palettes including the shipped amber, against about 0.15 for a
saturated texel of those same palettes. The tone map
(`TONEMAP_FRAGMENT_SHADER` in `src/app/orbit3d.ts`) is
`1 - exp(-hdr * exposure)` applied per channel: a stack of eight samples per
cell drives all three channels toward 1 and the hue is gone before the
palette can show. The palette sweep therefore could not rank palettes on the
cloud, only on the ground plane, and Cycle mode reads as a brightness
pulse. This card fixes the tone map so that the sweep's finalists can be
judged on the cloud.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts`: `TONEMAP_FRAGMENT_SHADER`, `POINT_FRAGMENT_SHADER`,
  and the `v_energy` scaling comment in `POINT_VERTEX_SHADER`
- `docs/sweeps/logistic-mandelbrot-palette-cycling.md`, "Verdict" and
  "Browser frames"
- `e2e/harness/frame.ts` (`frameColourMetrics`)
- `e2e/palette-sweep.spec.ts`
- `e2e/smoke.spec.ts`, the logistic-Mandelbrot cases, for the existing
  luma-based assertions that must keep passing

## Deliverables

1. A hue-preserving tone map in `TONEMAP_FRAGMENT_SHADER`: map the stack's
   luminance through the existing exponential curve, scale the HDR colour
   by the ratio of mapped to source luminance, then soft-clip any channel
   still above 1 toward white rather than clipping per channel. Keep the
   `pow(1/2.2)` and the background term. Exposure keeps its meaning.
2. Mean lit-pixel chroma for the magma-at-1.8 and rosewood candidates at 5
   bands per unit at least 3× the values recorded in the sweep write-up
   (0.023 and 0.017), measured with `PALETTE_SWEEP=1 npx playwright test
   palette-sweep` on the run branch, numbers quoted in the envelope.
3. `whiteClip` for the same two candidates below 0.03.
4. The existing smoke assertions on the logistic-Mandelbrot canvas pass
   unchanged. If one fails because its threshold was tuned to the bleached
   look, say which and why in the envelope rather than retuning it; that is
   an escalation.
5. Before-and-after frames for amber (shipped), magma k1.8 and rosewood at
   5 bands per unit under `e2e/artifacts/logistic-mandelbrot-palette/`
   (git-ignored) with their paths named in the envelope.

## Constraints

- Only `TONEMAP_FRAGMENT_SHADER` changes in `orbit3d.ts`. Point energy,
  self-glow, the beam and the ground plane are out of scope; if the fix
  needs them, stop and report.
- No palette, gamma, contrast or `cycleBands` default changes.
- The worker seat is sandboxed and cannot run the browser sweep. Ship the
  shader change with the arithmetic argued in the envelope; the verifier
  runs the sweep and records deliverables 2, 3 and 5. The worker may run
  `npm run verify` and the kernel tests.
- Do not touch `e2e/harness/frame.ts`: the metric that found the defect is
  the metric that judges the fix.

## Acceptance criteria

1. `npm run verify` green.
2. `scripts/check-contract-test-gate.sh --worktree` reports its exit code and
   message verbatim, with one sentence naming which of the three outcomes it
   was.
3. Deliverables 2 and 3 met, measured by the verifier, numbers in the
   verifier envelope beside the write-up's baseline numbers.
4. Deliverable 4: every logistic-Mandelbrot smoke case passes, or the
   failing case is named with the reason.
5. Verifier's visual judgement, recorded: the sheets still read as stacked
   light, the chaotic band still glows brighter than the periodic sheets,
   and the palette's hue is visible on the cardioid sheet. Any "no" fails
   the card.

## Contract test

- **Test file:** e2e/palette-sweep.spec.ts
- **Assertions digest:** `sha256:bcc42a3d239213d7291793d21b7ab171320ccad19ad076697d18d56f909a53b7`
- The frozen block is the `lit > 0.02` guard in the static-frame case; it is
  what stops an all-black frame passing the chroma targets, so it must not
  move.

## Outcome (2026-09-19, worked directly by the orchestrator, not dispatched)

Landed on `dev` the same day without an Autometta run, at operator request.
Two departures from the card as written, recorded here rather than hidden:

- **Scope widened beyond the tone map.** The luminance-mapped tone map alone
  took cloud chroma from 0.020 to 0.027 on magma at 5 bands per unit. The
  loss was mostly in `POINT_FRAGMENT_SHADER` (white sparkle and cool haze
  highlights), the cycle branch of both vertex shaders (6% white admixture,
  30% grey blend on periodic sheets) and `GROUND_FRAGMENT_SHADER` (55%
  desaturated ink). All are now hue-preserving when `u_cycleBeam` is 1, so
  only Cycle mode changes.
- **Deliverable 2 not met as stated.** Whole-frame chroma rose 1.6× to 1.8×
  (magma 0.023 → 0.037, rosewood 0.017 → 0.026), cloud-only 2×
  (0.020 → 0.041), not 3×. Deliverable 3 met for verdigris (0.031) and not
  for magma (0.071) or rosewood (0.061). The remaining loss is hue averaging
  across stacked sheets and the achromatic ends of the seam ramps; see the
  sweep record's appendix.

Criterion 4 held: the four logistic-Mandelbrot smoke cases pass unchanged.
Criterion 5 judged by the orchestrator from the frames, so this card still
lacks a cross-family verification; card 96 can absorb that by re-running
the browser sweep on the landed tree if the operator queues it.

## Out of scope

- The interior scalar (distance versus multiplier).
- Changing the default palette or `cycleBands`; that is the operator's pick
  after this card lands and the sweep is re-run.
- The 2D fractal renderer, which does not tone-map.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes

## Escalation

If a hue-preserving map cannot hit the chroma target without the sheets
going dull (criterion 5 "no"), record the best tradeoff found with its
numbers and both frames, leave the shipped tone map in place, and mark the
card as needing an operator decision between the two looks.

## Verifier handoff

Run `PALETTE_SWEEP=1 npx playwright test palette-sweep` on the run branch
with the repo's headless GPU flags (already in `playwright.config.ts`).
Compare `browser-report.md` against the committed write-up's table. Then
open `frames/magma-k1-8-b5.png` and the same frame from the write-up's
baseline and answer criterion 5 in words before you look at the numbers.

## Family-specific notes

- Headless Chromium here needs `--use-angle=metal --enable-gpu`, which the
  Playwright config sets on darwin; without them the point pass renders
  differently and the numbers are meaningless.
- The smoke cases' luma thresholds were tuned on the current tone map (card
  92, attempt 2). Expect at least one to move.
