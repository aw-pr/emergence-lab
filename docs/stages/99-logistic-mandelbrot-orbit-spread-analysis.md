# Stage card 99-logistic-mandelbrot-orbit-spread-analysis: measure the orbit-spread colouring before Inside-out is rebuilt on it

## Metadata

- **Authored:** 2026-10-02
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/99-logistic-mandelbrot-orbit-spread-analysis
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Path claims:** scripts/analyze-orbit-spread.mjs, docs/audits/2026-10-02-orbit-spread-colouring.md
- **Dispatch:** serial
- **Pairing rationale:** the operator asked for this run to lean on Anthropic allowance, with OpenAI used for validation. Fable 5.1 works the open-ended numerical study. Sol verifies across the family boundary; the checks are arithmetic against closed forms and a reading of whether the audit's recommendations follow from its own tables, with no browser, so the verifier dispatch stays small. No panel, no parallel workers.
- **Type:** Analysis. No production code change, no default change, no test change.

## Surfacing concern

Stage 98 made Inside-out colour each c-cell by its attracting-cycle multiplier, with no height term and a steady grey for every cell with no detected period. On review the operator found it does not show what they want: points heading towards complexity should differ in colour from points heading towards stability, and the chaotic band, the most complex part of the cloud, is the one part with no colour.

The operator's restated intent, agreed 2026-10-02:

> Inside-out colours each point by how far its height sits from the centre of its own column. For every c take a reference height h0(c). A point at height Re(z) reads the palette at `fract(bands * |Re(z) - h0(c)| - phase)`. As the phase advances, bands leave the reference height and travel outwards in both directions, up and down, along the orbit sheets.

Operator decisions already made, not open for this card to reverse:

- The centre h0(c) is the **mean height of the orbit at that c**.
- The distance is **absolute** (mirrored bands above and below), not signed.

This reverses stage 98's rule that height plays no part in Inside-out. Before an implementation card is written, the numbers that card must fix in advance are unknown. This card measures them.

## Objective

Produce a deterministic offline study of the orbit-spread scalar `|Re(z) - h0(c)|` on the shipped sampler, and an audit that fixes every numerical decision the implementation card needs: how h0 is estimated, how noisy it is in the chaotic band, how the scalar behaves across bifurcations, what band density suits it, and what the ground plane should show. Include still previews so the operator can see the colouring on the real-axis curtain before any renderer work.

## Inputs (read these in your own context)

- `AGENTS.md`
- `src/sims/logistic-mandelbrot/model.ts`: `sampleAttractorCell`, `estimatePeriod`, period detection window, clip and escape constants
- `src/sims/logistic-mandelbrot/kernel.ts`: `DEFAULT_KERNEL_WARMUP` (1500), `DEFAULT_KERNEL_SAMPLES` (8), `cycleBands`, `cycleSpeed`
- `src/app/orbitSampler.ts`, the period shader only (roughly lines 180-290): what the GPU path computes per cell and the two unused metadata channels
- `src/app/orbitColour.ts`: stage 98's mapping, which this scalar would replace
- `src/app/colormap.ts`: the `magma-cyclic` stops, for the previews
- `scripts/spike-period-census.mjs`: the pattern for an offline script over `.test-build/`
- `docs/audits/98-inside-out-cycling.md`, "Numerical method" section only
- `docs/plans/2026-09-19-logistic-mandelbrot-colour-field-review.md`

Do not read `src/app/orbit3d.ts` or `src/app/webglRenderer.ts` in full; they are large and this card changes neither. Keep your context lean: read by range.

## Deliverables

