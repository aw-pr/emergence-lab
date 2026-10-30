# Stage card 142-lorenz-unexplored-regimes: Lorenz unexplored dynamics and dedicated report

## Metadata

- **Authored:** 2026-10-30
- **Orchestrator:** Codex planning session
- **Worker:** Claude Sonnet 5.5
- **Verifier:** GPT-6.1 Sol
- **Base branch:** dev
- **Run branch:** autometta/142-lorenz-unexplored-regimes
- **Worker effort:** medium
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

Lorenz already has 72 rho/sigma/fade candidates and five snapshots. Preserve that baseline. Explore beta/rho and sigma/rho interactions outside or between the old grid while respecting actual schema bounds. Keep trail fade/stepsPerFrame fixed during dynamic comparisons, then test presentation separately within the 24-set refinement allowance. Include equilibrium, transient and sustained two-lobe behaviour; reject divergent or clipped trajectories. Reuse five snapshots and extend horizon for finalists. Create the missing dedicated write-up without claiming first-ever coverage.

Search allowance: 64 novel pairs + at most 24 refined sets. Instrument: existing multi-snapshot score plus manual trajectory occupancy/persistence observations using the existing density frames; no new numeric instrument. Before measurement, the worker retains a manifest under docs/sweeps/data/2026-10-30/ with exact candidate values, all fixed parameters, the old grid/appendix ranges and source citations, inclusion/exclusion reasons, and reproduction settings. Verifier checks its ranges against the cited source, not just the worker’s novelty label. References and validation repeats are additional to these candidate counts. At most three proposed finalists per kernel/variant, plus explicit no-promotion outcomes where appropriate.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `src/app/presets.ts`
- `docs/sweeps/2026-10-30-interestingness-batch.md`
- `src/sims/lorenz-attractor/kernel.ts`

## Deliverables

1. Add only the harness configuration, metric integration and supplemental implementation tests needed by this objective under `e2e/harness/` and `e2e/`; reuse existing paths.
2. Write or append `docs/sweeps/lorenz-attractor-interestingness.md` in the Gray-Scott format: method, searched/not-searched axes, ranked candidates, current references, interpretation, proposed promotions and reproduction commands.
3. Retain complete compact result JSON under `docs/sweeps/data/2026-10-30/` and finalist/reference images under `docs/images/sweeps-2026-10-30/`, linked from the write-up.

## Constraints

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
2. Verifier: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 142 "` completes the declared candidate list and every current reference, with no skipped sweep tests, duplicate/overwritten candidate IDs, missing metrics, non-finite scores or missing outputs. Planning base: `npx playwright test e2e/sweep.spec.ts -g "sweep 142 " --list` exits 1, zero tests found: the new sweep entry point is intentionally absent, not a passing check. Do not use Playwright exit 0 with zero matching tests as evidence.
3. Verifier: independently re-run the shortlisted candidates and current references, inspect screenshots/time strips at app-relevant resolution, and reproduce numeric readings from retained raw results. Use identical deterministic inputs in the same browser/runtime: require identical candidate ordering and metrics within absolute 1e-9, reporting any larger deviation as FAIL/inconclusive rather than widening tolerance. For stochastic kernels replay each explicit seed, report all three readings and their spread; three seeds are robustness evidence, not a distributional guarantee. Different-resolution visual checks are separate, not exact numeric replays. Missing evidence is FAIL; a visually weak but honestly measured negative finding may PASS.
4. Verifier: `git diff --name-only` and `git diff -- src scripts state` demonstrate scope compliance; review the retained manifest against every reported claim. No production code/default, parked-arc, queue or budget changes are permitted.
5. Verifier: run the new frozen contract and `scripts/check-contract-test-gate.sh --worktree`; digest violations fail. The baseline command is `npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"`. Planning result: 4 passed, 1 known Gray-Scott exact-literal failure, 1 opt-in skipped. Before card 143 lands, this precise known failure may remain only if independently reproduced unchanged; it is not a new acceptance failure or a whole-suite PASS. After 143 lands, its repaired explicit-five-point and added nine-point regressions must pass. Never silently change old expected literals or frozen assertions.
6. Operator: promotion is a separate visual sign-off after reading the images and candidate parameters. Stage PASS accepts research/harness work on dev only, not a production preset change.

## Contract test

- **Test file:** e2e/sweep-142.contract.spec.ts
- **Assertions digest:** sha256:f8c6e7468f385ed079770109b3306733967d69a285417647f1f731c7ba3162af
- **Oracle proof:** On dev source `14029cefb4f5`, the isolated node-side oracle run exits 1 with 2 intended failures (new config and retained results absent), 2 passing controls. No browser/server was started. Evidence validator positive fixture and negative mutations (missing candidate, non-finite score, mismatched params, empty references/images, duplicate IDs and invalid PNG) pass; source/historical-config/legacy-score invariants pass. This proves the evidence seam, not a reference sweep implementation. Full scientific/visual positive proof is deliberately left to the bounded worker attempt and independent verifier; no missing output earns PASS.

Execute `SWEEP_CONTRACT=142 npx playwright test e2e/sweep-142.contract.spec.ts`. The stage selector is required; default skips prevent future-card contracts from failing unrelated e2e runs. Acceptance requires every selected oracle test to execute, with no skips. The frozen block contains all assertions and helper/fixture logic; workers may add separate supplemental tests, never edit it.

### Retained evidence seam

Each new config has slug matching its kernel and artifactId `sweep-142-<slug>`. Preserve all 19 original configs; put refreshed current references in the new config. Expand the config in declaration order. Store `docs/sweeps/data/2026-10-30/142/<slug>.json` with:

