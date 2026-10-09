# Stage 109 boundary-detail ring audit

## Result: PARTIAL, R=4 passes criteria 2 to 7 but the inherited regression gate does not

The re-briefed product change works. At the desktop default, fixed ring R=4
builds 9,096,256 raised points against the served baseline's 7,002,192, a
ratio of 1.2991 against the accepted 1.25 bar. It admits all 81,380 core
candidates before 94,206 ring-2-to-4 candidates, stays below both the 20M
point budget and the 400 MB per-draw ceiling, and the complete new six-test
spec passes.

The stage cannot report an overall PASS because criterion 1 names two older
suites whose assertions are stale against the dispatch base. `packed-cells`
has three absolute pixel-coverage failures that reproduce on both trees, and
`refine-levels` still expects card 107's tree to be denser than its own now
current baseline at boundary detail 0. Those assertions are outside this
card's narrowly permitted repair class, so they were recorded rather than
weakened. Details and evidence are under "Acceptance results".

## Serving the baseline

The unchanged dispatch base is commit `c21163c1c`, unpacked under the ignored
`build/boundary-ring-109-baseline/`. The run worktree is served on port 5173
by tmux session `boundary-ring-109-current`; the baseline is served on port
5174 by `boundary-ring-109-baseline`. Both use the ignored no-HMR Vite config
from audit 107. The criterion-5 bake is linked into the baseline. Both
sessions are left running for the verifier.

## Implementation

`escapeBoundaryRings` in `src/app/orbitSampler.ts` makes one `Uint8Array` over
the base escape mask for a widened ring. It seeds ring 1 with the old
eight-neighbour predicate, then performs forward and reverse eight-neighbour
relaxations within each escape state. This gives Chebyshev distance to the
other state and records rings through 6 for the retained attempt-1 table.
At R=1 the sampler deliberately uses the old predicate directly and allocates
no ring array, so non-`extreme` builds retain the baseline's counts and build
bytes exactly.

Core admission is unchanged: tails and ring 1 traverse the old grid order and
use the existing `reservoirSlot` sequence. Only after the core reservoir is
complete do rings 2 through R take its remaining slice, nearest ring first,
with a deterministic reservoir within each ring. A bounded tail in an outer
ring remains core and is not duplicated. If core fills the candidate cap,
outer-ring capacity is zero and no core candidate is displaced.

`orbitCloudBuildPlan` passes R=4 only for active boundary detail at `extreme`,
R=1 at other active tiers, and R=0 when the raised tier is off. Cloud and
hybrid call sites use the same plan. The restored card-108 20M planner,
12.5M raised-point cap, split upload, exact bound-byte diagnostics and sampler
batching remain in place. The renderer publishes and clears the required
ring, core, outer-ring and admitted-candidate attributes.

## Ring sweep retained from attempt 1

The operator's re-brief says not to repeat the R=2-to-6 sweep. This table is
the measured table preserved in commit `e754c8297`, with evidence originally
written to `e2e/artifacts/boundary-ring/ring-sweep.json`. "Contribution" is
the allocated raised-point increase from R=k-1 to R=k; R=1 is the old core
tier and includes tails outside ring 1.

| k | Cells in ring | Bounded | Raised points at R=k | Contribution of ring k | Ratio to baseline |
|---:|---:|---:|---:|---:|---:|
| 1 | 51,503 | 24,649 | 7,002,192 | 7,002,192 | 1.0000 |
| 2 | 42,038 | 18,406 | 7,690,872 | 688,680 | 1.0984 |
| 3 | 39,493 | 16,126 | 8,361,672 | 670,800 | 1.1942 |
| 4 | 38,076 | 14,683 | 9,096,256 | 734,584 | 1.2991 |
| 5 | 37,063 | 13,750 | 9,114,944 | 18,688 | 1.3017 |
| 6 | 36,435 | 13,052 | 9,114,944 | 0 | 1.3017 |

R=4 is therefore the fixed product choice from the re-brief. The current
measurement reproduces its 81,380 core candidates, sees 94,206 eligible
ring-2-to-4 candidates, and admits all 175,586. Current evidence:
`e2e/artifacts/boundary-ring/budget.json` and
`e2e/artifacts/boundary-ring/ring-selection-r4.json`.

## Layout at `extreme` on both trees

GPU cloud path, boundary detail 1, opening camera. The baseline predates the
new scalar diagnostics, so its R=1 and 81,380 admitted core candidates are the
reviewed old rule and card-108 measurement. Byte figures are the exact six
Float32 attribute allocations. Evidence:
`e2e/artifacts/boundary-ring/budget.json`.

