# Stage card 149-interestingness-sweep-summary: Verified shortlist and sweep close-out

## Metadata

- **Authored:** 2026-10-30
- **Orchestrator:** Codex planning session
- **Worker:** GPT-6.1 Sol
- **Verifier:** Claude Sonnet 5.5
- **Base branch:** dev
- **Run branch:** autometta/149-interestingness-sweep-summary
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** alternating GPT/Claude workers with independent cross-family verification. Coding tiers suffice for bounded measurement; no frontier-tier verifier or polling loop.
- **Open decisions:** none
- **Readiness:** Operator approved 2026-10-30; lead admission review complete. Prose-only baseline and cross-family cold-read closure recorded below; real sweep and visual evidence remain execution deliverables.

## Surfacing concern

Live dev at 14029cefb4f5 has 19 sweep configs covering 16 kernels, not 18 distinct kernels. Five requested kernels lack configs; Lorenz is already covered and fractal is shared code. Historical sweep metrics can reward blur, brightness or snapshot timing. This card reconciles research evidence; it performs no new search. See the batch report for the current Brian’s Brain resolution and Gray-Scott baseline failure.

## Objective

Consolidate every stage verdict, novel search region, negative result and proposed preset. Reconcile the user’s seven/18 census with actual kernels/configs. Link retained screenshots, exact candidate parameters and reproducible commands. State which visual decisions await the operator and which work failed or was not run. Replace the HANDOFF top status line and Next session pointer. No claim that a verifier PASS authorises a shipped-default promotion.

No new sweeps or parameter searches. Reconcile available stage outcomes, including failures and missing evidence. No success gate: serial position last; a partial batch is reported as partial.

## Inputs (read these in your own context)

- `e2e/harness/sims.ts`
- `e2e/harness/metrics.ts`
- `e2e/harness/driver.ts`
- `e2e/harness/report.ts`
- `e2e/sweep.spec.ts`
- `src/app/presets.ts`
- `docs/sweeps/2026-10-30-interestingness-batch.md`

## Deliverables

1. Reconcile final consumer status/links in `docs/sweeps/fractal-interestingness.md`, then write `docs/sweeps/2026-10-30-interestingness-results.md` with a coverage/verdict table and visually evidenced shortlist.
2. Update only the top status and Next session in `HANDOFF.md`.

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

1. Verifier: `npm run verify` passes on the landed batch head. Planning base: PASS, 395 passed and 38 skipped kernel tests; typecheck/build green. Skips are not passes.
2. Verifier: inspect every new stage envelope and retained report; match attempted/completed counts, verdicts, image links and proposal status. No sweep execution is required for this collation card.
3. Verifier: audit every result-table row against its named worker/verifier evidence and inspect each proposed finalist image link. Do not rerun sweeps: if numerical evidence is missing or contradictory, mark that result unverified/partial. The summary may honestly report failed stages; it may not convert them to PASS.
4. Verifier: compare the run branch and working tree against its recorded dispatch-base commit using `git diff --name-only <dispatch-base>`; only the two summary/index documents and HANDOFF may change. Review the retained manifests against every reported claim. No production code/default, parked-arc, queue or budget changes are permitted.
5. Verifier: run `scripts/check-contract-test-gate.sh --worktree`; digest violations fail. Exit 2 with no relevant changed contract files is expected for this prose-only card; report that case explicitly, not as a contract PASS. The baseline command is `npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"`. Planning result: 4 passed, 1 known Gray-Scott exact-literal failure, 1 opt-in skipped. For source-report reconciliation, preserve the historical baseline failure label; it is not a new acceptance failure or a whole-suite PASS. After 143 lands, its repaired explicit-five-point and added nine-point regressions must pass. Never silently change old expected literals or frozen assertions.
6. Operator: promotion is a separate visual sign-off after reading the images and candidate parameters. Stage PASS accepts research/harness work on dev only, not a production preset change.

## Contract test

- **Test file:** None
- **Oracle proof:** Prose-only collation; no implementation changes or new numerical claims. The verifier checks source evidence and links directly.

## Out of scope

Production presets, defaults, kernel repairs, new simulations, orchestration changes, release/deployment and logistic-mandelbrot. Do not add a fake fractal kernel or count its shared helper as a separate simulation. Do not repeat old grids except references/calibration needed for valid comparisons.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** historical stages 58–86: worker median 1.730M and verifier median 1.331M cached-inclusive tokens; plan 3.061M per pair, no automatic retry. Batch prep allowance 4M; one 11.256M p95-pair reserve is not permission to spend or change runtime caps.

## Dispatch envelope

Return exact commands/exits, attempted/completed counts, candidate parameters, current-reference provenance, raw-data and image paths, numeric replay results and manual visual findings. State PASS/FAIL/partial honestly. Stop at wall-clock or unresolved evidence failure; preserve work and request an operator decision rather than requeueing. Use the repository dispatch-envelope schema.

## Family-specific notes

No browser execution is required for collation. Both seats may view retained images. Do not start a new sweep server or run kernel measurements.
## Readiness review

The operator approved scope, the 74M planning envelope and unpausing after readiness on 2026-10-30; runtime caps remain unchanged. Claude Sonnet 5.5 cold-read this card. Its two material contradictions are resolved: no sweep/replay is required for summary, and no success gate blocks reporting failed or missing stages. The requested seven/18 census is reconciled in the batch-report input. Missing stage evidence is reported explicitly, never invented. The initial npm verify baseline passed (395 passed/38 skipped); gate exit 2 is valid only for unchanged contract surfaces. Existing image/report paths will be checked at execution, since they are outputs of the preceding research. No new oracle is needed for this prose-only outcome.

### Lead admission closure — 2026-10-30

Operator scope and conditional-unpause approval is recorded in the batch report. The final Claude Sonnet 5.5 cold read found the card/core feasible, subject to live type/schema and dependency checks, now closed by the lead. Explicit new-sweep discovery returned exit1/no matching tests on the unchanged base: intended missing implementation, not a successful run. Oracles are opt-in and baseline failures identify missing new outcomes; positive checker controls and protected-source/historical-config regressions pass. Strict card lint and recorded digest verification pass. Runtime scientific replay, image content, current-reference completeness and novelty remain mandatory independent-verifier evidence; no core-only PASS is acceptable. The operator's preset promotion decision is after research acceptance and must not be mistaken for a prerequisite to recording an honest negative result.

The project TypeScript gate passes; its existing scope excludes e2e. Playwright parsed all twelve new specs (46 tests, all dormant without selection), and explicit node-only oracle runs exercise the frozen checkers. An additional standalone TypeScript check was unavailable because the existing checkout has no @types/node; no dependency/tooling change is commissioned for this extra check. Names and shapes were checked against existing harness/kernel source. The Lorenz `spread.score` is `{min,max,standardDeviation}`, so an equilibrium spread of zero remains a truthy object; a live five-identical-snapshot probe confirms this. Brian's Brain's firing threshold is 0.99 and attractor map enums are clifford/dejong/svensson in current source.

Only 138/139 consume a new dependency: native Depends on checks completed status plus landed commit ancestry and refuses awaiting integration. All other cards remain serial without false success dependencies. Keep production source and protected scripts unchanged throughout this batch; their frozen hashes intentionally detect concurrent edits too. Stop for a real conflict rather than changing a digest or widening scope.
