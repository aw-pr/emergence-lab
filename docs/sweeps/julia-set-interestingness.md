# Julia Set interestingness sweep — 2026-10-30

> **Evidence files.** Sweep evidence (ranked JSON, manifests, screenshots) is not kept in the repository; the harness writes it to git-ignored folders. File names below are plain text so they can be matched against a local run.

**Research outcome: no promotion proposed.** Completed 64 new constant pairs and 24 refined views, plus all three current references. The score leader is cropped and iteration-sensitive; a wider lobed view and a fragmented view are retained as contrasting evidence. These are observed raster morphologies, not mathematical connectivity classifications. Independent cross-family verification and operator visual review remain separate.

## Method

Reused the stage 137 driver, `scoreOne`, `staticBoundaryMetrics` and PNG/report helpers. Opt-in method `static-boundary-v1` scores zero/nonzero escape geometry at 128×128. Zero means not escaped within the iteration limit. `interiorFraction=p`; edge density counts non-wrapping horizontal/vertical zero/nonzero crossings; coarse edges use pairs two cells apart without filtering or decimation. Entropy is binary entropy H(p). The score is `4p(1-p) H(p) sqrt(edge*coarseEdge) max(0,1-2edge)^2`. It contains no temporal or brightness bonus. Historical `scoreFrames` and old configs are unchanged.

Each row starts a fresh deterministic kernel: primary channel0, warmup0, fluxGap0, dt1, no RNG/seed. Candidates pin centre(0,0), base512, adaptive detail=false, palettePhase0 and cycleSpeed0. No rotation setting exists. Validation uses 256×256 at the same settings and exact effective iteration doubling. References retain their shipped base/adaptive settings, with phase/cycling disabled; differing reference iteration limits are recorded and are a comparability limitation.

Full evidence: ranked results, manifest, replay, convergence and screenshot settings, coarse pre-measurement declaration, refined pre-measurement declaration, preserved coarse results, direct-import replay, command outcomes and attempt accounting. Every row retains complete parameters and numeric metrics. Shortlist/reference 128² raw fields are listed below.

## Searched and not searched