1. `scripts/analyze-orbit-spread.mjs` (new). Runs from the repo root after `npm run build:test`, imports the production sampler from `.test-build/sims/logistic-mandelbrot/model.js`, and prints deterministic JSON to stdout. It may iterate the map itself in float64 for long reference orbits, as `spike-period-census.mjs` does, but every figure described as "shipped" must come from the production `sampleAttractorCell` at the shipped warmup and sample count. No new packages. With `--previews <dir>` it also writes the PNG previews of deliverable 3 (use `node:zlib` for the encoder).
2. `docs/audits/2026-10-02-orbit-spread-colouring.md` (new). Answers questions A to G below with numbers traceable to named keys in the script's JSON, and ends with a section headed `## Decisions for the implementation card`.
3. Previews under git-ignored `e2e/artifacts/orbit-spread/`, not tracked:
   - `real-axis-phase-0.00.png`, `-0.25.png`, `-0.50.png`, `-0.75.png`: the real-axis curtain, Re(c) from -2 to 0.25 across, Re(z) from -2 to 2 up, each plotted point coloured by the operator's formula with the mean centre, `magma-cyclic`, at the audit's recommended band density.
   - `real-axis-centre-comparison.png`: the same view at phase 0 for each centre candidate in question B, stacked and labelled.
   - `off-axis-slice.png`: one slice that crosses the period-3 bulb above the cardioid and leaves the set, same colouring, with the slice's endpoints stated in the audit.

### Questions the audit must answer

- **A. Estimating the mean.** For a cell with detected period q the mean over exactly one cycle is exact; the mean over the shipped 8-sample plot window is biased whenever q does not divide 8. Quantify that bias for q = 3, 5, 6, 7 at their bulb centres. For cells with no detected period, tabulate the error of the running mean over N = 8, 64, 256, 1024 and 4096 iterates against a long float64 reference (at least 10^6 iterates), over at least 200 chaotic cells on the real axis and at least 200 off it. Report max and RMS error per N.
- **B. Is the centre smooth where it needs to be?** The colour strata in the chaotic curtain are level sets of `|Re(z) - h0(c)|`, so they are only coherent between neighbouring columns if h0 varies slowly from cell to cell. Measure the cell-to-cell jump in h0 across the chaotic band at the shipped grid pitch, both for the N-iterate estimate and for the long reference itself (the reference mean is not expected to be smooth in c, since periodic windows are dense). Express each as a fraction of one palette lap at band densities 1.5 and at your recommended value. Then compare, on the same cells, two alternative centres as comparators only: (i) the real part of the analytic fixed point `z* = (1 - sqrt(1 - 4c)) / 2`, principal branch, which is the cardioid sheet's own height continued smoothly through the whole set; (ii) one constant height per bulb, taken at the bulb's superattracting centre, real axis only. Report where each agrees with the mean, where it differs and by how much. The operator has chosen the mean. If the measurements say the mean produces incoherent strata in chaos, say so plainly with the numbers and state what you would use instead and why; do not silently substitute it.
- **C. Bifurcations.** Show the scalar is continuous across period-doubling at c = -0.75 and c = -1.25 and across the root of the period-3 bulb off the cardioid: tabulate max `|Re(z) - h0|` at a geometric sequence of offsets either side of each. Near a bifurcation the orbit converges slowly, so the shipped 1500-iterate warmup may leave residual spread on the stable side; measure that residual and say how far from each bifurcation it exceeds 1% of a lap.
- **D. Range and band density.** Give the distribution of `|Re(z) - h0|` by region: period 1, period 2, periods 3 to 32, and no detected period. From it recommend what `cycleBands` should mean in this mode (laps per unit of height deviation) and a value, justified by how much of a lap the period-2 branches span and how many laps the chaotic column spans. State the consequence that every period-1 point sits at distance zero, so the cardioid sheet takes a single colour that changes with phase.
- **E. Ground plane.** The ground has no height. Evaluate per-cell candidates for its scalar: maximum deviation in the column, and RMS deviation. For each give its range by region and its behaviour at the set boundary and under the cardioid. Recommend one.
- **F. Escaped and clipped cells.** Confirm what the scalar does for escaped cells (no points), for samples clipped at `|Re(z)| = 2`, and whether any bounded cell lacks a defined centre.
- **G. What stage 98 leaves behind.** List, by test title, which tests in `e2e/inside-out-cycling.spec.ts` and `src/app/orbitColour.test.cjs` assert behaviour this colouring contradicts (height independence, multiplier contours, neutral unresolved cells) and which still hold. State whether the frozen `e2e/inside-out-cycling.contract.spec.ts` assertions (visible colour motion at speed 0.1, none at speed 0) remain true under the new scalar by reasoning from the formula; do not run or edit it.

