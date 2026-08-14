# Stage card 32-swarmalators-hone: palette punch and ambient camera drift

## Metadata

- **Authored:** 2026-08-14
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** The edits are small, well-bounded TS in two known
  files — a Codex worker fit, and it spends Codex quota rather than Claude.
  Whether the result actually looks better is an aesthetic judgement over
  rendered frames, so a frontier Claude tier verifies against captured PNGs
  rather than reading the diff alone.

## Objective

Swarmalators renders correctly but reads flat: the phase palette is muted at
the current gamma/contrast, and the view-fit camera settles to a dead-still
frame once the swarm stabilises. Punch the palette and add a slow ambient
camera drift so a stabilised swarm still has motion.

**Already done — do not redo.** The default-choreography half of this idea
landed earlier: `DEFAULT_J = 1` / `DEFAULT_K = -0.75` in
`src/sims/swarmalators/kernel.ts` is already the "active phase wave" regime,
with a comment recording that `K = 0` froze into a ring within seconds. Leave
the default params alone. Trails (`DEFAULT_TRAIL_PERSISTENCE = 0.85`) also
already exist.

## Inputs (read these in your own context)

- src/sims/swarmalators/kernel.ts (particularly `rasterise`, `updateViewFit`,
  and the `VIEW_FIT_SMOOTHING` / `DEFAULT_TRAIL_PERSISTENCE` constants)
- src/sims/swarmalators/kernel.test.cjs
- src/app/colormap.ts (the `case "swarmalators":` arm, around line 212)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/colormap.ts` — retune the `swarmalators` arm for a punchier phase
   read. It currently returns `{ preset: "phase", gamma: 0.9, contrast: 1.2 }`.
   Keep `preset: "phase"`: the hue channel is cyclic (the kernel emits
   `atan2(phaseSin, phaseCos)` normalised to 0..1) and a non-cyclic palette
   would snap through a hard seam every lap. Tune `gamma` and `contrast` only,
   and add a brief comment recording what you judged by eye.
2. `src/sims/swarmalators/kernel.ts` — add a slow ambient camera drift layered
   on top of the existing `updateViewFit` centre tracking, so a settled swarm
   still moves. The drift must be a **deterministic function of accumulated
   simulation time**, not `Math.random()` and not wall-clock. Expose it as a
   new param descriptor (suggested key `cameraDrift`, default on but gentle,
   `0` meaning fully off) so it is tunable and defeatable from the UI.

## Constraints

- Only `src/app/colormap.ts` and `src/sims/swarmalators/kernel.ts` may change,
  plus `src/sims/swarmalators/kernel.test.cjs` if you add coverage for the
  drift.
- Do not change the default simulation params (`DEFAULT_J`, `DEFAULT_K`,
  `DEFAULT_A`, `DEFAULT_B`, `DEFAULT_TIMESTEP`, `DEFAULT_PARTICLE_COUNT`,
  `DEFAULT_SEED`, `DEFAULT_TRAIL_PERSISTENCE`) — see "Already done" above.
- Do not change `preset: "phase"`, the kernel's 2-channel output contract
  (`CHANNEL_COUNT`), the O'Keeffe-Hong-Strogatz step in `model.ts`, or
  `presets.ts`.
- The drift must not break determinism: same seed plus same step sequence must
  still produce the same frames. `kernel.test.cjs` depends on this.
- The drift must not fight the auto-fit into oscillation, and must never push
  the swarm out of frame — bound its amplitude as a fraction of the fitted
  view, not in absolute world units.
- Do not touch other sims' colormap arms, the renderers, or shelved sims
  (`SHELVED_SLUGS` in `src/app/registry.ts`).

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. Diff confined to the three files named in Constraints.
3. Determinism holds: two runs from the same seed and step count produce
   identical `readState()` output. Demonstrate this, do not assert it.
4. `cameraDrift = 0` reproduces the pre-change camera behaviour exactly, and
   the drift is driven by simulation time rather than `Math.random()` or
   `Date.now()` (grep to confirm neither appears in the drift path).
5. With drift on, a swarm left to settle still shows frame-to-frame camera
   movement, and the swarm stays fully in frame throughout — capture frames
   far enough apart to show it (early, settled, and late).
6. The retuned palette reads as more saturated/legible than the previous
   `gamma: 0.9, contrast: 1.2` on the same frame, with no hue seam visible
   across the phase wrap and no blown-out white cores.

## Contract test

- **Test file:** src/sims/swarmalators/kernel.test.cjs
- **Assertions digest:** Existing assertions must keep passing unchanged. Any
  drift coverage you add must pin determinism and the `cameraDrift = 0`
  no-op, not a specific drift magnitude.

## Out of scope

- Simulation physics, default regime params, trail persistence.
- Other sims, the renderer backends, render modes, quality profiles.
- Preset additions or renames.
- Any push or publish-branch work.

## Budget

- **Worker wall-clock:** 40 minutes
- **Verifier wall-clock:** 25 minutes

## Verifier handoff

Worker reports: the chosen gamma/contrast and what drove the choice; the drift
formulation (parameterisation, amplitude bound, and why it cannot oscillate
against the auto-fit); the new param descriptor's key, default, and range; and
where the captured before/after frames are.

## Family-specific notes

None
