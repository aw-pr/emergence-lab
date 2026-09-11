# Stage card 69-lenia-fourth-preset: ship the radius-14 organism as a fourth preset

## Metadata

- **Authored:** 2026-08-30
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/69-lenia-fourth-preset
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/app/presets.ts, docs/sweeps/lenia-interestingness.md
- **Pairing rationale:** identical shape to card 68 — visual acceptance, Codex
  worker, Claude verifier at the browser. Shares the `presets.ts` path claim
  with card 68 so the two run serially.

## Objective

Stage 62 swept the radius axis that the 2026-08-23 Lenia write-up named as
"most likely to hold an unfound regime", and found one: radius 14 at μ 0.24 /
σ 0.028 scores 0.463 against Geminium storm's 0.4135 re-scored in the same run,
a 12% margin. It was recorded as a fourth-preset candidate rather than promoted
because it is a different visual character, not a sharper Geminium storm.
**The operator has decided (2026-08-30) to add it as a fourth preset.** Ship it.

## Inputs (read these in your own context)

- `docs/sweeps/lenia-interestingness.md` — including the "Radius follow-up —
  2026-08-25" section, which is stage 62's appendix and holds the winning set
- `docs/stages/62-lenia-radius-sweep.md` (the harness settings it pinned)
- `src/app/presets.ts` (the `lenia` block, three presets)
- `src/sims/lenia/kernel.ts` (the radius cost note and slider bounds only)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts` — a fourth entry in the `lenia` block: `radius: 14`,
   `mu: 0.24`, `sigma: 0.028`. The remaining params were pinned by stage 62 and
   not searched — `muDrift` (0.015), `dt` (0.1), `stepsPerFrame`. Take them
   from stage 62's config and mark them inherited in the delta comment. Confirm
   the values against the appendix rather than trusting this card's recollection.
2. A label and id in the house style of the existing three ("Drifting soup",
   "Still spots", "Geminium storm") — a short evocative noun phrase for the
   visual character, not a parameter description. Propose it yourself after
   looking at the rendered frame.
3. A dated appendix in `docs/sweeps/lenia-interestingness.md` recording the
   promotion, the operator decision that authorised it, and a screenshot path.

## Constraints

- **Additive only.** The three shipped presets are untouched; `git diff` must
  show no change to their params.
- Metric stack unchanged.
- **Radius is the cost driver.** Stage 62's card flagged that radius 14 may
  strain the harness; at the app's own grid it is heavier still. Check the
  frame rate at the default quality profile and record it. If radius 14 makes
  the sim unusably slow in the live app, that is an Escalation, not something
  to fix by quietly lowering the radius.

## Acceptance criteria

1. `npm run verify` green.
2. `src/app/presets.ts` gains exactly one `lenia` entry; the other three are
   byte-identical.
3. The new preset selects and renders in a live browser, showing a living
   organism field — not a blank, saturated, or frozen frame. Screenshot
   committed or pathed in the appendix.
4. Observed frame rate at the default quality profile recorded in the appendix,
   with a plain statement of whether it is acceptable.
5. The preset appears in the preset selector and survives a "Reset to defaults"
   cycle.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing the three existing Lenia presets; further μ/σ or radius search;
  metric changes; performance work on the Lenia kernel; other sims; merging;
  deploys.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If radius 14 is too slow to ship at the app's default quality profile, stop and
record the frame rate with the numbers. Lowering the radius to make it fast
would produce a different preset from the one that scored 0.463, which is not
what was authorised — that decision goes back to the operator.

## Verifier handoff

Re-run `npm run verify`, confirm the three incumbents are untouched, drive the
browser to select the new preset, capture a frame and measure the frame rate.
Lenia is a WebGL2 sim: launch headless Chromium with `--use-angle=metal
--enable-gpu`. Judge the frame is alive and the rate is recorded.

## Re-brief — attempt 2 (2026-09-01)

Attempt 1 is preserved at `23cd3bf` on
`wip/69-lenia-fourth-preset-attempt-1`. It did deliverables 1 and 2 and then
exited without a handoff envelope, so the stage stalled rather than reaching a
verifier. The work it did is good and was checked before this re-brief was
written: `muDrift: 0.015`, `dt: 0.1` and `stepsPerFrame: 1` all match
`baseParams` at `e2e/harness/sims.ts:284`, not the `geminium-storm` reference
(which carries `muDrift: 0.02`). Reuse that entry rather than re-deriving it.

Three things to finish.

**1. Deliverable 3 was never written.** `docs/sweeps/lenia-interestingness.md`
has no appendix for this promotion. It needs the dated entry, the operator
decision of 2026-08-30 that authorised it, and the searched-versus-inherited
split for the params. This is the only substantive piece of work outstanding.

**2. Write the envelope.** Attempt 1 produced correct code and still stalled,
because the run ends at the handoff envelope, not at the last edit. Write it
whatever the outcome, including a failure, so the stage reaches a verdict
instead of a stall.

**3. Do not path a screenshot you did not capture.** Card 68 hit this on the
same day: its appendix named `e2e/artifacts/physarum/root-mat-app-384.png`,
no such file existed, and the criterion asking for a screenshot "committed or
pathed" was met by neither. This card declares `Requires GUI: true`, so the
browser should be reachable; 68's worker found it was not. Either commit the
frame at the path you name, or name no path and say plainly that the preset
was verified live rather than captured.

### Worth checking, not assumed

The sweep ran Lenia at 128x128 (`e2e/harness/sims.ts`, `gridWidth`/
`gridHeight`), and the app pins Lenia to `computeScale: 1`
(`src/app/qualityProfiles.ts:120`), the same 384x384 that made card 68's
`agentCount` need a density rescale. `radius` is the one searched param that
is spatial.

The orchestrator's reading is that no rescale is needed here, because a Lenia
kernel radius sets the intrinsic size of an organism where physarum's
`agentCount` set a density: a larger grid at the same radius holds more
organisms rather than changing their behaviour. That reading is not the same
thing as a measurement. Confirm it against the rendered frame -- criterion 3
already asks you to look -- and if the organism at 384 does not match the
character stage 62 recorded at 128, stop and record both frames under the
escalation clause rather than tuning `radius` to chase the look.

### Added acceptance criterion

6. A handoff envelope is written, and any screenshot path named in the
   appendix resolves to a file that exists in the tree.
