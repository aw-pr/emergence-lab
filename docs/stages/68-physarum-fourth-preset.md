# Stage card 68-physarum-fourth-preset: ship the wide-sensor mat as a fourth preset

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/68-physarum-fourth-preset
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/app/presets.ts, docs/sweeps/physarum-interestingness.md
- **Pairing rationale:** acceptance is partly visual (a new preset must look
  like the regime it claims), so a Codex worker with a Claude verifier driving
  the browser — the established pairing for visual acceptance. Path claims
  overlap card 69 so the two preset additions run serially rather than
  colliding in `presets.ts`.

## Objective

The 2026-08-23 Physarum sweep found a regime that beats the best shipped preset
(0.901 against Filigree web's 0.851) but is a different-looking network — wide
sensors with a slow turn produce a broad, evenly branching mat, where all three
shipped presets use narrower sensors (15–38°) and faster turns (14–34°). It was
escalated rather than promoted because it replaces nothing. **The operator has
decided (2026-08-30) to add it as a fourth preset.** Ship it.

## Inputs (read these in your own context)

- `docs/sweeps/physarum-interestingness.md` — the whole file, but especially
  "Harness settings" (the agent-count scaling) and "Promotion"
- `src/app/presets.ts` (the `physarum` block, three presets)
- `src/app/qualityProfiles.ts` (the Physarum `computeScale`)
- `src/sims/physarum/kernel.ts` (parameter ranges and slider bounds only)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts` — a fourth entry in the `physarum` block for the
   winning set: `sensorAngle: 60`, `sensorDistance: 5`, `turnSpeed: 12`. The
   remaining params were pinned by the sweep, not searched: `moveSpeed`,
   `depositAmount`, `evaporation` (0.90), `stepsPerFrame`. Take them from the
   sweep's pinned base and say in the delta comment that they are inherited,
   not chosen.
2. **`agentCount` must be rescaled, and this is the trap in this card.** The
   sweep ran at 256² with swept sets pinned to 14 000 agents. The app pins
   Physarum to 384² (`computeScale: 1`). Agents-per-cell is what the dynamics
   respond to, so the preset needs 14 000 × (384/256)² ≈ **31 500**, not
   14 000. Shipping the sweep's raw count would halve the intended density and
   the preset would not look like the thing that scored 0.901. Record the
   arithmetic in the delta comment.
3. A label and id in the house style of the existing three ("Veins", "Coral
   fans", "Filigree web") — a short concrete noun phrase describing the visual
   character, not a parameter description. Propose it yourself; the regime is a
   broad, evenly branching mat that fills the frame.
4. A dated appendix in `docs/sweeps/physarum-interestingness.md` recording the
   promotion, the operator decision that authorised it, the rescaled
   `agentCount` with its arithmetic, and a screenshot path.

## Constraints

- **Additive only.** The three shipped presets are not touched — this is a
  fourth entry, and `git diff` must show no change to their params.
- Metric stack unchanged.
- The preset must render at the app's own scale, not the sweep's.

## Acceptance criteria

1. `npm run verify` green.
2. `src/app/presets.ts` gains exactly one `physarum` entry; the other three are
   byte-identical.
3. The new preset selects and renders in a live browser at the app's default
   quality profile, and the frame shows a broad branching mat that fills the
   frame — not a sparse web and not a blank field. Screenshot committed or
   pathed in the appendix.
4. `agentCount` is the rescaled figure with the arithmetic recorded, not the
   sweep's 14 000.
5. The preset appears in the gallery/preset selector and survives a "Reset to
   defaults" cycle (the mechanism stage 58 fixed at `src/app/controls.ts`).

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing the three existing Physarum presets; sweeping `evaporation` (a known
  unsearched axis, but its own card); metric changes; other sims; merging;
  deploys.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the rescaled preset does not visually match the sweep's 0.901 frame — for
instance if 31 500 agents at 384² reads denser or sparser than expected — record
both frames and the numbers and stop. Do not tune the other pinned params to
chase the look; that is a sweep, not a promotion.

## Verifier handoff

Re-run `npm run verify`, confirm the three incumbents are untouched, and drive
the browser to select the new preset and capture a frame. Physarum is a WebGL2
sim: launch headless Chromium with `--use-angle=metal --enable-gpu` or the
context will fail to create. Judge the agent-count arithmetic and confirm the
frame is a filled branching mat.

## Re-brief — attempt 2 (2026-09-01)

Attempt 1 is preserved at `0497412` on
`wip/68-physarum-fourth-preset-attempt-1`. It passed all five numbered
acceptance criteria and was failed on a deliverable-level defect the verifier
found outside them. Most of it was right: `agentCount: 31500` with the
arithmetic recorded, the label "Root mat", the additive-only diff, and the
sensing geometry all stand. Re-use them rather than re-deriving them.

Two things to fix, and nothing else.

**1. `depositAmount` was copied from the wrong source.** The preset ships
`0.24`, which is the `veins` *reference* preset's value
(`e2e/harness/sims.ts:344`). The sweep's pinned base — the params the winning
`sensorAngle: 60` / `sensorDistance: 5` / `turnSpeed: 12` set actually ran
under when it scored 0.901 — is `baseParams` at `e2e/harness/sims.ts:337`,
where `depositAmount` is `0.22`. Deliverable 1 says "take them from the sweep's
pinned base"; `baseParams` is that base, and a reference preset is a different
object. `moveSpeed` (1), `evaporation` (0.9) and `stepsPerFrame` (1) were taken
correctly. Ship `0.22` so the preset is the configuration that was measured,
not a plausible variant of it.

This also makes the appendix's traceability claim true. As written it says the
preset inherits "the sweep's pinned base for the unsearched parameters", which
is factually wrong for `depositAmount` at `0.24`.

**2. The screenshot path does not resolve.** The appendix paths
`e2e/artifacts/physarum/root-mat-app-384.png` and no such file exists in the
tree; the appendix itself records the capture as "pending" because the worker
could not get a browser backend. Criterion 3 asks for a screenshot committed
*or* pathed — a path to nothing satisfies neither. Either commit the frame at
that path or remove the path and say plainly that the frame was verified live
rather than captured. Do not leave a dangling path.

This card already declares `Requires GUI: true`, so the browser should be
reachable. If it is not, say so explicitly in the handoff and take the second
option rather than pathing a file you did not write.

### Added acceptance criterion

6. `depositAmount` in the new preset equals the `depositAmount` in
   `baseParams` at `e2e/harness/sims.ts`, and any screenshot path named in the
   appendix resolves to a file that exists in the tree.
