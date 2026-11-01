# Stage card 148-attractor-coefficient-interactions: Missed Clifford/De Jong/Svensson interactions

## Metadata

- **Authored:** 2026-10-30
- **Orchestrator:** Codex planning session
- **Worker:** Claude Sonnet 5.5
- **Verifier:** GPT-6.1 Sol
- **Base branch:** dev
- **Run branch:** autometta/148-attractor-coefficient-interactions
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** alternating GPT/Claude workers with independent cross-family verification. Coding tiers suffice for bounded measurement; no frontier-tier verifier or polling loop.
- **Open decisions:** none
- **Readiness:** Operator approved 2026-10-30; lead admission review complete. Core oracle/baseline and cross-family cold-read closure recorded below; real sweep and visual evidence remain execution deliverables.

## Surfacing concern

Live dev at 14029cefb4f5 has 19 sweep configs covering 16 kernels, not 18 distinct kernels. Five requested kernels lack configs; Lorenz is already covered and fractal is shared code. Historical sweep metrics can reward blur, brightness or snapshot timing. This card tests a bounded new region and retains visual evidence. See the batch report for the current Brian’s Brain resolution and Gray-Scott baseline failure.

## Objective

Treat Clifford, De Jong and Svensson as three variants, not three extra kernels. Search c/d interactions with a/b around diverse anchors; the original sweeps mostly fixed c/d (Svensson swept d only). Keep drift/exposure/fade fixed for morphology screening, then evaluate bounded drift as a separate dynamic comparison. Preserve multiple distinct shapes, reject saturated support, and verify finalists under app rendering rather than only the low-exposure harness.

Allocate up to 60 worker minutes and 30 verifier minutes per kernel/variant, with remaining time for shared checks and report integration. If measured pilot throughput cannot fit the full declared grid, stop before the full run and split/re-brief; do not silently truncate coverage. Validation budget: at most three finalists per kernel/variant, each at two resolutions and three time samples (and three seeds where supported); verifier replays the declared full grid once and these finalists, not an unlimited search.

Search allowance: 48 novel sets per variant + at most 16 refinements each. Instrument: shape diversity, density support and drift persistence. Before measurement, the worker retains a manifest under docs/sweeps/data/2026-10-30/ with exact candidate values, all fixed parameters, the old grid/appendix ranges and source citations, inclusion/exclusion reasons, and reproduction settings. Verifier checks its ranges against the cited source, not just the worker’s novelty label. References and validation repeats are additional to these candidate counts. At most three proposed finalists per kernel/variant, plus explicit no-promotion outcomes where appropriate.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `src/app/presets.ts`
- `docs/sweeps/2026-10-30-interestingness-batch.md`
- `src/sims/clifford-dejong/kernel.ts`
- `docs/sweeps/clifford-dejong-interestingness.md`

## Deliverables

1. Add only the harness configuration, metric integration and supplemental implementation tests needed by this objective under `e2e/harness/` and `e2e/`; reuse existing paths.
2. Write or append `docs/sweeps/clifford-dejong-interestingness.md` in the Gray-Scott format: method, searched/not-searched axes, ranked candidates, current references, interpretation, proposed promotions and reproduction commands.
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
2. Verifier: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 148 "` completes the declared candidate list and every current reference, with no skipped sweep tests, duplicate/overwritten candidate IDs, missing metrics, non-finite scores or missing outputs. Planning base: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 148 " --list` exits 1 with zero tests: intended missing sweep coverage, NOT PASS. Worker must supply the matching executable command; verifier requires nonzero executed count and no skips. Do not use Playwright exit 0 with zero matching tests as evidence.
3. Verifier: independently re-run the shortlisted candidates and current references, inspect screenshots/time strips at app-relevant resolution, and reproduce numeric readings from retained raw results. Use identical deterministic inputs in the same browser/runtime: require identical candidate ordering and metrics within absolute 1e-9, reporting any larger deviation as FAIL/inconclusive rather than widening tolerance. For stochastic kernels replay each explicit seed, report all three readings and their spread; three seeds are robustness evidence, not a distributional guarantee. Different-resolution visual checks are separate, not exact numeric replays. Missing evidence is FAIL; a visually weak but honestly measured negative finding may PASS.
4. Verifier: `git diff --name-only` and `git diff -- src scripts state` demonstrate scope compliance; review the retained manifest against every reported claim. No production code/default, parked-arc, queue or budget changes are permitted.
5. Verifier: run the new frozen contract and `scripts/check-contract-test-gate.sh --worktree`; digest violations fail. The baseline command is `npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"`. Planning result: 4 passed, 1 known Gray-Scott exact-literal failure, 1 opt-in skipped. Before card 143 lands, this precise known failure may remain only if independently reproduced unchanged; it is not a new acceptance failure or a whole-suite PASS. After 143 lands, its repaired explicit-five-point and added nine-point regressions must pass. Never silently change old expected literals or frozen assertions.
6. Operator: promotion is a separate visual sign-off after reading the images and candidate parameters. Stage PASS accepts research/harness work on dev only, not a production preset change.

