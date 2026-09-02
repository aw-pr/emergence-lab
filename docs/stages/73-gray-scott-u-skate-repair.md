# Stage card 73-gray-scott-u-skate-repair: U-skate gliders is a blank field with dots

## Metadata

- **Authored:** 2026-09-01
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/73-gray-scott-u-skate-repair
- **Worker effort:** high
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** same family, different model, Codex being exhausted at
  authoring time. Worker seat takes the heavier model because the judgement is
  about what the preset is *for* rather than about a numeric threshold; the
  verifier re-renders and looks.
- **Type:** Shipped-preset repair.

## Surfacing concern

Stage 70's re-baseline found, and recorded as out of its own scope, that the
shipped "U-skate gliders" preset (`F=0.062, k=0.0609`) is broken. It scores far
below every other preset under both the old and new kernels — 0.143 old, 0.201
new — while its nearest neighbour, Mitosis, scores 3.2x to 4.6x higher.

The frame explains the number. It is a near-uniform mid-grey field with a
handful of small dark dots: coverage 0.9485, above the composite's ~0.85
saturation edge; entropy 0.3753, well below the 0.47-0.70 the other survivors
manage; temporal flux 0.001534, frozen by step 700. It is not a low-scoring
pattern, it is an absence of one.

The preset is named for u-skate gliders — small self-propelled solitons that
travel across the field. It is currently shipping something that does not glide
and is not a glider.

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` — the pre-existing-defect section
  stage 70 added, with the full numbers
- `src/sims/gray-scott/presets.ts` and `kernel.ts`
- `e2e/harness/sims.ts` — the Gray-Scott sweep configuration

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Establish which of the two it is, and say so with evidence before changing
   anything: (a) the F/k pair is wrong or has drifted, and a nearby pair in the
   u-skate region of the Gray-Scott parameter space produces actual gliders; or
   (b) the pair is right but the preset's other settings — step count, initial
   seeding, timestep — never let the pattern develop. These need different
   fixes and guessing between them wastes the run.
2. The repair, whichever it is, with the preset rendering recognisable
   travelling gliders.
3. A dated appendix in `docs/sweeps/gray-scott-interestingness.md` recording
   the before and after scores and a description of what the frame now shows.
4. A screenshot committed under the sweep's artefact convention, so the next
   reader can see it without re-running anything.

## Constraints

- Only "U-skate gliders" changes. The other six shipped presets are untouched
  and must reproduce their recorded scores exactly.
- Do not change the metric stack or the composite to make this preset score
  better. The instrument is not what is wrong here.
- Headless for the sweep; use the browser for the visual confirmation.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. The other six presets reproduce their recorded scores exactly.
4. The repaired preset scores materially above its current 0.201 **and** the
   write-up describes a frame containing moving structures. A number that
   improves without the frame improving fails this criterion — say so plainly
   if that is what happens.
5. The appendix records old and new scores and names which of deliverable 1's
   two causes it was.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Every other sim, and every other Gray-Scott preset.
- The metric stack, the composite, and the weights.
- Adding new presets. This card repairs one, it does not extend the set.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 40 minutes

## Escalation

If no nearby parameter pair produces gliders at the resolution and step budget
this sim ships with, that is a recordable negative result: write down what you
searched, and recommend either retiring the preset or renaming it to describe
what it actually does. Do not ship a preset whose name promises something the
frame does not deliver, and do not invent a third option inside this stage.

## Verifier handoff

Look at the frame. This card cannot be judged from the composite alone — a
score can rise on coverage while the field stays dead, which is exactly how the
current preset scores 0.201. Confirm criterion 4 by viewing the rendered output
and saying whether you can see travelling structures, then check the other six
presets reproduce.

## Re-brief 2026-09-02: attempt 1 reached the answer, then kept going

Attempt 1 was killed by the operator at 00:35 BST after running 41 minutes past
its token-outlier warning and reaching 36,406,788 tokens — 22.2x the worker
baseline, and about four times what this whole batch was budgeted for. Its work
is preserved at `wip/73-gray-scott-u-skate-repair-attempt-1` (`95589fc`).
**Nothing in it is verified**, but it had already reached a defensible answer:

    git show wip/73-gray-scott-u-skate-repair-attempt-1

It concluded the preset should be **retired, not repaired**, and wrote the
reasoning into `src/app/presets.ts` and a 142-line appendix in
`docs/sweeps/gray-scott-interestingness.md`, with a committed screenshot at
`docs/images/2026-09-02-gray-scott-u-skate-washout.png`. Its finding, in its
own words: `F=0.062, k=0.0609` is the canonical u-skate pair from the
literature, but this kernel's five-point Laplacian at `Du=0.2097` floods it to
the uniform high-V steady state and freezes — no soliton, nothing that glides —
and no pair reachable on the F/k sliders produces travelling solitons either.

That is exactly the negative result this card's Escalation clause permits.

**Your job is to check that conclusion and stop, not to re-derive it.** Adopt
the preserved commit, verify the claim yourself on the evidence already
gathered, confirm the other six presets still reproduce, and write the
envelope. If you agree, the deliverable is the retirement plus its written
justification. Do not restart the parameter search: it has been done, it cost
36M tokens, and repeating it is the single most expensive way to fail this
card.

Criterion 4 is satisfied by a recorded negative result under the Escalation
clause, not only by a repaired preset. Say plainly which of the two you are
delivering.

**Write `state/handoffs/73-gray-scott-u-skate-repair.json` as soon as you have
a defensible position and update it as you go.** Attempt 1 produced its answer
and never reported it, which is why it was still running when it was killed.
Do not touch the run worktree's `state/` symlink; the tick creates and
validates it.
