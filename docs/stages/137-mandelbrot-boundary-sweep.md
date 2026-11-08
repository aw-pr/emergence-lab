# Stage card 137-mandelbrot-boundary-sweep: Mandelbrot boundary detail and shared fractal coverage

## Metadata

- **Authored:** 2026-10-30
- **Orchestrator:** Codex planning session
- **Worker:** GPT-6.1 Sol
- **Verifier:** Claude Sonnet 5.5
- **Base branch:** dev
- **Run branch:** autometta/137-mandelbrot-boundary-sweep
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** alternating GPT/Claude workers with independent cross-family verification. Coding tiers suffice for bounded measurement; no frontier-tier verifier or polling loop.
- **Open decisions:** none
- **Readiness:** Operator approved 2026-10-30; lead admission review complete. Core oracle/baseline and cross-family cold-read closure recorded below; real sweep and visual evidence remain execution deliverables.

## Surfacing concern

Live dev at 14029cefb4f5 has 19 sweep configs covering 16 kernels, not 18 distinct kernels. Five requested kernels lack configs; Lorenz is already covered and fractal is shared code. Historical sweep metrics can reward blur, brightness or snapshot timing. This card tests a bounded new region and retains visual evidence. See the batch report for the current Brian’s Brain resolution and Gray-Scott baseline failure.

## Objective

Add opt-in static edge/boundary metrics and Mandelbrot coverage to the existing harness; find distinct shorelines rather than maximising palette motion. Pin palettePhase=0 and cycleSpeed=0 for geometry scoring. Compare interior/exterior mix, multiscale edge density and entropy; include flat, split-plane, fine-boundary and noise calibration controls. Reject noise-only and solid-field winners. Sample centre/zoom pairs around shipped views, then refine the best distinct boundaries. Record iteration convergence at doubled iteration limits within the existing cap (base 2048, effective 4096; automatic zoom boost). If doubling is capped, compare the actual effective limit against a lower reference and report the cap-limited uncertainty; never claim a doubling that did not occur. Write fractal-interestingness.md as a shared-helper coverage index: fractal/detail.ts is not a standalone simulation.

Search allowance: 48 coarse views total across shipped anchors + at most 32 refined views. Instrument: escape-time boundary metrics; no temporal bonus. Before measurement, the worker retains a manifest under docs/sweeps/data/2026-10-30/ with exact candidate values, all fixed parameters, the old grid/appendix ranges and source citations, inclusion/exclusion reasons, and reproduction settings. Verifier checks its ranges against the cited source, not just the worker’s novelty label. References and validation repeats are additional to these candidate counts. At most three proposed finalists per kernel/variant, plus explicit no-promotion outcomes where appropriate.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `src/app/presets.ts`
- `docs/sweeps/2026-10-30-interestingness-batch.md`
- `src/sims/mandelbrot/kernel.ts`
- `src/sims/fractal/detail.ts`

## Deliverables

1. Add only the harness configuration, metric integration and supplemental implementation tests needed by this objective under `e2e/harness/` and `e2e/`; reuse existing paths.
2. Write or append `docs/sweeps/mandelbrot-interestingness.md` in the Gray-Scott format: method, searched/not-searched axes, ranked candidates, current references, interpretation, proposed promotions and reproduction commands.
3. Write `docs/sweeps/fractal-interestingness.md` as a helper-to-consumer coverage index, with iteration-limit method, each consumer’s report link and explicit pending/completed status; no independent rankings or fake fractal presets. Card 149 reconciles the final links/status.
4. Retain complete compact result JSON under `docs/sweeps/data/2026-10-30/` and finalist/reference images under `docs/images/sweeps-2026-10-30/`, linked from the write-up.

## Constraints

Static geometry: score at 128×128, validate shortlisted views at 256×256 and capture app screenshots at a recorded fixed viewport. Time-strip/seed requirements are N/A to fixed deterministic geometry; cycling remains a separately labelled presentation experiment.

