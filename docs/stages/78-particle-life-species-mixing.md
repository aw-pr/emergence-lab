# Stage card 78-particle-life-species-mixing: an instrument for what the attraction matrix controls

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Base branch:** dev
- **Run branch:** autometta/78-particle-life-species-mixing
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Path claims:** e2e/harness/metrics.ts, docs/sweeps/particle-life-interestingness.md
- **Pairing rationale:** cross-family, and the worker family alternates from
  card 77 so the two draw on different provider windows when they overlap.
  Opus designs the statistic because the card is a definition question; the
  Codex verifier recomputes it on synthetic fields where the answer is known.
  Claims are disjoint from cards 77 and 79.
- **Type:** New instrument, reported beside the composite. Calibration only.

## Surfacing concern

The Particle Life write-up says twice that the composite cannot see what this
sim does. Stage 63's smoothed point-cloud instrument widened the spread from
0.025 to 0.048, and the write-up still closes with: "the species-mixing
statistic, how often unlike species are adjacent, what the attraction matrix
actually controls, remains the sharper follow-up instrument." Nothing has been
built. Every Particle Life number in the repo is a coverage story.

The harness rasterises Particle Life into three channels (red, green, blue
species density), not one per species. An instrument on those channels sees
colour-channel mixing, which is a proxy. Say so; do not present it as species
adjacency.

## Inputs (read these in your own context)

- `docs/sweeps/particle-life-interestingness.md` — the whole file
- `e2e/harness/metrics.ts` — `smoothPointCloudFrames`, `velocityCoherence`,
  `summarizeMetrics`, and how stage 63 and 65 reported instruments beside the
  composite without folding them in
- `e2e/harness/sims.ts` — the `PARTICLE_LIFE` block, read-only

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `channelMixing(fields, mask?)` in `e2e/harness/metrics.ts`: for each cell
   whose total density passes the sim's point-cloud threshold, the fraction of
   its density held by channels other than its dominant one, averaged over
   included cells. A field where every occupied cell is single-colour reads 0;
   a field where every occupied cell is an even three-way blend reads its
   maximum. Document the range and the units in the docstring.
2. Unit tests in the existing kernel-test discovery (a `*.test.cjs` beside the
   harness or wherever stage 65 put the circular-statistics tests) with three
   synthetic cases: pure segregation reads 0, uniform blend reads the maximum,
   and a half-and-half field reads between them. State the expected values as
   numbers, not as "greater than".
3. The statistic reported beside the composite in `summarizeMetrics` for sims
   that opt into `pointCloud`, without entering `interestingness`.
4. A dated appendix in the write-up: the three shipped references re-scored
   with the new reading beside the existing columns, and one paragraph on
   whether the reading separates Gas clouds, Cells and Chasers where the
   composite could not.

## Constraints

- The composite, its weights and every existing metric are unchanged. Sims
  without a `pointCloud` block produce byte-identical output.
- No sweep. Re-score only the three references, headlessly.
- No change to `sims.ts`; the instrument reads the config it already has.

## Acceptance criteria

1. `npm run verify` green, including the three new tests.
2. The contract-test guard passes unmodified.
3. A sim without `pointCloud` scores byte-identically to `dev`; show the diff
   for one Gray-Scott reference.
4. The three synthetic cases pass with the stated numeric expectations.
5. The three Particle Life references carry the new reading in the appendix.
6. The appendix names the instrument as a channel proxy, not species adjacency.

## Contract test

- **Test file:** `e2e/sweep.spec.ts`
- **Assertions digest:** the freeze-marker block stage 70 added around the
  `metrics harness rewards structure over washout` test, with its recorded
  sha256, must still validate unchanged. Do not write the literal marker tokens
  into this card's prose.

## Out of scope

- Folding the reading into the composite. That is a separate decision with a
  re-scoring plan, as the Game of Life write-up says of the multi-lag term.
- Per-species rasterisation in the harness driver.
- Boids, even though the write-up says the same instrument would serve it.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If the three-channel proxy cannot separate the references either, record that
with the numbers and stop; a negative calibration is a pass. Do not add a
per-species raster to make it work.

## Verifier handoff

Recompute the three synthetic cases by hand from the docstring's definition
before reading the test. Then run the Gray-Scott byte-identity check yourself.
Read the appendix last and confirm criterion 6.

## Re-card (2026-09-06, Codex session limit reached)

The Codex provider window is exhausted for this session, so the verifier seat
moved from `Codex GPT-5.6 Terra` to `Claude Sonnet 5`. The worker (Claude Opus
5) was already running when this changed and is unaffected.

The Metadata pairing rationale above is now partly stale and is left standing
as the record of what was designed: the cross-*vendor* independence it claims
is no longer available. What replaces it is cross-*model* independence, Opus
worker against a Sonnet verifier, which is weaker. Criterion-level effect: the
verifier must still recompute the statistic on synthetic fields where the
answer is known rather than reading the worker's arithmetic back. Nothing else
about this card changes.


### Correction (2026-09-06 14:0xZ)

The Re-card section above is **wrong about this stage and is retained only as
the record of the mistake**. This stage's verifier had already run as
`Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>` and passed, at 10:19:19Z, before the
controller rewrote the identity at 10:47Z. The re-card was applied from a
10:05Z snapshot without re-reading state immediately before editing, so it
overwrote the record of an attempt that had already happened.

The identity has been restored to what actually ran, in both the Metadata
above and `state/state.yaml`. No git damage resulted: the commit (`a93eba65`)
was made before the rewrite and already carries the correct
`Co-Authored-By: Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>` trailer.

The Codex session limit is real, but it bit after this stage was already done.
It only ever blocked card 81's worker, which was genuinely re-carded.
