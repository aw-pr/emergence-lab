# Stage card 76-gray-scott-nine-point-laplacian: can a finer stencil reach the glider regime

## Metadata

- **Authored:** 2026-09-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/76-gray-scott-nine-point-laplacian
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** src/sims/gray-scott/kernel.ts, src/sims/gray-scott/kernel.test.cjs, src/app/presets.ts, docs/sweeps/gray-scott-interestingness.md
- **Pairing rationale:** heaviest available seat on the worker because this is
  a kernel-wide numerical change with a re-baseline attached, and stage 73's
  first attempt showed how easily this question runs away. Opus verifies from
  the numbers and the frames. Batch is on Anthropic quota.
- **Type:** Kernel experiment with a re-baseline; Gray-Scott is the priority
  kernel.

## Surfacing concern

Stage 73 established that no `F`/`k` pair reachable on the sliders produces
travelling u-skate solitons, and attributed that to discretisation: feature size
scales as the square root of `Du`, and `Du = 0.2097` is already 84% of the
explicit-Euler stability ceiling for the five-point Laplacian at `dt = 1`. Its
appendix names the only route to the glider regime as a nine-point stencil or a
sub-unit timestep, and calls it a kernel-wide decision with its own re-baseline
attached. That decision has not been made.

`kernel.ts` currently ignores the `dt` argument to `step` and uses a five-point
Laplacian. Either change moves every Gray-Scott preset.

## Inputs (read these in your own context)

- `src/sims/gray-scott/kernel.ts` and `kernel.test.cjs`
- `docs/sweeps/gray-scott-interestingness.md` — the scoring table and the
  stage 73 appendix, including the parameter boxes it already searched
- `src/app/presets.ts` — the Gray-Scott block
- `e2e/harness/sims.ts` and `e2e/sweep.spec.ts` — the sweep configuration
  and the frozen contract test

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A nine-point Laplacian in the kernel, selectable and defaulting to the
   current five-point stencil, so nothing shipped changes until deliverable 3
   says it should. A unit test showing both stencils agree on a smooth field
   to within the expected truncation difference.
2. One measured answer to the question in the title: with the nine-point
   stencil, at the shipped grid and step budget, does `F=0.062, k=0.0609` or
   any pair in stage 73's 210-set u-skate box produce structures that
   travel, by stage 73's own straightness measure? Yes with the pair and the
   numbers, or no with the box searched. **Stop searching when you have the
   answer.** Stage 73's box is the search space; do not widen it.
3. A recommendation, recorded in a dated appendix in the sweep write-up:
   switch the default stencil, or leave it. If switching, the full re-baseline
   of the six shipped presets under the new stencil goes in the table, and
   any preset whose frame changes character is named. If not, the default and
   the six presets are untouched.
4. If gliders are found: a frame committed under `docs/images/`, and a note in
   the appendix that a restored glider preset is a separate card, not this
   one. Do not add the preset here.
5. The stage 73 item "Gliders at a finer discretisation" closed with this
   stage's id and date, additively, under the original text.

## Constraints

- With the default stencil selected, the six shipped presets reproduce their
  recorded scores exactly. This holds whether or not the recommendation is to
  switch.
- No metric, weight, or composite change.
- Sub-unit timestep is the fallback only if the nine-point stencil alone does
  not answer the question, and it stays behind the same default. Say in the
  appendix if you needed it.

## Acceptance criteria

1. `npm run verify` green, including the new stencil test.
2. The contract-test guard passes unmodified.
3. With the default stencil, the six presets reproduce their recorded scores
   exactly.
4. Deliverable 2 has a yes-or-no answer with the evidence stated, and the
   search stayed inside stage 73's box.
5. The appendix records a recommendation and closes the stage 73 item.
6. If the recommendation is to switch the default, the re-baseline table is
   complete for all six presets and the write-up names any preset whose frame
   changed character.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Adding or restoring any preset. Card 75 owns the labyrinth; a glider preset,
  if reachable, is a card that does not exist yet.
- Every other sim.
- Widening the parameter search beyond stage 73's u-skate box.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the nine-point stencil at the shipped grid still cannot hold a soliton, that
is the answer and it is worth recording: write the negative result with the
box searched, recommend leaving the default, and stop. Stage 73's first attempt
was killed at 22x its token baseline for continuing past exactly this point.
An answer you have reached is done; do not keep looking for a different one.

## Verifier handoff

Check criterion 3 first by running the sweep headless on the default stencil.
Then read deliverable 2's evidence and rerun the straightness measure on the
pair the worker names, if any. If the recommendation is to switch, look at the
six re-baselined frames in the browser and confirm the write-up's description
of which changed character.