## Contract test

- **Test file:** e2e/sweep-148.contract.spec.ts
- **Assertions digest:** sha256:66717f76125e739f62cf9e97feb89f72d36ad970101e2951b9c8318579050f00
- **Oracle command:** `SWEEP_CONTRACT=148 npx playwright test e2e/sweep-148.contract.spec.ts` (three tests must execute; without this opt-in future-stage contracts intentionally skip).
- **Oracle proof:** On unchanged implementation at 14029cefb4f5, node-only Playwright execution with a temporary no-webServer configuration ran all three checks: two PASS (shape proof/mutations and production/historical invariants), one intended RED at the first missing `sweep-148-...` config. The shape proof accepts a nonempty complete fixture and separately rejects nine defects: missing ranked row, duplicate ID, duplicate parameter set, mismatched params, nonfinite metric, no reference, too-short time strip, unsafe image path and missing historical citations. A full green sweep reference was deliberately not implemented during preparation; the independent verifier must execute the actual sweep and reproduce real evidence before PASS. No fixture evidence is a claimed real simulation result.

### Frozen evidence boundary

One output per kernel/variant at `docs/sweeps/data/2026-10-30/148/<slug>.json`. Its top-level fields are existing `ranked` and `references` arrays plus `manifest` and `finalists`. Each result row has id, label, full params and numeric metrics including score. Manifest fields: slug, methodVersion, grid (width/height), warmupSteps, fluxGap, dt, candidates (id/params), priorCoverage (source/description), command. The manifest candidate list must exactly match the expanded configuration and ranked results; all coarse candidates are mandatory (48 minimum, 64 maximum per kernel/variant). References exactly match the new config’s declared current references; verifier separately checks those against shipped presets.

Expose one additive config per output with artifactId `sweep-148-<slug>`. Existing 19 configs stay byte-equivalent as serialized values; corrected current references therefore belong to the new config, not edits to historical rows. Required interaction axes each have at least two values: Each Clifford/De Jong/Svensson variant: c/d; every candidate pins its map parameter. The frozen legacy scoreFrames fixture and source/preset/guard-script checksum must remain unchanged.

Finalists are 1–3 evidence selections per kernel/variant, not mandatory promotion recommendations: a negative search can select rejected examples. Each finalist names its ranked id and at least three distinct PNG paths under `docs/images/sweeps-2026-10-30/`, each at least 64×64; the write-up links both JSON and images. The static contract verifies valid PNG headers, not aesthetic merit or temporal provenance. Independent verifier criterion 3 must inspect content, confirm actual separated times, longer horizon, app-scale view and supported-seed checks, and compare current references. Source citations must resolve to existing repository files. For card 148, filenames/manifest slugs include the variant suffix, while the kernel slug remains clifford-dejong.

The frozen core does not substitute for human visual approval, independent replay, whole-repo verify or changed-path review. Worker may add supplemental implementation tests but cannot edit the frozen file. Missing manual evidence remains FAIL even if this structural oracle passes.

## Out of scope

