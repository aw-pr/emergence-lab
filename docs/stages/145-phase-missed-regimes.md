# Stage card 145-phase-missed-regimes: Missed synchronisation regimes

## Metadata

- **Authored:** 2026-10-30
- **Orchestrator:** Codex planning session
- **Worker:** GPT-6.1 Sol
- **Verifier:** Claude Sonnet 5.5
- **Base branch:** dev
- **Run branch:** autometta/145-phase-missed-regimes
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

Kuramoto: noise and initialPattern interactions near locking transitions beyond the old coupling/spread grid. Swarmalators: frequencySpread/noise at J/K boundaries beyond the old plane. Use circular statistics and occupancy masks; do not treat phase wrap as motion or a high resultant length as necessarily interesting. Retain stationary, travelling and partially synchronised regimes if observed. Shelved Swarmalators remains shelved; use colour/phase and density field captures of its real kernel at matched grid/settings alongside current kernel-parameter references; app screenshots are explicitly N/A to the shelved route. Do not call these shipped-app screenshots or unshelve it.

Allocate up to 60 worker minutes and 30 verifier minutes per kernel/variant, with remaining time for shared checks and report integration. If measured pilot throughput cannot fit the full declared grid, stop before the full run and split/re-brief; do not silently truncate coverage. Validation budget: at most three finalists per kernel/variant, each at two resolutions and three time samples (and three seeds where supported); verifier replays the declared full grid once and these finalists, not an unlimited search.

Search allowance: 64 novel sets per kernel + at most 16 refinements each. Instrument: circular coherence, phase balance and temporal persistence. Before measurement, the worker retains a manifest under docs/sweeps/data/2026-10-30/ with exact candidate values, all fixed parameters, the old grid/appendix ranges and source citations, inclusion/exclusion reasons, and reproduction settings. Verifier checks its ranges against the cited source, not just the worker’s novelty label. References and validation repeats are additional to these candidate counts. At most three proposed finalists per kernel/variant, plus explicit no-promotion outcomes where appropriate.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `src/app/presets.ts`
- `docs/sweeps/2026-10-30-interestingness-batch.md`
- `src/sims/kuramoto-oscillators/kernel.ts`
- `src/sims/swarmalators/kernel.ts`
- `docs/sweeps/kuramoto-oscillators-interestingness.md`
- `docs/sweeps/swarmalators-interestingness.md`

## Deliverables

1. Add only the harness configuration, metric integration and supplemental implementation tests needed by this objective under `e2e/harness/` and `e2e/`; reuse existing paths.
2. Write or append `docs/sweeps/kuramoto-oscillators-interestingness.md` in the Gray-Scott format: method, searched/not-searched axes, ranked candidates, current references, interpretation, proposed promotions and reproduction commands.
3. Write or append `docs/sweeps/swarmalators-interestingness.md` in the Gray-Scott format: method, searched/not-searched axes, ranked candidates, current references, interpretation, proposed promotions and reproduction commands.
4. Retain complete compact result JSON under `docs/sweeps/data/2026-10-30/` and finalist/reference images under `docs/images/sweeps-2026-10-30/`, linked from the write-up.

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
2. Verifier: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 145 "` completes the declared candidate list and every current reference, with no skipped sweep tests, duplicate/overwritten candidate IDs, missing metrics, non-finite scores or missing outputs. Planning base: `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 145 " --list` exits 1 with zero tests: intended missing sweep coverage, NOT PASS. Worker must supply the matching executable command; verifier requires nonzero executed count and no skips. Do not use Playwright exit 0 with zero matching tests as evidence.
3. Verifier: independently re-run the shortlisted candidates and current references, inspect screenshots/time strips at app-relevant resolution, and reproduce numeric readings from retained raw results. Use identical deterministic inputs in the same browser/runtime: require identical candidate ordering and metrics within absolute 1e-9, reporting any larger deviation as FAIL/inconclusive rather than widening tolerance. For stochastic kernels replay each explicit seed, report all three readings and their spread; three seeds are robustness evidence, not a distributional guarantee. Different-resolution visual checks are separate, not exact numeric replays. Missing evidence is FAIL; a visually weak but honestly measured negative finding may PASS.
4. Verifier: `git diff --name-only` and `git diff -- src scripts state` demonstrate scope compliance; review the retained manifest against every reported claim. No production code/default, parked-arc, queue or budget changes are permitted.
5. Verifier: run the new frozen contract and `scripts/check-contract-test-gate.sh --worktree`; digest violations fail. The baseline command is `npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"`. Planning result: 4 passed, 1 known Gray-Scott exact-literal failure, 1 opt-in skipped. Before card 143 lands, this precise known failure may remain only if independently reproduced unchanged; it is not a new acceptance failure or a whole-suite PASS. After 143 lands, its repaired explicit-five-point and added nine-point regressions must pass. Never silently change old expected literals or frozen assertions.
6. Operator: promotion is a separate visual sign-off after reading the images and candidate parameters. Stage PASS accepts research/harness work on dev only, not a production preset change.