### `## Decisions for the implementation card`

One line each, a value and the JSON key or table that supports it: centre estimator and iterate count per cell class; whether the GPU sampler can carry h0 in an unused metadata channel and at what float precision cost; band density meaning and recommended default; ground scalar; treatment of escaped, clipped and slow-converging cells; stage 98 tests to retire; open risks.

## Constraints

- No change under `src/`, `e2e/`, `essays/`, `package.json`, `tsconfig*.json` or any existing script or doc. The two claimed paths are the whole diff.
- The operator's formula, the mean centre and the absolute distance are fixed inputs. Comparators inform; they do not replace.
- Do not supply an expected value as an input to the computation that is meant to produce it. Closed forms are used to check the script, never to seed it.
- The script must be deterministic: no wall-clock, no RNG without a fixed seed, stable key order. Total runtime under 5 minutes on this machine.
- Previews are evidence for the operator's eye. Do not claim in the audit that the colouring "looks good"; report what the images show and leave the judgement to the operator.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding: a headless dispatch exits when the turn ends.
- No commits by the worker, no queue mutations, no dependency install.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree and judges all rows.

1. **Scope and regression.** `git diff --stat dev...HEAD` plus `git status --short` show only the two claimed paths (previews are ignored files). `npm run verify` is green.
2. **Reproducible.** `npm run build:test && node scripts/analyze-orbit-spread.mjs > .test-build/spread-a.json && node scripts/analyze-orbit-spread.mjs > .test-build/spread-b.json && cmp .test-build/spread-a.json .test-build/spread-b.json` exits 0 and each run finishes in under 5 minutes. The output parses as JSON.
3. **Closed-form checks, computed by the verifier independently of the script.** The script's shipped-sampler figures must agree with these to 1e-4:
   - c = 0: period 1, h0 = 0, deviation 0.
   - c = -0.5: period 1, h0 = Re(z*) = (1 - sqrt(3)) / 2, deviation 0.
   - c = -1: period 2, cycle {0, -1}, h0 = -0.5, both deviations 0.5.
   - c = -0.8: period 2, h0 = -0.5, both deviations sqrt(0.2) / 2.
   - c = 1: escaped, no points, no centre.
   The verifier derives each value itself (the period-2 cycle on the real axis satisfies z1 + z2 = -1 and z1 * z2 = c + 1) and must not accept the script's own "expected" column as the reference.
4. **Estimator and smoothness tables.** For three chaotic cells of the verifier's own choosing (at least one off the real axis), the verifier computes the N = 64 running mean and a 10^6-iterate reference mean in a separate short program and confirms the script's reported errors for those cells, or for the nearest tabulated cells, to two significant figures. Every "fraction of a lap" figure in the audit equals jump times band density from the JSON.
5. **Recommendations follow from the data.** Each line of `## Decisions for the implementation card` cites a JSON key or audit table, and the cited numbers support the stated value. A recommendation that contradicts its own table, or that departs from the operator's mean centre without the explicit flag required by question B, fails this criterion.
6. **Previews.** `node scripts/analyze-orbit-spread.mjs --previews e2e/artifacts/orbit-spread > /dev/null` writes all six files; each decodes as a PNG of non-trivial size. The verifier opens `real-axis-phase-0.00.png` and `real-axis-phase-0.50.png` and confirms from pixels, not from the audit's description: the period-1 segment is a single colour within each frame and differs between the two frames; the two period-2 branches at one c carry the same colour as each other. Record sampled pixel values in the verifier envelope.
7. **Completeness.** Questions A to G each have an answer with numbers; G names tests by title. A question answered with "not measured" fails unless the audit explains why it could not be measured within this card's scope.