| Tree | Tail | Budget | Ring | Core / outer / admitted | Lower points | Raised sub-cells | Raised points | Total points | Slots | Main / detail bytes | Build / sampler bytes | Build ms |
|---|---:|---:|---:|---|---:|---:|---:|---:|---:|---:|---:|---:|
| current | 0.6 | 20,000,000 | 4 | 81,380 / 94,206 / 175,586 | 8,361,936 | 1,882,800 | 9,096,256 | 17,458,192 | 2,182,274 | 267,581,952 / 291,080,192 | 686,746,990 / 1,168,256,942 | 2,785 |
| baseline | 0.6 | 16,000,000 | 1 | 81,380 / 0 / 81,380 | 8,361,936 | 1,285,771 | 7,002,192 | 15,364,128 | 1,920,516 | 267,581,952 / 224,070,144 | 595,874,923 / 939,807,392 | 2,218 |
| current | 0.3 | 20,000,000 | 4 | 81,380 / 94,206 / 175,586 | 5,481,936 | 1,882,800 | 9,096,256 | 14,578,192 | 1,822,274 | 175,421,952 / 291,080,192 | 582,397,001 / 1,107,634,949 | 2,667 |
| baseline | 0.3 | 16,000,000 | 1 | 81,380 / 0 / 81,380 | 5,481,936 | 1,285,771 | 7,002,192 | 12,484,128 | 1,560,516 | 175,421,952 / 224,070,144 | 491,524,934 / 879,185,399 | 1,999 |
| current | 0 | 20,000,000 | 4 | 81,380 / 94,206 / 175,586 | 2,601,936 | 1,882,800 | 9,096,256 | 11,698,192 | 1,462,274 | 83,261,952 / 291,080,192 | 481,202,112 / 1,061,433,170 | 2,418 |
| baseline | 0 | 16,000,000 | 1 | 81,380 / 0 / 81,380 | 2,601,936 | 1,285,771 | 7,002,192 | 9,604,128 | 1,200,516 | 83,261,952 / 224,070,144 | 390,330,045 / 832,983,620 | 1,751 |

Neither tree's raised tier crosses 12,500,000 points or 400,000,000 bound
bytes at any measured tail setting. Every current total stays below 20M.
At boundary detail 0, current and baseline are exactly equal at 8,361,936
points, 1,045,242 slots, 1,648,446 base cells and 752,195 refined sub-cells.
At `ultra`, R=1 and both trees are exactly equal, including 5,425,536 points,
678,192 slots, 352,049 raised sub-cells, 208,045,561 build bytes and
279,055,420 sampler bytes.

## Cost

Three matched headless samples per tree use the GPU timer. The headed values
come from one batched headed launch; its display-link rAF interval has no bar.
The whole-cardioid pose is distance 2.4083 and the real-axis pose is distance
0.35. Evidence: `e2e/artifacts/boundary-ring/cost.json`.

| Pose | Headless GPU ms current / baseline | Ratio | 60 Hz frames current / baseline | Headed GPU ms current / baseline | Headed rAF interval ms current / baseline |
|---|---:|---:|---:|---:|---:|
| opening | 34.159 / 34.192 | 0.999 | 3 / 3 | 34.419 / 34.184 | 36.9 / 35.4 |
| whole cardioid | 64.906 / 76.474 | 0.849 | 4 / 5 | 66.398 / 56.030 | 39.2 / 32.0 |
| real axis | 9.649 / 8.082 | 1.194 | 1 / 1 | 17.857 / 12.579 | 16.7 / 16.6 |

Headless opening and whole-cardioid GPU times cross 16.7 ms on both trees;
the real-axis times do not. In the headed launch, current real-axis GPU time
also crosses 16.7 ms while baseline does not. Opening GPU cost is unchanged
within 0.1%. Current-over-baseline ratios are 1.170 for build wall-clock,
1.153 for build bytes and 1.243 for sampler bytes, all inside the card's bars.

## CPU, prebaked and hybrid paths

The CPU `balanced` path is exact on both trees: 1,045,464 points, 130,683
slots, 1,440,000 refinement rows and no raised points. The exact bake command
produced 26,015 cells; both trees select `prebaked` and report 208,120 points
at eight plotted iterations. Evidence:
`e2e/artifacts/boundary-ring/unchanged.json`.

Hybrid completes on both trees. Current reports 17,458,192 of its 20M budget,
9,096,256 raised points, 267,581,952 main bytes and 291,080,192 detail bytes;
baseline reports 15,364,128 points and 7,002,192 resolved raised points.
Evidence: `e2e/artifacts/boundary-ring/hybrid.json`.

## Operator evidence

- `e2e/artifacts/boundary-ring/evidence-whole-cardioid-current.png`
- `e2e/artifacts/boundary-ring/evidence-whole-cardioid-baseline.png`
- `e2e/artifacts/boundary-ring/evidence-real-axis-current.png`
- `e2e/artifacts/boundary-ring/evidence-real-axis-baseline.png`
- Metadata: `e2e/artifacts/boundary-ring/evidence.json`