Production presets, defaults, kernel repairs, new simulations, orchestration changes, release/deployment and logistic-mandelbrot. Do not add a fake fractal kernel or count its shared helper as a separate simulation. Do not repeat old grids except references/calibration needed for valid comparisons.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 120 minutes
- **Spend basis:** historical stages 58–86: worker median 1.730M and verifier median 1.331M cached-inclusive tokens; plan 6.121M per pair for this multi-kernel/variant card (2× the historical pair median), no automatic retry. Batch prep allowance 4M; one 11.256M p95-pair reserve is not permission to spend or change runtime caps.

## Dispatch envelope

Return exact commands/exits, attempted/completed counts, candidate parameters, current-reference provenance, raw-data and image paths, numeric replay results and manual visual findings. State PASS/FAIL/partial honestly. Stop at wall-clock or unresolved evidence failure; preserve work and request an operator decision rather than requeueing. Use the repository dispatch-envelope schema.

## Family-specific notes

Both roles need browser access, including headless Chromium. Subscription CLI routes remain unchanged. Reserve port 5173 for the serial sweep worker/verifier only after checking no listener exists. Start Vite from that run worktree, run browser checks, and stop only that owned server. Do not reuse an existing server, change port plumbing or stop another preview. An occupied port blocks admission until the operator resolves it. Planning baseline ran with no prior 5173 listener.

## Readiness review

Seat check and scope review completed in planning. Serial dispatch prevents overlap; 138 and 139 additionally require 137 landed on dev, not merely a worker PASS. Other cards can record their own outcomes without a false dependency on an unrelated earlier success. Shared harness consumers read: scoreOne/runSweep, summarizeMetrics, metricsTable, driver extraction, configs and relevant kernels. Claims are deliberately serial because these paths overlap. Base verify and five selected browser checks executed on 14029cefb4f5. New candidate command listing was confirmed empty (intended red); the new frozen contract ran two positive checks and one intended missing-configuration failure. Runtime/source, prior config values and legacy scoring fixture are unchanged. Lead must review and commit this card/test pair before add-stage. Claude Sonnet 5.5 read this card in a fresh tool-disabled cold session. Findings and responses are in the batch report. Exact manifest/config/result checks are now frozen. No new metric is introduced by this card: it reuses the current instrument. Visual provenance and independent numeric replay remain explicit verifier gates. Cold-read concerns are mapped to the scope/manifest rules above; final admission belongs to the lead.

### Lead admission closure — 2026-10-30

Operator scope and conditional-unpause approval is recorded in the batch report. The final Claude Sonnet 5.5 cold read found the card/core feasible, subject to live type/schema and dependency checks, now closed by the lead. Explicit new-sweep discovery returned exit1/no matching tests on the unchanged base: intended missing implementation, not a successful run. Oracles are opt-in and baseline failures identify missing new outcomes; positive checker controls and protected-source/historical-config regressions pass. Strict card lint and recorded digest verification pass. Runtime scientific replay, image content, current-reference completeness and novelty remain mandatory independent-verifier evidence; no core-only PASS is acceptable. The operator's preset promotion decision is after research acceptance and must not be mistaken for a prerequisite to recording an honest negative result.

The project TypeScript gate passes; its existing scope excludes e2e. Playwright parsed all twelve new specs (46 tests, all dormant without selection), and explicit node-only oracle runs exercise the frozen checkers. An additional standalone TypeScript check was unavailable because the existing checkout has no @types/node; no dependency/tooling change is commissioned for this extra check. Names and shapes were checked against existing harness/kernel source. The Lorenz `spread.score` is `{min,max,standardDeviation}`, so an equilibrium spread of zero remains a truthy object; a live five-identical-snapshot probe confirms this. Brian's Brain's firing threshold is 0.99 and attractor map enums are clifford/dejong/svensson in current source.

Only 138/139 consume a new dependency: native Depends on checks completed status plus landed commit ancestry and refuses awaiting integration. All other cards remain serial without false success dependencies. Keep production source and protected scripts unchanged throughout this batch; their frozen hashes intentionally detect concurrent edits too. Stop for a real conflict rather than changing a digest or widening scope.

## Re-brief 1 — 2026-11-01 authorised repair

Operator authorised the repair sequence146,148,144. Existing acceptance criteria, frozen blocks/digests and production scope remain unchanged. Cross-family pairing stays as declared;146 is a bounded repair at medium effort. Dispatch remains serial because the harness and browser resources overlap.