- Work from dev; never push main or publish. No production preset/default/kernel or interface changes. Proposed presets live only in reports pending operator visual sign-off.
- Logistic-mandelbrot is entirely out of scope, including parked branches, stages 129–136/130a and their evidence. Do not revive or alter them.
- Do not edit scripts/git-hooks/pre-push or scripts/publish-sync.sh. Do not change queue, pause, caps, auth routes or orchestration infrastructure.
- Preserve historical results and frozen assertions. New sweep configurations are additive, with unique artifact IDs; old configs remain reproducible with stale historical references preserved under their old IDs and corrected current-reference rows added separately.
- New metrics are opt-in and carry a method version in results; existing scoreFrames outputs and historical configs must remain unchanged. Current shipped references get distinct new IDs when historical rows are stale.
- Use existing driver, metrics and report helpers. No new generic sweep framework. Keep full candidate params, seed/determinism, grid, step count, metric version and iteration settings in retained evidence.
- Metric scores shortlist candidates; they do not decide aesthetic superiority. Hull/filament/connectivity/diversity descriptions are manual visual findings with linked evidence, not new uncalibrated numerical class labels. Report non-finite output, fraction at channel endpoints and off-frame clipping explicitly; do not promote pathological output. Frozen calibration orderings are completed by the orchestrator before dispatch. Negative results are valid. No fabricated promotion quota.
- Screenshot finalists alongside current shipped references at equal size and settings. Dynamic finalists require at least three separated frames plus a repeat at a longer horizon; stochastic finalists require three seeds where supported. Clearly distinguish grayscale field PNGs from actual app renderer screenshots.
- Store compact ranked results and finalist screenshots under docs/sweeps/data/2026-10-30/ and docs/images/sweeps-2026-10-30/; bulky scratch output stays in e2e/artifacts/. Never rely only on git-ignored evidence for a promotion proposal.

## Acceptance criteria

1. Verifier: `npm run verify` passes. Planning base: PASS, 395 passed and 38 skipped kernel tests; typecheck/build green. Skips are not passes.
2. Verifier: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 137 "` completes the declared candidate list and every current reference, with no skipped sweep tests, duplicate/overwritten candidate IDs, missing metrics, non-finite scores or missing outputs. Planning base: discovery command with `--list` returned “No tests found”, zero matching tests (expected missing new sweep); this is not PASS. The worker implements this exact titled sweep and the verifier must observe nonzero executed tests. Do not use Playwright exit 0 with zero matching tests as evidence.
3. Verifier: independently re-run the shortlisted candidates and current references, inspect screenshots/time strips at app-relevant resolution, and reproduce numeric readings from retained raw results. Use identical deterministic inputs in the same browser/runtime: require identical candidate ordering and metrics within absolute 1e-9, reporting any larger deviation as FAIL/inconclusive rather than widening tolerance. For stochastic kernels replay each explicit seed, report all three readings and their spread; three seeds are robustness evidence, not a distributional guarantee. Different-resolution visual checks are separate, not exact numeric replays. Missing evidence is FAIL; a visually weak but honestly measured negative finding may PASS.
4. Verifier: `git diff --name-only` and `git diff -- src scripts state` demonstrate scope compliance; review the retained manifest against every reported claim. No production code/default, parked-arc, queue or budget changes are permitted.
5. Verifier: run the new frozen contract and `scripts/check-contract-test-gate.sh --worktree`; digest violations fail. The baseline command is `npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"`. Planning result: 4 passed, 1 known Gray-Scott exact-literal failure, 1 opt-in skipped. Before card 143 lands, this precise known failure may remain only if independently reproduced unchanged; it is not a new acceptance failure or a whole-suite PASS. After 143 lands, its repaired explicit-five-point and added nine-point regressions must pass. Never silently change old expected literals or frozen assertions.
6. Operator: promotion is a separate visual sign-off after reading the images and candidate parameters. Stage PASS accepts research/harness work on dev only, not a production preset change.