## Contract test

- **Test file:** e2e/sweep-145.contract.spec.ts
- **Assertions digest:** sha256:6d4413785acd3adf2e8fdff334a410c09858fd41d374d527cdd987bd0b0f286f (re-frozen 2026-11-03, Re-brief 2; the original digest `016fb41a…` covered both kernels and a fixed source hash)
- **Oracle command:** `SWEEP_CONTRACT=145 npx playwright test e2e/sweep-145.contract.spec.ts` (three tests must execute; without this opt-in future-stage contracts intentionally skip).
- **Oracle proof:** On unchanged implementation at 14029cefb4f5, node-only Playwright execution with a temporary no-webServer configuration ran all three checks: two PASS (shape proof/mutations and production/historical invariants), one intended RED at the first missing `sweep-145-...` config. The shape proof accepts a nonempty complete fixture and separately rejects nine defects: missing ranked row, duplicate ID, duplicate parameter set, mismatched params, nonfinite metric, no reference, too-short time strip, unsafe image path and missing historical citations. A full green sweep reference was deliberately not implemented during preparation; the independent verifier must execute the actual sweep and reproduce real evidence before PASS. No fixture evidence is a claimed real simulation result.

### Frozen evidence boundary

One output per kernel/variant at `docs/sweeps/data/2026-10-30/145/<slug>.json`. Its top-level fields are existing `ranked` and `references` arrays plus `manifest` and `finalists`. Each result row has id, label, full params and numeric metrics including score. Manifest fields: slug, methodVersion, grid (width/height), warmupSteps, fluxGap, dt, candidates (id/params), priorCoverage (source/description), command. The manifest candidate list must exactly match the expanded configuration and ranked results; all coarse candidates are mandatory (64 minimum, 80 maximum per kernel/variant). References exactly match the new config’s declared current references; verifier separately checks those against shipped presets.

Expose one additive config per output with artifactId `sweep-145-<slug>`. Existing 19 configs stay byte-equivalent as serialized values; corrected current references therefore belong to the new config, not edits to historical rows. Required interaction axes each have at least two values: Kuramoto: noise/initialPattern; Swarmalators: frequencySpread/noise. The frozen legacy scoreFrames fixture and source/preset/guard-script checksum must remain unchanged.

Finalists are 1–3 evidence selections per kernel/variant, not mandatory promotion recommendations: a negative search can select rejected examples. Each finalist names its ranked id and at least three distinct PNG paths under `docs/images/sweeps-2026-10-30/`, each at least 64×64; the write-up links both JSON and images. The static contract verifies valid PNG headers, not aesthetic merit or temporal provenance. Independent verifier criterion 3 must inspect content, confirm actual separated times, longer horizon, app-scale view and supported-seed checks, and compare current references. Source citations must resolve to existing repository files. For card 148, filenames/manifest slugs include the variant suffix, while the kernel slug remains clifford-dejong.

The frozen core does not substitute for human visual approval, independent replay, whole-repo verify or changed-path review. Worker may add supplemental implementation tests but cannot edit the frozen file. Missing manual evidence remains FAIL even if this structural oracle passes.

## Out of scope

Production presets, defaults, kernel repairs, new simulations, orchestration changes, release/deployment and logistic-mandelbrot. Do not add a fake fractal kernel or count its shared helper as a separate simulation. Do not repeat old grids except references/calibration needed for valid comparisons.

## Budget

- **Worker wall-clock:** 120 minutes (Re-brief 2: Kuramoto only; was 150 for two kernels)
- **Verifier wall-clock:** 60 minutes (Re-brief 2; was 90)
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

## Re-brief 2 — 2026-11-03 operator split: Kuramoto only, Swarmalators deferred

Attempt 1 (GPT-6.1 Sol, 2.19M worker tokens, Claude Sonnet 5.5 verifier FAIL on 2026-10-31) is preserved at `b422d8e56517d4b82f20259cedaf89e1a2ab1a1b` on `wip/145-phase-missed-regimes-attempt-1`. It stopped exactly as the card's throughput rule required: two pilot samples per kernel measured Kuramoto at about 1.26 s per sample (conservative full estimate 1144 s, inside the 3600 s allocation) and Swarmalators at about 10.06 s per sample (estimate 11086 s, three times the allocation), so no full grid was run and the stage asked for a split. **The operator decided on 2026-11-03: split to Kuramoto only.** Swarmalators is deferred, not searched here; its pre-measurement manifest and pilot JSON under `docs/sweeps/data/2026-10-30/145/` and the preflight section already appended to `docs/sweeps/swarmalators-interestingness.md` stay as retained evidence of that decision, and its `sweep-145-swarmalators` config may stay registered but is not run or verified. A future card may take it up with its own allocation.