Restore only the deliverable diff from preserved `798e1256da9fd489946da420a188a8e27383b0d0` onto current dev, merging shared harness additions without overwriting landed work. Archived verdict/envelope/logs: `state/archive/2026-11-01-repairs/148-attractor-coefficient-interactions/` in the primary checkout. Read the archived verifier first. Preserve failed evidence and distinguish regenerated values from retained accepted evidence.

Add every current shipped reference, including clifford-morph and dejong-morph with their actual drift/exposure/fade/point count. Measure and independently replay these rows, retaining real renderer and temporal comparisons. Write a separate pre-measurement manifest to disk before the repaired run; include the historical c/d fine-pass evidence, exact source ranges and honest overlap/novelty assessment. Do not retroactively label the previous postmeasurement manifest as a premeasurement artifact. If the history cannot establish a required novelty claim, report the gap rather than fabricate bounds. Correct three-time mean labels currently saying score at1260 and the retention range to include1.2976600770980737. Run the complete repaired selector after the new manifest exists, retaining previous evidence as an archive. Do not alter any frozen assertion or historical config.

Run cheap repository verification, the frozen oracle and contract gate once on the repaired tree. The verifier must independently check the corrected scientific path and every changed claim; matching the worker's own faulty calculation is not an independent correctness check. Unchanged previously accepted evidence may be cited only after proving its code/data are unchanged. Every original acceptance criterion remains mandatory; no tolerance, scope or promotion gate changes and no automatic retry.


## Re-brief 2 — 2026-11-01 approved prose-only repair

Operator explicitly approved this narrow repair and continued recommended escalation handling on 2026-11-01. This re-brief supersedes Re-brief 1's instructions to regenerate scientific evidence. Restore the deliverables from latest preserved `dcbd0806b8e50100d8ae6033f358bd87a3aed265`, NOT attempt 1. Retain current dev's stage cards and other landed work. Both roles remain mid-tier at medium effort; cross-family scientific judgement already passed in the preceding verifier.

The primary checkout retains the previous verdict, worker envelope, logs, stage state and recorded budget under `state/archive/2026-11-01-prose-repair/148-attractor-coefficient-interactions/`. Read that verifier: criteria 1, 2, 3, 5 and 6 PASS; criterion 4 fails only two report claims. The preserved WIP contains 6099 accepted result values and 126 accepted images. Do not rerun the accepted sweeps, recapture images, rewrite manifests or change scientific code/data.

Change only two claims in `docs/sweeps/clifford-dejong-interestingness.md` relative to the preserved deliverables:

1. Replace `3 Clifford incl. morph, 3 De Jong incl. morph, 2 Svensson` with `4 Clifford incl. morph, 4 De Jong incl. morph, 2 Svensson`.
2. Replace `The De Jong morph is the lowest-scoring shipped reference in this run.` with `The De Jong morph is the lowest-scoring shipped De Jong reference in this run.`

Reproduce the claims against retained result JSON before and after the edit: reference counts 4/4/2; De Jong morph score 0.6766784096748064 is lowest among De Jong references but exceeds Clifford classic 0.5712962419184514. Inspect all report prose for consistent wording. Prove the restored harness, manifests, result JSON and all image blobs are identical to the latest WIP; the only deliverable difference against it must be the two report edits. Do not restore old stage metadata over this brief.

Worker and verifier each run the cheap gates once: `npm run verify`, `SWEEP_CONTRACT=148 npx playwright test e2e/sweep-148.contract.spec.ts`, `scripts/check-contract-test-gate.sh --worktree`, and the existing baseline regression selector in criterion 5. The verifier independently checks both corrected claims and unchanged evidence/code blobs. Cite the archived prior PASS evidence for expensive criteria 2/3 rather than repeating them. Criteria and frozen assertions/digest remain unchanged; this is reuse of already independently accepted evidence, not waiver of missing evidence. If scientific deliverables differ, report the discrepancy before relying on prior evidence. Preserve honest FAIL/partial outcomes; never manufacture a PASS. No production promotion or deployment authority.
