# Stage card 101-logistic-mandelbrot-cycle-interestingness-harness: score rendered colour cycling on the Mandelbrot cloud

## Metadata

- **Authored:** 2026-10-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Verifier:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/101-logistic-mandelbrot-cycle-interestingness-harness
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Path claims:** e2e/cycle-interestingness.spec.ts, e2e/harness/cycleScore.ts, e2e/harness/cycleScore.test.cjs, docs/sweeps/logistic-mandelbrot-cycle-interestingness.md, tsconfig.test.json
- **Dispatch:** serial
- **Pairing rationale:** instrumentation before the sweep that would use it (run-design rule). Metric design is the most judgement-laden part of the pair, so it goes to the Fable tier, as card 63 did for the point-cloud metrics; Sol verifies cross-family, re-running the browser harness itself. The next card alternates: Sol works the mechanical sweep and an Anthropic model verifies.
- **Type:** Instrumentation. No production code change.

## Surfacing concern

The operator wants Logistic Mandelbrot's colour cycling, in both Cycle and the rebuilt Inside-out mode (card 100), to score very high on the repo's interestingness scale. That scale (`interestingness` in `e2e/harness/metrics.ts`: coverage plateau, spatial structure, entropy, temporal liveliness) has never seen this simulation. `e2e/harness/sims.ts` has no entry for it, because the sweep harness drives kernels and scores their fields, while cycling is a renderer effect that exists only in the rendered frame. The palette sweep (`e2e/palette-sweep.spec.ts`) scores rendered frames but with colour metrics only (lit fraction, chroma, band edges, colour travel), and card 96's audit found its offline ranking fragile.

Before anyone sweeps parameters, there has to be one agreed way to turn a rendered cycling sequence into a score, with a measured baseline and evidence that the score moves the right way when known things change.

## Objective

