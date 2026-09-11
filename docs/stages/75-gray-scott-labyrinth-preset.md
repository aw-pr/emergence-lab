# Stage card 75-gray-scott-labyrinth-preset: decide the 0.727 labyrinth

## Metadata

- **Authored:** 2026-09-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/75-gray-scott-labyrinth-preset
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/app/presets.ts, docs/sweeps/gray-scott-interestingness.md
- **Pairing rationale:** same family, different model; the batch is on
  Anthropic quota. The worker seat takes the heavier model because the call is
  a visual judgement about whether the set needs this pattern, and the verifier
  re-renders and looks.
- **Type:** Preset judgement, closing an item stage 73 left open.

## Surfacing concern

Stage 73 retired "U-skate gliders" and, in its appendix under "Two things a
future card could pick up", left one candidate undecided: `F=0.062, k=0.0615`,
a static labyrinth scoring 0.727 at flux 0.0032, a hair above the retired
preset's kill rate. It is a real pattern, but the appendix notes it is close to
Coral (0.710) and Worms (0.709) and would need a visual case for a third of
that regime. Nobody has made or refused that case, so the item sits open in
the sweep write-up with no owner.

The Gray-Scott dropdown currently ships six presets after the retirement. This
card decides whether it ships seven.

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` — the stage 73 appendix, the
  sweep's scoring table, and the promotion bar the earlier sweeps used
- `src/app/presets.ts` — the Gray-Scott block, including the retirement note
- `e2e/harness/sims.ts` — the Gray-Scott sweep configuration

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Render `F=0.062, k=0.0615` at the shipped `Du`, `Dv` and `stepsPerFrame`
   alongside Coral and Worms, and write down what distinguishes it visually,
   or that nothing does. Commit the three frames under `docs/images/` with the
   date prefix the existing screenshot uses.
2. A decision, one of exactly two: promote it as a seventh preset with a name
   that describes the frame, or reject it. Either way the reasoning goes in a
   dated appendix in `docs/sweeps/gray-scott-interestingness.md`, and the
   "Two things a future card could pick up" item is marked closed with this
   stage's id and date, additively, under the original text.
3. If promoted: the preset entry, and its score recorded in the sweep table
   from a headless run, not copied from the appendix.

## Constraints

- The six existing presets are untouched and must reproduce their recorded
  scores exactly.
- No metric, weight, or kernel change. The instrument is not in question.
- Headless for the scores; use the browser for the frames.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes unmodified.
3. The six existing presets reproduce their recorded scores exactly.
4. Three committed frames exist and the appendix's visual case refers to them.
5. The appendix records a decision and closes the stage 73 item with this
   stage's id and date. "Undecided" fails this criterion.
6. If promoted, the new preset's score in the table came from a run this stage
   made, and the write-up says which command produced it.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Every other sim, and the other Gray-Scott item stage 73 left open (gliders at
  a finer discretisation), which is card 76.
- Searching for a better labyrinth. The candidate is the one pair named above.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the frame cannot be rendered in the browser from this seat, score it
headless, commit what you can, and hand the visual judgement to the verifier
in the envelope with a `partial` status. Do not decide blind.

## Verifier handoff

Look at the three frames. Criterion 4 and 5 are about whether the stated
visual case is true of the pictures, not about the score. Then check the six
presets reproduce.

## Re-brief 2026-09-03: the frames exist, the decision does not

Attempt 1 rendered all three frames by 22:38 BST, then its API requests
started timing out: 40 `Request timed out` errors, retries exhausted at
23:10, and the tick stalled it on wall-clock at 23:24 with no envelope. Its
work is preserved at `wip/75-gray-scott-labyrinth-preset-attempt-1`
(`c5c42fa7e4059910dfc6b0730fcf6f33300741d5`), authored to Claude Opus 5. **Start there.**

    git show --stat wip/75-gray-scott-labyrinth-preset-attempt-1

What it holds: `e2e/artifacts/scratch75/` with `candidate-labyrinth.png`,
`coral.png` and `worms.png` (plus `field-*.png` raw-field variants), and the
scratch specs `e2e/scratch75.spec.ts` and `e2e/scratch75b.spec.ts` that
produced them through the headless sweep driver. No appendix, no decision, no
preset entry, no envelope.

Scope for this round:

1. Cherry-pick the preserved commit. Move the three named frames to
   `docs/images/2026-09-03-gray-scott-<id>.png`; delete the scratch specs and
   the `field-*` variants before you finish, since deliverable 1 asks for
   three committed frames, not a scratch directory.
2. Look at each frame **once**, make the visual case or say there is none,
   and decide. Do not re-render unless a frame is unreadable.
3. If promoted, add the preset and score it headless as deliverable 3 says.
4. Close the stage 73 item in the appendix and write the envelope.

Keep your context small: read the three PNGs one at a time and nothing else
binary. Attempt 1's transcript was 1.2 MB when its requests began timing out.

The acceptance criteria above are unchanged.

## Correction 2026-09-03, same round: the frames did not survive the requeue

The re-brief above says the preserved commit
`c5c42fa7e4059910dfc6b0730fcf6f33300741d5` holds the three frames. It does
not. `e2e/artifacts/` is gitignored, so the preserve verb committed only the
two scratch specs, and the requeue then removed the worktree the PNGs were
in. What you have is the specs that make them.

So step 1 becomes: cherry-pick the preserved commit, run
`npx playwright test e2e/scratch75b.spec.ts` once (it drives the headless
sweep harness and writes `e2e/artifacts/scratch75/field-*.png` for the
candidate, Coral and Worms), then copy those three into `docs/images/` under
the dated names and continue from step 2. One run; do not iterate on the
specs. Everything else in the re-brief stands.
