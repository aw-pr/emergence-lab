# Stage card 79-brians-brain-preset-retune: Sparse spirals and Storm, tuned on the corrected kernel

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/79-brians-brain-preset-retune
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 77-brians-brain-dying-value-sweep
- **Path claims:** src/app/presets.ts, docs/sweeps/brians-brain-interestingness.md
- **Pairing rationale:** the established visual-acceptance pairing: a Codex
  worker edits the presets from card 77's numbers, and the Claude verifier
  drives the browser and looks. Worker family alternates from card 78. Claims
  overlap card 77 on the write-up, which is why this card is gated on it
  rather than paired with it.
- **Type:** Preset retune, closing the operator decision of 2026-09-06.

## Surfacing concern

Stage 72 fixed the `dyingValue` comparison and the operator accepted the
consequence: "Sparse spirals" (0.62) and "Storm" (0.42) now differ from their
shipped appearance in 43% and 45% of cells. Their current parameters were
scored and promoted on the buggy kernel, so those scores are not evidence.
The write-up's "Operator decision 2026-09-06" section names this card as the
follow-up.

Card 77 supplies the measurement. This card acts on it.

## Inputs (read these in your own context)

- `docs/sweeps/brians-brain-interestingness.md` — the operator decision and
  card 77's appendix, which ends with a recommendation for this card
- `src/app/presets.ts` — the `brians-brain` block
- `docs/stages/68-physarum-fourth-preset.md` — the preset-promotion shape,
  including how the delta comment records what was inherited versus chosen

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: "Sparse spirals" and "Storm" updated to card 77's
   recommended parameters. If card 77 found the axis cosmetic and recommended
   holding 0.5, set both to 0.5 and say so in the delta comment. Keep the ids
   and labels; users have them bookmarked.
2. "Classic waves" untouched, byte for byte.
3. A dated appendix in the write-up recording the before and after parameters
   for both presets, the scores under the corrected kernel, and one sentence
   per preset on what the frame now looks like.

## Constraints

- Parameters come from card 77's appendix. Do not run a new sweep here.
- No kernel, harness or metric change.
- If card 77's recommendation is missing or ambiguous, stop under Escalation.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. "Classic waves" is byte-identical to `dev`.
4. Both changed presets carry the parameters card 77's appendix recommends,
   and the delta comment says which values were chosen and which inherited.
5. In the browser, each of the two presets renders a field that matches the
   appendix's one-sentence description, and neither floods to uniform or dies
   within 300 steps.
6. No file outside the path claims is modified.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- A fourth Brian's Brain preset.
- "Classic waves".
- Regenerating thumbnails; note in the appendix if they are now stale.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If card 77's appendix does not give a value for one of the presets, or gives
one whose frame floods or dies, stop and report which. Do not pick a value
yourself; that reopens the sweep this card is gated on.

## Verifier handoff

Confirm criterion 3 by diff, criterion 4 by reading card 77's appendix
yourself, then drive the browser to each preset and watch 300 steps. Brian's
Brain is a Canvas2D sim; headless Chromium needs no GPU flags. Capture one
frame per preset for the artefact.