At both shown-tier poses the current tree is subtly denser along boundary
filaments and sheet edges. Neither tree shows new gaps. R=4 does not read as
a visible halo or hard outer step; the difference is modest and needs a close
comparison, consistent with a 29.9% raised-point gain rather than the 45%
originally planned. The matching headless GPU medians are 64.906 versus
76.474 ms at the whole-cardioid pose and 9.649 versus 8.082 ms at real axis.

## Authoring estimate against measurement

| Figure | Authoring estimate | R=4 measurement | Result |
|---|---:|---:|---|
| Candidates needed/admitted | about 118,000 | 175,586 | estimate low |
| Raised points | about 10.15M | 9,096,256 | estimate high |
| Raised ratio | originally 1.45, re-briefed to 1.25 | 1.2991 | re-briefed bar holds |
| Raised cap | 12.5M / 400 MB | 9.096M / 291.1 MB | holds |

The 94,206 outer candidates add 2,094,064 raised points, about 22.2 points per
candidate rather than the core's roughly 86. Outer cells escape more often or
pack into fewer distinct rows, which explains the authoring overestimate.

## Earlier-suite repairs

None. The implementation was instead corrected so an R=1 build uses the old
edge predicate without allocating a distance field; this restored exact
`ultra` counts and build bytes. The remaining older-suite failures are not
assertions comparing raised-tier or total point counts at `extreme` with
boundary detail above 0, so deliverable 6 does not authorise editing them.

## Acceptance results

| Criterion | Result | Evidence |
|---|---|---|
| 1. Regression and frozen contracts | **FAIL** | `npm run verify`, the contract gate, all seven opt-in contract commands, smoke, `tail-default` (5/5) and the selected `inside-out-cycling` set (16/16) pass. `packed-cells` is 9/12: both trees measure the same 0.01976 plane coverage below a stale 0.15 absolute bar; plotted cardioid is 0.04516 below 0.05; prebaked plotted-1 is 0.09906 below 0.1 (`e2e/artifacts/packed-cells/plane-coverage.json`, `plotted.json`, `prebaked.json`). After the R=1 byte fix, the targeted `refine-levels` cost test passes exactly; its remaining tail-density failure compares the current tree with its identical boundary-detail-0 dispatch baseline and demands strictly greater rather than equal, while its plane bar is also stale (`e2e/artifacts/refine-levels/tail-density.json`, `cost.json`). These failures are outside deliverable 6's permitted repair class. |
| 2. Budget, ring and cap | pass | `e2e/artifacts/boundary-ring/budget.json`, `ring-selection-r4.json`: R=4, all 81,380 core candidates admitted, raised ratio 1.2991, point and draw caps hold, detail 0 and `ultra` are exact. |
| 3. Gating | pass | `e2e/artifacts/boundary-ring/gating.json`: opening opacity 0, mean RGB difference 0; real-axis opacity 1. |
| 4. Cost | pass | `e2e/artifacts/boundary-ring/cost.json`: every ratio is inside its bar; absolute GPU and display-link values are tabulated above. |
| 5. CPU and prebaked unchanged | pass | `e2e/artifacts/boundary-ring/unchanged.json`: CPU counts exact, prebaked 26,015 by 8 on both trees. |
| 6. Hybrid | pass | `e2e/artifacts/boundary-ring/hybrid.json`: complete, under 20M and both draw blocks under 400 MB. |
| 7. Operator evidence | pass | The four literal PNG paths above exist and were visually reviewed; no gaps, halo or hard ring step were found. |

The whole new spec passes 6/6 in one run. Playwright's literal
`--grep 'budget'` also matches the filename `boundary-budget.spec.ts`, so it selects
all six tests rather than criterion 2 alone; the complete run demonstrates
that expanded selection is green.

## Recommendation

The 20M ceiling with R=4 is worth keeping as the desktop default on the new
criteria. It buys a measured 29.9% raised-point increase with no visible halo,
no gaps and essentially unchanged opening-frame GPU cost. The build and memory
increases are bounded, and shown-tier headless ratios remain inside the card's
limits. The visual gain is subtle, and the headed real-axis sample crossing
16.7 ms should remain visible to the operator, but it does not outweigh the
denser boundary on this machine. This recommendation is about the product
change; the stage still needs a re-brief for the stale criterion-1 assertions
before it can land as PASS.

## Unresolved limitations

- Criterion 1 cannot pass without authority to repair four stale test failures
  outside deliverable 6's permitted class.
- The per-ring R=2-to-6 contribution table is retained from attempt 1 as the
  re-brief requires; the current run remeasured only the fixed R=4 product.
- The widened ring is a sampled-grid Chebyshev band, so its physical width
  varies with the base grid spacing across tiers; only `extreme` widens it.
- The visual improvement is subtle at the two prescribed poses even though
  the raised allocation grows by 29.9%.