## Contract test

- **Test file:** e2e/sweep-137.contract.spec.ts
- **Assertions digest:** sha256:65e2e9d78cd373d1763dadd7dde8e4ee967fc8ebaa6f8a130bd689e7c0b6986b
- **Oracle command:** `SWEEP_CONTRACT=137 npx playwright test e2e/sweep-137.contract.spec.ts`
- **Oracle proof:** On unchanged dev source `14029cefb4f5`, the equivalent node-only command with a temporary Playwright config (no webServer/browser) executed four tests: two PASS (bounded valid/invalid evidence fixtures and protected-source/historical-config regressions), two intended FAIL (missing additive config, missing staticBoundaryMetrics export). No tests skipped. New sweep discovery with `SWEEP=1 npx playwright test e2e/sweep.spec.ts --list -g "sweep 137 "` reports zero matching tests: expected missing implementation, never a successful sweep. Numeric metric positive proof is deliberately not pre-implemented: the literal flat/split/band/noise fixtures and feasible ordering are frozen, while implementation and real-kernel replay remain worker/verifier obligations. The evidence validator has a passing 48/64-candidate synthetic fixture and rejects count mismatch, non-finite score, manifest mismatch, empty references, unknown finalist, absent images, wrong method and invalid PNG. These fixtures prove the checker, not a real sweep or aesthetic result.

The oracle is opt-in only with its exact SWEEP_CONTRACT stage ID, so future queued cards do not break the normal e2e suite. The explicit command above must execute all four tests without skips. All assertion helpers and fixtures are inside the frozen block; worker-written supplemental tests must be separate. The independent verifier still owns actual-image inspection, kernel-based numeric replay, current shipped-reference completeness, source-novelty adjudication and iteration/resolution convergence; absent supplemental evidence is FAIL regardless of the core result. No automatic check substitutes for operator visual approval.

### Frozen evidence shape

Add a config whose artifactId is `sweep-137-mandelbrot`. Its expanded candidate list must equal the retained ranked list by full parameters. Store `docs/sweeps/data/2026-10-30/137/mandelbrot.json` with existing `ranked` and `references` arrays (`id`, `label`, `params`, numeric `metrics`), plus `manifest` (`slug`, `methodVersion`, `grid` width/height, `warmupSteps`, `fluxGap`, `dt`, exact `command`, `candidates` with id/params, and nonempty `priorCoverage` source/description entries). Use unique IDs across candidates and references. Add `finalists` with measured id and at least two distinct PNG paths per finalist under `docs/images/sweeps-2026-10-30/`, identifying candidate versus current reference in the report. One to three evidence finalists are required; a rejected best candidate is valid evidence and is not a promotion obligation. Link the JSON and every image from the write-up. Full current preset parameters must be explicitly pinned, including disabled palette/rotation motion for geometry.

### Frozen static metric seam

Export `staticBoundaryMetrics(field, width, height)` from the existing metrics module. Return numeric `interiorFraction`, `edgeDensity`, `coarseEdgeDensity`, `entropy`, `score` in [0,1]. Interior means zero escape-field cells, not a new mathematical membership guarantee. Edge density is the fraction of non-wrapping horizontal/vertical neighbour pairs crossing zero/nonzero; coarseEdgeDensity reports the same distinction at a documented coarser spatial scale. The score is static, independent of time/flux and opt-in only. Frozen controls are 32² empty/full, a vertical half-plane, four-cell binary bands and deterministic binary noise. Empty/full score zero; half-plane edge density is 1/62 and interior fraction 1/2; coherent fine bands must beat the half-plane and noise, and the half-plane must beat zero. This bounds a useful instrument without prescribing one scalar formula. Record methodVersion `static-boundary-v1`, include these metrics in every candidate/reference row, and independently replay the exported function on actual kernel fields to verify the runner uses it. Preserve all old config values and the old scoreFrames regression.