**Frozen oracle re-frozen with the operator's authority.** `e2e/sweep-145.contract.spec.ts` now lists only `kuramoto-oscillators` in `SLUGS`, and its production-source check compares the `src` tree and the two guard scripts at `HEAD` with the branch point on `dev` instead of a fixed hash: that hash was computed at `14029cefb4f5` and already fails on today's base because card 150 landed new `src/app` files, so the old assertion could never pass again. Nothing else in the block changed (shape proof and its nine mutations, the `scoreFrames` fixture, the 19 historical config hash, the per-kernel evidence checks). New digest recorded above. Proof on base `fcdf7ed07`: `SWEEP_CONTRACT=145 npx playwright test e2e/sweep-145.contract.spec.ts` (node-only, no server) ran 3 tests, 2 passed, 1 failed at `kuramoto-oscillators: expected one new configuration sweep-145-kuramoto-oscillators`. The gate accepts the file with this card's digest.

**Start from the preserved commit:** restore `e2e/harness/sims.ts`, `e2e/sweep.spec.ts`, the two reports and `docs/sweeps/data/2026-10-30/145/` from `b422d8e56` onto the fresh run worktree (cut from current `dev`, which carries this re-brief and the re-frozen oracle). The `PHASE_145_KURAMOTO` config, `phase145Plan`, `phase145Diagnostics`, `phase145Sample` and the wrap/occupancy regression are sound and reusable. The Kuramoto manifest (64 candidates: couplingMode {local, global} × coupling {0.7, 1, 1.4, 2.4} × initialPattern {waves, random} × noise {0, 0.04, 0.16, 0.4}, pinned frequencySpread 0.55, timestep 0.045, seed 1; five current references) is the declaration; do not change its candidates.

**Then do the work the preflight stopped short of, for Kuramoto only:**

1. Replace the `throughput preflight` loop with a real `sweep 145 kuramoto-oscillators` test (keep the Swarmalators preflight out of the `SWEEP=1` path or leave it opt-in behind `PHASE145_PILOT=1`; it must not run or throw during the Kuramoto sweep). Run every one of the 64 candidates and the 5 references with the existing `scoreOne`/`driveKernel` path plus the phase diagnostics; write `docs/sweeps/data/2026-10-30/145/kuramoto-oscillators.json` with `manifest`, `ranked` (descending score), `references` and `finalists` exactly in the frozen evidence shape; keep `kuramoto-oscillators-manifest.json` as the pre-measurement record (the retained result's `manifest` repeats it).
2. Validation per the manifest's own plan: three finalists chosen by its stated selection rule, each replayed at seeds 1, 7 and 23, at 128² and 256², and at 400, 600, 800 and 1600 steps; field PNGs for every selected and reference seed-1 frame under `docs/images/sweeps-2026-10-30/`; plus real app `Renderer` snapshots of the three finalists and the kernel default at the app's default quality (deterministic, fixed-step, as the stage-144 method), clearly labelled as app screenshots. Report non-finite, endpoint and border fractions from the diagnostics.
3. Rewrite the Kuramoto report's 2026-10-30 section: the preflight text becomes history; add method, searched and not-searched axes, the ranking table, references, finalists with validation, interpretation (what resultant length, circular coherence, phase balance and persistence say and do not say), proposed promotions or an explicit none, and the reproduction command `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 145 kuramoto"`. Link the retained JSON and images.
4. Leave the Swarmalators report's preflight section as it is, with one added dated line saying the operator deferred the kernel on 2026-11-03 and why.

**Amended criteria:** criterion 2's command is `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 145 kuramoto"`, which must execute the full Kuramoto grid and references with no skips; the Swarmalators pilot is not part of it. Criterion 5's baseline command is run as written; card 143 has landed since the planning baseline, so the Gray-Scott literal state must be reported as found, not assumed. Criterion 3's replay covers the Kuramoto finalists and references only. The verifier's criterion 4 scope list gains nothing: the diff stays within `e2e/harness/sims.ts`, `e2e/sweep.spec.ts`, the two reports, `docs/sweeps/data/2026-10-30/145/` and `docs/images/sweeps-2026-10-30/`. Budget lines are amended above. Port rule unchanged: the sweep owns 5173 only after checking no listener exists.