No historical Julia grid or appendix exists in the planning source: see [batch live audit](2026-10-30-interestingness-batch.md#live-baseline-and-scope-reconciliation). This is new harness coverage, not a claim that the Julia constants themselves are discoveries. [Current presets](../../src/app/presets.ts) and the [kernel defaults/schema](../../src/sims/julia-set/kernel.ts) are local source citations. The manifest records original preset phase/cycle values and exact source hashes. No external literature claim is made.

| Neighborhood | cRe values | cIm values |
|---|---|---|
| Default | -0.44,-0.42,-0.38,-0.36 | 0.56,0.58,0.62,0.64 |
| Dendrite | -0.83,-0.81,-0.79,-0.77 | 0.141,0.151,0.161,0.171 |
| Rabbit | -0.153,-0.133,-0.113,-0.093 | 0.715,0.735,0.755,0.775 |
| Outward dendrite flank | -0.82,-0.8,-0.78,-0.76 | 0.185,0.195,0.205,0.215 |

Each neighborhood contributes its full 4×4 product at zoom0.85; IDs c01–c64 follow table order, real outer/imaginary inner. All negatives remain in the rankings. Coarse montage inspection selected c01 (coarse score leader), c13 (filled comparison), c16 (branching), c17 (lobes), c33 (rabbit lobes), c49 (dust). These six constants each receive zoom[1,1.3,1.7,2.2], creating c65–c88 in that order. Selection preserves diverse geometry rather than only the densest sets. The exact lists were retained before each measurement pass.

Not searched: panning, global slider ranges, deep zoom, iteration count as an optimisation axis, colour/brightness/cycling, stochastic or temporal dynamics. No production code or presets changed. Validation repeats are additional measurements of declared points, not new candidates.

## Ranked candidates

Top twelve of 88; complete ordering and all parameters are in the ranked JSON. All candidates use the fixed settings stated above.

| Rank | ID | cRe | cIm | zoom | score128 | interior128 | edge128 | coarse edge128 |
|---:|---|---:|---:|---:|---:|---:|---:|---:|
| 1 | 139-c68 | -0.44 | 0.56 | 2.2 | 0.075084047 | 0.572631836 | 0.134288878 | 0.157862103 |
| 2 | 139-c67 | -0.44 | 0.56 | 1.7 | 0.073093307 | 0.415893555 | 0.122723917 | 0.148251488 |
| 3 | 139-c83 | -0.153 | 0.715 | 1.7 | 0.048392309 | 0.411621094 | 0.051550197 | 0.078311012 |
| 4 | 139-c80 | -0.83 | 0.141 | 2.2 | 0.047315267 | 0.523315430 | 0.045829232 | 0.072296627 |
| 5 | 139-c84 | -0.153 | 0.715 | 2.2 | 0.046889238 | 0.524169922 | 0.046013780 | 0.070870536 |
| 6 | 139-c66 | -0.44 | 0.56 | 1.3 | 0.046685759 | 0.286376953 | 0.087659941 | 0.107762897 |
| 7 | 139-c79 | -0.83 | 0.141 | 1.7 | 0.040922932 | 0.388061523 | 0.044291339 | 0.065414187 |
| 8 | 139-c82 | -0.153 | 0.715 | 1.3 | 0.031185608 | 0.266601562 | 0.047428642 | 0.071366567 |
| 9 | 139-c71 | -0.36 | 0.56 | 1.7 | 0.030734253 | 0.560424805 | 0.026451772 | 0.046688988 |
| 10 | 139-c78 | -0.83 | 0.141 | 1.3 | 0.027829076 | 0.276855469 | 0.038508858 | 0.059647817 |
| 11 | 139-c70 | -0.36 | 0.56 | 1.3 | 0.027783974 | 0.375732422 | 0.026390256 | 0.045262897 |
| 12 | 139-c65 | -0.44 | 0.56 | 1 | 0.019259718 | 0.171752930 | 0.059424213 | 0.073040675 |

## Current references

All current shipped presets and the distinct kernel default are included. Adaptive detail=true in all three; original default phase0.38/cycle0.1, Dendrite phase0/cycle0.30, Rabbit phase0.12/cycle0.40 are overridden to0/0. Centre remains(0,0).

| Reference ID | cRe | cIm | zoom | base / effective | score128 | interior128 |
|---|---:|---:|---:|---:|---:|---:|
| 139-current-default | -0.4 | 0.6 | 1.45 | 180 / 205 | 0.000079613 | 0.011474609 |
| 139-current-dendrite | -0.8 | 0.156 | 1 | 128 / 128 | 0.005862268 | 0.074096680 |
| 139-current-rabbit | -0.123 | 0.745 | 1.15 | 220 / 229 | 0.018444332 | 0.188964844 |

## Manual visual interpretation and proposed promotions

**No promotion.** Three evidence finalists are retained, including the rejected score leader. Geometry ranking is only a shortlist instrument.

- **139-c68**, c=(-0.44,0.56), zoom2.2: large dark rounded lobes with fine lace between them. The enlarged window gives a strong score but visibly cuts the figure at the frame. At256, border interior is31.18% and236 border crossings; 7.03125% of cells change zero/nonzero membership on512→1024 iterations. Reject as a preset proposal: crop and iteration sensitivity confound the rank.
- **139-c65**, the same constant at zoom1: a wider, visibly connected-looking chain of filled lobes with smaller branches. It retains the whole figure in the square field (zero border interior/crossings), giving a useful contrast with c68. The apparent connections are raster observations; 2.12708% of cells change at doubled iterations, so this is not a converged topology claim. Its restrained app presentation does not establish an aesthetic improvement over the shipped references.
- **139-c87**, c=(-0.82,0.185), zoom1.7: the app shows separated granular, curling clusters and fine filament-like traces. The512-iteration binary field is sparse dust, and doubling leaves only one zero pixel out of 65,536. This is strong iteration-limit sensitivity, not evidence that the set vanished mathematically. It is intentionally retained despite its near-zero score to expose the metric's blindness when fragmented structure has almost no zero-valued area. No promotion.

Current Dendrite has more visible spiral/branch texture than the wider lobed candidate under the same presentation. The default is granular. Rabbit has substantial lobes in the binary CPU mask but is extremely dim at the pinned zero-phase app presentation; its app screenshot is retained honestly rather than replaced with a brighter phase. That limits aesthetic comparisons, and no CPU score is represented as a GPU pixel-equivalence result.

## App renderer and field evidence

All actual app screenshots use a 1200×900 viewport/canvas, full render quality, GPU fragment renderer, supersample1.5; inferno, gamma0.7, contrast1.5, paletteSteps0, pointSize1, bloom0.3, invert=false. Kernel inputs are read back and asserted exactly, including phase/cycle0 and adaptive detail. Each view reloads the app; after setting controls it runs500ms with motion fixed at zero, pauses, waits1000ms and captures. The navigation HUD may retain a previous value while paused; the JSON `app.inputs` records the asserted actual parameter controls. Initial captures made without an animation-frame flush were discarded from retained screenshot evidence; scratch diagnostics remain outside the report.

App screenshots are colour GPU output at landscape aspect. Field PNGs are256² CPU escape values (often very dark); binary PNGs use black=zero and white=escaped. They are different views of the evidence and must not be confused. Doubling images change the iteration limit only.

| Candidate app screenshot | Current Dendrite reference, identical presentation |
|---|---|
| `139-139-c68-app.png` | `139-139-current-dendrite-app.png` |
| `139-139-c65-app.png` | `139-139-current-dendrite-app.png` |
| `139-139-c87-app.png` | `139-139-current-dendrite-app.png` |

Every retained image and the raw field for each selected view:

| ID / role | App screenshot | Grayscale field256 | Binary512 or shipped limit | Binary doubled limit | Raw field128 |
|---|---|---|---|---|---|
| 139-c68 (candidate) | `139-139-c68-app.png` | `139-139-c68-field-256.png` | `139-139-c68-membership-256.png` | `139-139-c68-comparison-membership-256.png` | `139-c68.field-128.json` |
| 139-c65 (candidate) | `139-139-c65-app.png` | `139-139-c65-field-256.png` | `139-139-c65-membership-256.png` | `139-139-c65-comparison-membership-256.png` | `139-c65.field-128.json` |
| 139-c87 (candidate) | `139-139-c87-app.png` | `139-139-c87-field-256.png` | `139-139-c87-membership-256.png` | `139-139-c87-comparison-membership-256.png` | `139-c87.field-128.json` |
| 139-current-default (current reference) | `139-139-current-default-app.png` | `139-139-current-default-field-256.png` | `139-139-current-default-membership-256.png` | `139-139-current-default-comparison-membership-256.png` | `139-current-default.field-128.json` |
| 139-current-dendrite (current reference) | `139-139-current-dendrite-app.png` | `139-139-current-dendrite-field-256.png` | `139-139-current-dendrite-membership-256.png` | `139-139-current-dendrite-comparison-membership-256.png` | `139-current-dendrite.field-128.json` |
| 139-current-rabbit (current reference) | `139-139-current-rabbit-app.png` | `139-139-current-rabbit-field-256.png` | `139-139-current-rabbit-membership-256.png` | `139-139-current-rabbit-comparison-membership-256.png` | `139-current-rabbit.field-128.json` |

Additional coarse raw fields preserved: c01, c17.

## Resolution, iteration and pathology checks

| ID | iterations → doubled | score128 | score256 | zero fraction256 → doubled | changed fraction | border zero fraction256 |
|---|---:|---:|---:|---:|---:|
| 139-c68 | 512 → 1024 | 0.075084047 | 0.070374429 | 0.575744629 → 0.505432129 | 0.070312500 | 0.311764706 |
| 139-c65 | 512 → 1024 | 0.019259718 | 0.017020490 | 0.172546387 → 0.151275635 | 0.021270752 | 0.000000000 |
| 139-c87 | 512 → 1024 | 0.000004964 | 0.000004125 | 0.003845215 → 0.000015259 | 0.003829956 | 0.001960784 |
| 139-current-default | 205 → 410 | 0.000079613 | 0.000070429 | 0.011016846 → 0.000320435 | 0.010696411 | 0.005882353 |
| 139-current-dendrite | 128 → 256 | 0.005862268 | 0.005116518 | 0.072357178 → 0.032684326 | 0.039672852 | 0.000000000 |
| 139-current-rabbit | 229 → 458 | 0.018444332 | 0.013074845 | 0.190399170 → 0.190399170 | 0.000000000 | 0.000000000 |

All 91 128² rows have finite numeric metrics, nonFiniteFraction=0, outOfRangeFraction=0 and upperEndpointFraction=0. LowerEndpointFraction equals the reported interiorFraction in every row. The same diagnostics are retained for each256² validation/doubling row; no invalid/range/upper-endpoint output occurred. Off-frame geometry is explicitly exposed by border interior and crossing diagnostics, not silently penalised into a promotion decision. Resolution changes are separate measurements: c68 scores0.075084047 at128 and0.070374429 at256. Reference and candidate iteration changes are shown above; Rabbit alone has no binary membership changes in this shortlist under its doubled reference limit.

## Reproduction and checks

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 139 "
SWEEP_REPLAY=139 npx playwright test e2e/sweep.spec.ts -g "139 independently replay"
SWEEP_CONTRACT=139 npx playwright test e2e/sweep-139.contract.spec.ts
scripts/check-contract-test-gate.sh --worktree
npm run verify
npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"
```

Check port5173 is vacant before starting the owned server; do not reuse another preview. Stop only that owned process. The first command runs until stopped. The exact sweep title executes one non-skipped test, covering 88 candidate rows and 3 references; the earlier coarse pass executed64+3. Replays and image-refresh reruns repeat the same declared samples.

Worker validation: final sweep exit0 (1 passed); direct-import replay exit0 (1 passed), all 91 fields reproduced with identical ordering and maximum absolute metric delta0 against tolerance1e-9. The replay directly imports JuliaSetKernel and the exported static metric in Chromium, bypassing the shared driver/scoreOne. Full raw shortlist/reference128² fields and complete numeric readings are retained. `npm run verify` exit0:395 passed,38 skipped; typecheck/build green, existing chunk-size warning. Baseline browser command exit1:4 passed,1 known Gray–Scott literal failure,1 opt-in skipped; current score0.7065245840037978 and coverage0.692138671875 match the documented pre-143 baseline. Frozen gate exit0. Frozen 139 contract exit0: four passed, zero skipped, with evidence completeness, unchanged protected source/historical configs and metric calibration checked. Cross-family replay and operator promotion sign-off are not claimed by the worker.
