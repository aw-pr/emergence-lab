# Stage card 85-gray-scott-nine-point-default-decision: what switching the stencil would cost Waves

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Base branch:** dev
- **Run branch:** autometta/85-gray-scott-nine-point-default-decision
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** docs/sweeps/gray-scott-interestingness.md, docs/images/
- **Pairing rationale:** cross-family. The decision turns on whether one
  preset's changed appearance is an improvement or a loss, so the Claude
  aesthetic tier verifies the frames rather than a numeric seat.
- **Type:** Visual adjudication feeding a default-value decision.
- **Serialises with:** card 84. Run after 84 lands; both claim the Gray-Scott
  sweep write-up.

## Surfacing concern

Stage 76 put a nine-point Laplacian stencil in the Gray-Scott kernel,
selectable and off by default, and recorded what a switch would cost. Five of
the six shipped presets move by under 2.5% and keep their character. Waves does
not: coverage rises from 0.4063 to 0.6401 and the frame "goes from soft mottled
fronts on black to crisp bright rings, a different-looking picture at the same
pair." Stage 76 wrote that this is "the cost a switching card would have to
justify, and this stage has no reason to pay it."

The numbers exist and the frames do not. Nobody has looked at the two Waves.

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` — the appendix "the nine-point
  stencil does not reach the glider regime — 2026-09-03", especially "The six
  presets under nine-point, for the record"
- `src/sims/gray-scott/kernel.ts` — the stencil switch and its default
- `e2e/harness/driver.ts` — how a frame is captured to `docs/images/`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Two frames of Waves at its shipped parameters, one five-point and one
   nine-point, same seed and same step count, committed to `docs/images/` with
   dated names. Two more of Coral (Default) under both stencils, as the control
   that stage 76's numbers say should be indistinguishable.
2. A dated appendix answering whether the nine-point Waves is a better picture
   than the shipped one — not a higher-scoring one, a better one — and whether
   the Coral control is in fact indistinguishable as the 0.5% delta predicts.
3. A recommendation on the default: switch, do not switch, or switch with Waves
   retuned to recover its character. If the third, name the retune as a further
   card rather than doing it.
4. If the recommendation is to switch, the cost stated plainly: what every
   existing Gray-Scott sweep number would need re-baselining.

## Constraints

- Do not change the default in this card, whatever you recommend. The default
  moves in a card the operator approves after reading this one.
- No preset change. `src/app/presets.ts` is not in your claims.
- No kernel change. If card 84 added a timestep control, leave it at its
  default for every frame here.
- No metric or composite change.
- The two Waves frames differ in the stencil and nothing else.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes on the staged change set, invoked with the
   test file named explicitly.
3. Four frames exist in `docs/images/`, and the appendix names the seed and the
   step count.
4. The appendix answers the better-picture question and takes a side.
5. The Coral control is addressed: either it is indistinguishable, confirming
   the numbers, or it is not, which undermines them and must be said.
6. The recommendation is one of the three named options, with its reason.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** `sha256:d423a74581557368b535a0be297459def702f2f9357ee38f77e191e8e164d676`

That is the freeze stage 70 placed around the `metrics harness rewards
structure over washout` test, verified intact on 2026-09-06. If your change
does not touch that file the gate has nothing to check, and criterion 2 is
satisfied by the gate running over your staged set and reporting no violation.

## Out of scope

- Switching the default.
- Retuning Waves.
- The glider regime, which cards 76 and 84 answer.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the shipped Waves frame does not reproduce the recorded 0.796 five-point
score, stop — the baseline moved and the comparison is not the one stage 76
recorded.

## Verifier handoff

Look at the four frames before the prose and decide for yourself which Waves
you would ship. Note that "crisp bright rings" is not automatically better than
"soft mottled fronts on black" — the shipped look was chosen. If the appendix
treats higher coverage as self-evidently an improvement, that is the failure to
catch.