## Out of scope

Production presets, defaults, kernel repairs, new simulations, orchestration changes, release/deployment and logistic-mandelbrot. Do not add a fake fractal kernel or count its shared helper as a separate simulation. Do not repeat old grids except references/calibration needed for valid comparisons.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** historical stages 58–86: worker median 1.730M and verifier median 1.331M cached-inclusive tokens; plan 3.061M per pair, no automatic retry. Batch prep allowance 4M; one 11.256M p95-pair reserve is not permission to spend or change runtime caps.

## Dispatch envelope

Return exact commands/exits, attempted/completed counts, candidate parameters, current-reference provenance, raw-data and image paths, numeric replay results and manual visual findings. State PASS/FAIL/partial honestly. Stop at wall-clock or unresolved evidence failure; preserve work and request an operator decision rather than requeueing. Use the repository dispatch-envelope schema.

## Family-specific notes

Both roles need browser access, including headless Chromium. Subscription CLI routes remain unchanged. Reserve port 5173 for the serial sweep worker/verifier only after checking no listener exists. Start Vite from that run worktree, run browser checks, and stop only that owned server. Do not reuse an existing server, change port plumbing or stop another preview. An occupied port blocks admission until the operator resolves it. Planning baseline ran with no prior 5173 listener.

## Readiness review

Seat check and scope review completed in planning. Serial dispatch prevents overlap; 138 and 139 additionally require 137 landed on dev, not merely a worker PASS. Other cards can record their own outcomes without a false dependency on an unrelated earlier success. Shared harness consumers read: scoreOne/runSweep, summarizeMetrics, metricsTable, driver extraction, configs and relevant kernels. Claims are deliberately serial because these paths overlap. Base verify and five selected browser checks executed on 14029cefb4f5. New candidate command discovery is expected-red and the frozen core executed with two positive and two intended-red tests; commit and lead admission remain before add-stage. Claude Sonnet 5.5 read this card in a fresh tool-disabled cold session. Findings and responses are in the batch report. Numeric calibration assertions and manifest/result checks are now frozen. Real-kernel integration, imagery and numerical replay remain explicit independent-verifier gates, not claimed preparation PASS. Lead admission/cold-read closure remains.

### Lead admission closure — 2026-10-30

Operator scope and conditional-unpause approval is recorded in the batch report. The final Claude Sonnet 5.5 cold read found the card/core feasible, subject to live type/schema and dependency checks, now closed by the lead. Explicit new-sweep discovery returned exit1/no matching tests on the unchanged base: intended missing implementation, not a successful run. Oracles are opt-in and baseline failures identify missing new outcomes; positive checker controls and protected-source/historical-config regressions pass. Strict card lint and recorded digest verification pass. Runtime scientific replay, image content, current-reference completeness and novelty remain mandatory independent-verifier evidence; no core-only PASS is acceptable. The operator's preset promotion decision is after research acceptance and must not be mistaken for a prerequisite to recording an honest negative result.

The project TypeScript gate passes; its existing scope excludes e2e. Playwright parsed all twelve new specs (46 tests, all dormant without selection), and explicit node-only oracle runs exercise the frozen checkers. An additional standalone TypeScript check was unavailable because the existing checkout has no @types/node; no dependency/tooling change is commissioned for this extra check. Names and shapes were checked against existing harness/kernel source. The Lorenz `spread.score` is `{min,max,standardDeviation}`, so an equilibrium spread of zero remains a truthy object; a live five-identical-snapshot probe confirms this. Brian's Brain's firing threshold is 0.99 and attractor map enums are clifford/dejong/svensson in current source.

Only 138/139 consume a new dependency: native Depends on checks completed status plus landed commit ancestry and refuses awaiting integration. All other cards remain serial without false success dependencies. Keep production source and protected scripts unchanged throughout this batch; their frozen hashes intentionally detect concurrent edits too. Stop for a real conflict rather than changing a digest or widening scope.
