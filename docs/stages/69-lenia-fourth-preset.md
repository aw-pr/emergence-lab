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