## Contract test

- **Test file:** None
- **Assertions digest:** None

Analysis stage with no production code under test; criterion 3's closed forms are the independent check.

## Out of scope

- Any renderer, shader, sampler, kernel, control or essay change. That is the next card, written from this audit.
- Changing defaults, palettes, tone mapping or Cycle mode.
- Rendered-frame interestingness scoring; a later run covers it once the mode exists.
- Lyapunov exponents or any new solver.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 40 minutes
- Planning evidence, `state/cost-log.jsonl` read 2026-10-02: worker n=54, median 1.92M tokens, nearest-rank p95 12.1M, max 21.2M; verifier n=50, median 1.45M, p95 5.5M. Plan about 3.5M for the pair; one outlier brings it to about 16M. The repo's resting daily cap is 130M with 0 spent at authoring, so no drain is needed. Serial, one worker then one verifier.
- Stop with an explicit partial result if the timebox cannot cover the remaining questions; answer A to D before E to G. A retry needs a re-brief.

## Dispatch envelope

Worker returns changed paths, the exact commands run with exit codes, the script's runtime, the preview paths, and one line per question A to G stating the headline number, in `state/envelopes/99-logistic-mandelbrot-orbit-spread-analysis.json` using the current dispatch template. Write the envelope as the final action of your last turn; a partial result with a written envelope is better than none.

Verifier writes the schema-valid `state/verifiers/99-logistic-mandelbrot-orbit-spread-analysis.json` with one result and literal evidence per numbered criterion, including its own independently computed values for criteria 3 and 4.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing to work around quota. The verifier needs no browser and no network, so the codex seat runs in its default sandbox.

## Re-brief 1 (2026-10-02, attempt 2)

Attempt 1 is preserved at `68a13332dbc83736a5af51821eedb78c3067d07f` on
`wip/99-logistic-mandelbrot-orbit-spread-analysis-attempt-1`. The Sol verifier
passed criteria 1, 2, 3, 4, 6 and 7, independently reproducing the closed
forms, three estimator rows and all 492 lap-fraction figures. It failed only
criterion 5, on two lines of `## Decisions for the implementation card`. The
measurements stand; do not redo the study or change any reported number.

Attempt 2 instructions, in addition to everything above:

1. Start from the preserved work: `git checkout 68a13332dbc83736a5af51821eedb78c3067d07f -- scripts/analyze-orbit-spread.mjs docs/audits/2026-10-02-orbit-spread-colouring.md`
   in the run worktree.
2. **Open risk (b) contradicts its own citation.** It recommends testing
   unresolved cells "to a 0.08-lap tolerance" while citing a worst case of
   0.0763 height units, which is 0.1145 lap at 1.5 bands. Restate the
   recommended tolerance so it covers the cited worst case, give it in both
   height units and laps, and check every other tolerance or threshold in the
   audit for the same unit slip.
3. **Decision 2 (GPU sampler channel) cites source lines, not a JSON key or
   audit table**, and the line it cites for the RGBA32F format belongs to the
   sample array, not the metadata target. Re-read `src/app/orbitSampler.ts`
   and cite the metadata target's own allocation and format, the shader line
   that leaves channel w unused, and the readback that consumes only x, y and
   z. Put the channel facts and the float32 precision figures in an audit
   table, or emit them from the script under a named JSON key, and cite that.
   If you change the script's output, the determinism check of criterion 2
   must still pass.
4. Confirm each of the seven decision lines cites a JSON key or an audit
   table and that the cited number supports the stated value.
5. Re-run criterion 1's and criterion 2's commands and the preview command in
   the foreground, then write the envelope as your final action. Keep it
   small: this is a two-line correction, not a rework.
