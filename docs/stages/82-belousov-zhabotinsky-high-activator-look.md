# Stage card 82-belousov-zhabotinsky-high-activator-look: is the top of the diffusion ramp a picture or an artefact

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Base branch:** dev
- **Run branch:** autometta/82-belousov-zhabotinsky-high-activator-look
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** docs/sweeps/belousov-zhabotinsky-interestingness.md, docs/images/
- **Pairing rationale:** cross-family. The Codex seat drives the browser and
  captures frames; the acceptance here is a judgement about what a picture
  looks like, so the Claude aesthetic tier verifies rather than a numeric seat.
  Fable is asked to look at the frames and disagree if it sees something else.
- **Type:** Visual adjudication of a measurement result. No preset change.

## Surfacing concern

Stage 81 swept the three BZ diffusion rates and found the composite score
monotone in the activator rate across the whole spine, 0.879 to 0.967, with no
interior optimum — it stopped only because the activator slider ends at 0.35.
Almost all of that ramp is the spatial autocorrelation term rising 0.81 to
0.97. The kernel's own parameter note describes high activator diffusion as
blur: "higher values blur the spiral and target-pattern fronts into softer,
wider bands." Stage 81 declined to promote and wrote: "Treat the high-A end as
a metric artefact until someone looks at it."

Nobody has looked. This card is the looking.

## Inputs (read these in your own context)

- `docs/sweeps/belousov-zhabotinsky-interestingness.md` — the 2026-09-06
  appendix in full, especially "The line, and why it is not the line the card
  asked for" and "Promotion"
- `src/sims/belousov-zhabotinsky/kernel.ts` — the slider ranges and the
  parameter note on damping and front width
- `e2e/harness/driver.ts` — how an existing card captured a frame to
  `docs/images/`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Frames captured through the browser at the shipped "Spiral waves" feed/kill,
   at four activator values spanning the ramp: the shipped value, one mid-spine
   value, A = 0.27, and A = 0.35 (the slider maximum). Same seed, same step
   count, same colourmap for all four. Commit them to `docs/images/` with dated
   names.
2. A dated appendix section answering, in prose, one question: as the activator
   rate rises to the top of its range, does the field become a *better picture*
   or a *softer one*? Name what changes — front width, spiral pitch, contrast,
   whether spiral cores survive — and say which frame you would ship.
3. An explicit verdict on the 0.967 score: is it reading a real improvement, or
   is it the structure term rewarding blur? One paragraph, tied to the frames.
4. A promotion recommendation or an explicit "none", with the reason.

## Constraints

- No preset change. `src/app/presets.ts` is not in your claims.
- No metric, weight, threshold or composite change. If you conclude the metric
  is wrong, that is card 83's subject and an escalation here, not an edit.
- No new sweep sets and no change to `e2e/harness/sims.ts`.
- The four frames differ in the activator rate and nothing else. State the
  seed and step count in the appendix so the capture can be repeated.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes on the staged change set, invoked with the
   test file named explicitly. A bare invocation against an unstaged tree exits
   0 without inspecting anything and is not evidence — see card 86.
3. Four frames exist in `docs/images/`, and the appendix names the seed, the
   step count and the four activator values.
4. The appendix answers the picture-or-blur question in prose that a reader who
   has not seen the frames can act on.
5. The verdict on the 0.967 score is present and takes a side.
6. The recommendation names a promotion or "none".

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** `sha256:d423a74581557368b535a0be297459def702f2f9357ee38f77e191e8e164d676`

That is the freeze stage 70 placed around the `metrics harness rewards
structure over washout` test, verified intact on 2026-09-06. If your change
does not touch that file the gate has nothing to check, and criterion 2 is
satisfied by the gate running over your staged set and reporting no violation.

## Out of scope

- Changing the activator slider's range.
- Promoting anything. A promotion is its own card.
- The catalyst rate, which stage 81 showed moves the score by 0.011 across its
  whole range.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the four frames are visually indistinguishable, say so and stop — that is
itself the answer to the card, and it means the ramp is measuring something no
viewer can see. Do not hunt for a fifth parameter to make a difference appear.

## Verifier handoff

Look at the frames before you read the prose, and form your own view of which
one you would ship. Then read the appendix and say whether it describes the
same pictures you saw. This is the criterion that cannot be checked by rerunning
a number.