- `manifest`: slug, nonempty methodVersion, grid {width,height}, warmupSteps, fluxGap, positive dt, exact reproduction command containing the stage sweep selector, candidates [{id,params}] in expanded-config order, and nonempty priorCoverage [{source,description}] pointing to existing repo-relative source/report files.
- `ranked` and `references`: existing {id,label,params,metrics} rows. Ranked candidates match every manifest ID and full params once, with finite numeric readings and descending finite score. Reference IDs/params match the new config's references; each reference thumb is a retained repo-relative PNG path.
- `finalists`: 1–3 evidence selections (not compulsory promotions), each {id,images} with three distinct frame PNG paths under `docs/images/sweeps-2026-10-30/`. Negative results may show the best rejected candidate. Images are at least 128×128. The report contains a 2026-10-30 section linking `142/<slug>.json`.

The executable checks validate PNG signature/IHDR and provenance links, not aesthetic merit, actual distinct frame content, correctness of declared novelty, all current presets, or independent numerical reproduction. Criterion 3 assigns those checks to the independent verifier with the exact retained inputs and current app. Criterion 6 remains operator-owned visual sign-off. `npm run verify`, the named sweep, historical browser regressions, and `scripts/check-contract-test-gate.sh --worktree` are separate mandatory checks. Scope diff review additionally covers runtime/state changes that are not tracked source. Missing supplemental evidence is FAIL.

Retain the existing five-snapshot mechanism on the new Lorenz config, with at least five warmup positions. Ranked readings include sampleCount and spread.score.

## Out of scope

Production presets, defaults, kernel repairs, new simulations, orchestration changes, release/deployment and logistic-mandelbrot. Do not add a fake fractal kernel or count its shared helper as a separate simulation. Do not repeat old grids except references/calibration needed for valid comparisons.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** historical stages 58–86: worker median 1.730M and verifier median 1.331M cached-inclusive tokens; plan 3.061M per pair, no automatic retry. Batch prep allowance 4M; one 11.256M p95-pair reserve is not permission to spend or change runtime caps.

## Dispatch envelope

Return exact commands/exits, attempted/completed counts, candidate parameters, current-reference provenance, raw-data and image paths, numeric replay results and manual visual findings. State PASS/FAIL/partial honestly. Stop at wall-clock or unresolved evidence failure; preserve work and request an operator decision rather than requeueing. Use the repository dispatch-envelope schema.

## Family-specific notes

Both roles need browser access, including headless Chromium. Subscription CLI routes remain unchanged. Reserve port 5173 for the serial sweep worker/verifier only after checking no listener exists. Start Vite from that run worktree, run browser checks, and stop only that owned server. Do not reuse an existing server, change port plumbing or stop another preview. An occupied port blocks admission until the operator resolves it. Planning baseline ran with no prior 5173 listener.

## Readiness review

Seat check and scope review completed in planning. Serial dispatch prevents overlap; 138 and 139 additionally require 137 landed on dev, not merely a worker PASS. Other cards can record their own outcomes without a false dependency on an unrelated earlier success. Shared harness consumers read: scoreOne/runSweep, summarizeMetrics, metricsTable, driver extraction, configs and relevant kernels. Claims are deliberately serial because these paths overlap. Base verify and five selected browser checks executed on 14029cefb4f5. New command discovery was run and returned the intended absence. The frozen oracle has a validated positive/negative evidence fixture and intended-red new-outcome probes; see Contract test. Worker/verifier must supply the actual sweep evidence before PASS. Claude Sonnet 5.5 read this card in a fresh tool-disabled cold session. Findings and responses are in the batch report. Frozen core assertions and exact-manifest correspondence checks are present. The lead still owns final admission/cold-read closure, and independent visual/scientific replay remains mandatory.

### Lead admission closure — 2026-10-30

Operator scope and conditional-unpause approval is recorded in the batch report. The final Claude Sonnet 5.5 cold read found the card/core feasible, subject to live type/schema and dependency checks, now closed by the lead. Explicit new-sweep discovery returned exit1/no matching tests on the unchanged base: intended missing implementation, not a successful run. Oracles are opt-in and baseline failures identify missing new outcomes; positive checker controls and protected-source/historical-config regressions pass. Strict card lint and recorded digest verification pass. Runtime scientific replay, image content, current-reference completeness and novelty remain mandatory independent-verifier evidence; no core-only PASS is acceptable. The operator's preset promotion decision is after research acceptance and must not be mistaken for a prerequisite to recording an honest negative result.

The project TypeScript gate passes; its existing scope excludes e2e. Playwright parsed all twelve new specs (46 tests, all dormant without selection), and explicit node-only oracle runs exercise the frozen checkers. An additional standalone TypeScript check was unavailable because the existing checkout has no @types/node; no dependency/tooling change is commissioned for this extra check. Names and shapes were checked against existing harness/kernel source. The Lorenz `spread.score` is `{min,max,standardDeviation}`, so an equilibrium spread of zero remains a truthy object; a live five-identical-snapshot probe confirms this. Brian's Brain's firing threshold is 0.99 and attractor map enums are clifford/dejong/svensson in current source.

Only 138/139 consume a new dependency: native Depends on checks completed status plus landed commit ancestry and refuses awaiting integration. All other cards remain serial without false success dependencies. Keep production source and protected scripts unchanged throughout this batch; their frozen hashes intentionally detect concurrent edits too. Stop for a real conflict rather than changing a digest or widening scope.