Add an opt-in Playwright harness that renders Logistic Mandelbrot through the production WebGL path, captures a short time sequence at fixed camera poses, and scores it with the repo's composite interestingness applied to the rendered frame plus the existing colour metrics. Record the shipped defaults' scores in both colour modes as the baseline, and show the score responds correctly to controlled changes.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md` (the `src/app` test-build convention)
- `e2e/harness/metrics.ts`: `interestingness`, `scoreFrames`, `frameMetrics`, `smoothPointCloudFrames`, `temporalFlux`
- `e2e/harness/frame.ts`: `decodePng`, `toOklab`, `frameColourMetrics`, `frameDifference`, `contactSheet`
- `e2e/palette-sweep.spec.ts`: how a candidate is driven through localStorage and the colour panel, the frozen-params pattern, per-candidate contexts
- `e2e/inside-out-cycling.spec.ts` and `e2e/harness/insideOut.ts`: camera posing (the "Bifurcation curtain" preset, the period-2 dolly), `data-orbit3d-*` readiness attributes
- `e2e/harness/report.ts`: `metricsTable`, `writeText`, `writePng`
- `docs/sweeps/logistic-mandelbrot-palette-cycling.md` and `docs/audits/2026-09-20-cycle-palette-sweep-audit.md`: what the earlier colour metrics found and where they failed
- `docs/audits/100-inside-out-spread-colouring.md`: the open point about the shipped palette being flat across about 58% of a lap
- `src/sims/logistic-mandelbrot/kernel.ts`: parameter keys and defaults for `colourMode`, `cycleSpeed`, `cycleBands`, `geometryMode`
- `playwright.config.ts`

Keep context lean; read `src/app/orbit3d.ts` and `src/app/webglRenderer.ts` only by range if a readiness attribute needs checking.

## Deliverables

1. `e2e/harness/cycleScore.ts` (new, pure): given an ordered sequence of decoded frames, returns a `CycleScore` with (a) the repo composite `interestingness` computed on the frame's luminance field after a Gaussian blur, scored per consecutive pair and averaged, with coverage taken against a lit threshold stated in the file; (b) the colour metrics from `frameColourMetrics` averaged over the sequence; (c) colour travel, the mean OKLab distance between consecutive frames over lit pixels; (d) a single `cycleInterestingness` in [0, 1] that combines them, with its formula and weights written in the docblock and every term exported separately so a sweep can re-weight without re-rendering. Pure: no DOM, no Playwright.
2. `e2e/harness/cycleScore.test.cjs` (new) and `tsconfig.test.json` inclusion per `docs/INTERFACE.md`: synthetic-frame tests that pin the formula: identical frames give zero travel and the liveliness floor; a frame sequence whose bands move gives positive travel; a blank frame scores 0; a solid lit frame scores 0 through the coverage factor.
3. `e2e/cycle-interestingness.spec.ts` (new, opt-in with `CYCLE_SCORE=1`): for each pose in {default view, "Bifurcation curtain" preset, period-2 bulb with ground} and each colour mode in {cycle, inside-out}, at the shipped defaults, capture at least six frames at a fixed interval spanning at least one third of a palette lap at the shipped speed, with camera parked, reveal and sweep off, and score them. Write per-candidate JSON, a contact sheet of the sequence, and a ranked table under git-ignored `e2e/artifacts/logistic-mandelbrot-cycle/`. Also run the sensitivity set in criterion 4.
4. `docs/sweeps/logistic-mandelbrot-cycle-interestingness.md` (new): the method, the baseline table (both modes, three poses), the sensitivity results, what the composite rewards and penalises on this object, and a short section "What the sweep card may vary" listing the parameters and ranges the baseline suggests are worth sweeping.

## Constraints

- No change under `src/`, `essays/`, `public/` or to any existing e2e spec, harness file, preset or default. `tsconfig.test.json` may gain the new include only.
- Use the production renderer at the shipped quality; no test-only rendering path, no reduced point budget, no mocked palette.
- Score the rendered frame, not the kernel field. Reuse `interestingness` and `frameMetrics` from `metrics.ts` rather than re-implementing them; if the composite needs an adapter (luminance extraction, blur), the adapter lives in `cycleScore.ts`.
- Determinism: fixed viewport, fixed poses, phase pinned by driving `cycleSpeed` and elapsed time the way the inside-out spec does; three repeated captures of one candidate must agree on `cycleInterestingness` within 0.02.
- Report numbers as measured. Do not tune the formula until the shipped defaults score high; the baseline is whatever it is.
- Run every command in the foreground and wait for it to exit; never background a command or end a turn with one outstanding. Write the envelope as your final action.
- No new packages, no commits, no queue mutations.

## Acceptance criteria

The Sol verifier runs every command independently in the run worktree.

1. **Regression and scope.** `npm run verify` green; `git diff --stat dev...HEAD` and `git status --short` show only the claimed paths. `scripts/check-contract-test-gate.sh --worktree` exits 0.
2. **Formula pinned.** `npm run build:test && node --test e2e/harness/cycleScore.test.cjs` passes with at least the four synthetic cases of deliverable 2, and the verifier confirms the docblock formula matches the code by reading both.
3. **Baseline measured.** `CYCLE_SCORE=1 npx playwright test e2e/cycle-interestingness.spec.ts --grep baseline --workers=1` produces six scored candidates (three poses by two modes), each with at least six frames, JSON, a contact sheet and a table row; all `cycleInterestingness` values lie in (0, 1); the verifier opens two contact sheets and confirms the frames show the cycling they are scored on.
4. **Sensitivity.** `--grep sensitivity` shows, at the default pose in each mode: speed 0 scores below speed 0.1 through the liveliness term with travel 0 at speed 0; `cycleBands` 5 changes band-edge density relative to 1.5 in the direction the colour metrics predict; contrast 1.4 against 2.4 changes chroma in the direction card 96's audit measured. Each comparison is reported with both numbers.
5. **Repeatability.** `--grep repeat` captures one candidate three times in fresh contexts; `cycleInterestingness` spread is at most 0.02 and every component is reported.
6. **Write-up.** The sweep document carries the baseline table with literal artifact paths, the sensitivity table, and the "What the sweep card may vary" section with at least four parameters and the reasoning for each range.

Run the whole spec once as well: `CYCLE_SCORE=1 npx playwright test e2e/cycle-interestingness.spec.ts --workers=1`.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The formula is new; pinning it before it is designed would fix the wrong thing. Criterion 2 pins it once written, and card 102 inherits it unchanged.

## Out of scope

- Sweeping parameters or recommending any change to defaults; that is card 102.
- Changing the composite in `metrics.ts` or any other simulation's sweep.
- Palette authoring.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes
- Planning evidence, `state/cost-log.jsonl` read 2026-10-03: card 100's browser-heavy pair cost 11.7M + 6.7M; card 63, the nearest instrumentation precedent, is older and smaller. Plan about 15M for the pair, about 35M with one outlier. Serial.
- Stop with an explicit partial result if the timebox cannot cover the remaining criteria; deliver 1 to 3 before 4 to 6.

## Dispatch envelope

Worker returns changed paths, commands with exit codes, the baseline table, and the sensitivity and repeatability figures in `state/envelopes/101-logistic-mandelbrot-cycle-interestingness-harness.json`, written as the final action. Verifier writes `state/verifiers/101-logistic-mandelbrot-cycle-interestingness-harness.json` with one result and literal evidence per criterion.

## Family-specific notes

Both roles use the repo's subscription CLI routes. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex seat for the browser.
