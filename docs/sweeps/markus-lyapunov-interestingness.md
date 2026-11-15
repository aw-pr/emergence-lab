# Markus–Lyapunov interestingness sweep — 2026-10-30

> **Evidence files.** Sweep evidence (ranked JSON, manifests, screenshots) is not kept in the repository; the harness writes it to git-ignored folders. File names below are plain text so they can be matched against a local run.

**Research outcome: no promotion proposed.** Completed 48 coarse and 24 refined views (all six schema sequences), plus both shipped views as current references. The sign-mix score ranks balanced, moderately bounded stable/chaotic splits, but the leaders read dimmer and flatter in the app palette than the shipped Woven boundary and Zircon Zity references. Three evidence finalists are retained, including the rejected score leader. Independent cross-family verification and operator visual review remain separate.

## Method

New opt-in method `lyapunov-sign-v1` (`lyapunovSignMetrics` in `e2e/harness/metrics.ts`) scores the two kernel channels directly: channel 0 is stability magnitude, channel 1 chaos magnitude. Both are replayed at identical parameters and read unclipped, so the sign is never inferred from a clipped scalar frame. A cell is *stable* when only channel 0 is positive, *chaotic* when only channel 1 is, and *zero* (neither sign) otherwise. Zero cells are counted separately and take no part in the sign statistics.

- `stableFraction`, `chaoticFraction`, `zeroFraction`: over all cells.
- `signMix = 4·stable·chaotic`: zero for empty or one-sign fields, one for a fully assigned balanced split.
- `boundaryDensity`: opposing-sign non-wrapping horizontal/vertical neighbour pairs over all such pairs.
- `score = signMix · min(1, boundary/0.05) · max(0, 1 − 2·boundary)²`. It ramps in over the first 5% of boundary density and reaches zero at 50%, so a balanced salt-and-pepper field scores 0 while a coherent half-plane scores 0.73·signMix. Pure and empty fields score 0.

Historical `scoreFrames` outputs and every old config are untouched; the frozen contract's hash check covers the old configs. Each row starts a fresh deterministic kernel: no RNG or seed, no `step` calls, `rotationSpeed` pinned to 0 (rotation is presentation, not new dynamics), 128×128 grid, warmup 300 and sample 700 iterations for every candidate. Raw-channel diagnostics (non-finite, at-ceiling, both-sign, off-plane fractions) are reported on every row and never scored.

Full evidence: ranked results, manifest, replay, convergence and screenshot settings, coarse pre-measurement declaration, refined pre-measurement declaration, preserved coarse results, direct-import replay. Raw 128² sign maps for each finalist and reference: c06, c62, c69, Zircon Zity, Woven boundary. They store `S`/`C`/`0` per cell, which is lossless for every sign metric.

## Searched and not searched

No historical Markus–Lyapunov grid, appendix range, config or retained ranking exists: see the [batch live audit](2026-10-30-interestingness-batch.md) and the [shared fractal index](fractal-interestingness.md). This is new harness coverage. Sources: [current presets](../../src/app/presets.ts), the [kernel schema](../../src/sims/markus-lyapunov/kernel.ts) and the [grid model](../../src/sims/markus-lyapunov/model.ts); no external literature claim is made.

**Sequence enum (every finite option the schema exposes):** `AB`, `AABB`, `AAB`, `ABB`, `AABAB`, `AAAABBBBBB`.

**Allocation: 6 sequences × 8 views = 48 coarse.** The same eight views are used for every sequence so sequence is the controlled axis; IDs c01–c48 run sequence-outer, view-inner in the order above and below.

| Neighbourhood | Views (centre A, centre B, zoom) |
|---|---|
| Zircon Zity (shipped 3, 3, 1) | (3, 3, 1), (3, 3, 1.6), (3.3, 3.3, 2.4), (2.7, 3.3, 2.4) |
| Woven boundary (shipped 3.48, 3.64, 4.5) | (3.48, 3.64, 4.5), (3.48, 3.64, 2.8), (3.36, 3.52, 4.5), (3.6, 3.76, 4.5) |

**Refined: 3 leaders × 8 = 24 (c49–c72).** The three best distinct sequence/window pairs of the coarse ranking were AB at (3.48, 3.64, 2.8), ABB at (3.36, 3.52, 4.5) and AABB at (3.48, 3.64, 4.5). Each gets zoom factors 1.4 and 2 with the four diagonal offsets of ±0.15 of its coarse window span (2/zoom), enumerated factor-outer. Exact parameters for all 72 rows are in the JSON manifest, which was written before measurement.

Not searched: a global slider Cartesian product, palette or rotation search, iteration count as a ranking axis (only the doubling recheck below), custom sequences outside the enum, windows outside A, B ∈ [0, 4], temporal dynamics. Validation repeats and the two references are additional to the 48 + 24 candidates.

## Ranked candidates

Top twelve of 72; the complete ordering with every parameter is in the JSON. Fixed for all: warmup 300, sample 700, rotation 0, 128².

| Rank | ID | sequence | centre A | centre B | zoom | score | stable | chaotic | zero | sign mix | boundary |
|---:|---|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 140-c06 | AB | 3.48 | 3.64 | 2.8 | 0.788195 | 0.558228 | 0.441772 | 0.000000 | 0.986438 | 0.053057 |
| 2 | 140-c50 | AB | 3.372857142857 | 3.747142857143 | 3.92 | 0.761614 | 0.578003 | 0.414185 | 0.007812 | 0.957600 | 0.048844 |
| 3 | 140-c62 | ABB | 3.293333333333 | 3.586666666667 | 9 | 0.736301 | 0.480103 | 0.519897 | 0.000000 | 0.998416 | 0.070620 |
| 4 | 140-c69 | AABB | 3.413333333333 | 3.573333333333 | 9 | 0.734594 | 0.593689 | 0.406311 | 0.000000 | 0.964890 | 0.063730 |
| 5 | 140-c58 | ABB | 3.293333333333 | 3.586666666667 | 6.3 | 0.734448 | 0.517578 | 0.482422 | 0.000000 | 0.998764 | 0.071235 |
| 6 | 140-c64 | ABB | 3.426666666667 | 3.586666666667 | 9 | 0.723560 | 0.524231 | 0.475769 | 0.000000 | 0.997651 | 0.074188 |
| 7 | 140-c71 | AABB | 3.546666666667 | 3.573333333333 | 9 | 0.720178 | 0.467285 | 0.532715 | 0.000000 | 0.995719 | 0.074772 |
| 8 | 140-c65 | AABB | 3.413333333333 | 3.573333333333 | 6.3 | 0.716619 | 0.611389 | 0.388611 | 0.000000 | 0.950370 | 0.065822 |
| 9 | 140-c67 | AABB | 3.546666666667 | 3.573333333333 | 6.3 | 0.704571 | 0.422729 | 0.577271 | 0.000000 | 0.976117 | 0.075203 |
| 10 | 140-c60 | ABB | 3.426666666667 | 3.586666666667 | 6.3 | 0.694223 | 0.495728 | 0.504272 | 0.000000 | 0.999927 | 0.083385 |
| 11 | 140-c31 | ABB | 3.36 | 3.52 | 4.5 | 0.692198 | 0.631470 | 0.368530 | 0.000000 | 0.930863 | 0.068836 |
| 12 | 140-c13 | AABB | 3.48 | 3.64 | 4.5 | 0.660174 | 0.433105 | 0.566895 | 0.000000 | 0.982100 | 0.090059 |

Best per sequence (rank of 72): AB c06 (1), ABB c62 (3), AABB c69 (4), AABAB c37 (24, identical to the Woven boundary reference point), AAAABBBBBB c45 (19), AAB c23 (25). The low end is dominated by the zoom-1.6 and (2.7, 3.3) windows, which are almost entirely stable (score 0.0015 to 0.12). `AAB` and `AABAB` have eight coarse views only, because they were not selected as refinement leaders.

## Current references

Both shipped views at their shipped iteration settings, rotation disabled. The kernel default view equals Zircon Zity apart from rotation 6, so it is not a separate row.

| Reference ID | centre A | centre B | zoom | sequence | warmup/sample | score | stable | chaotic | zero | sign mix | boundary | Rank among 72 |
|---|---:|---:|---:|---|---|---:|---:|---:|---:|---:|---:|---|
| 140-current-zircon-zity | 3 | 3 | 1 | AB | 200/500 | 0.536782 | 0.784790 | 0.215210 | 0.000000 | 0.675579 | 0.048782 | would rank 37 |
| 140-current-woven-boundary | 3.48 | 3.64 | 4.5 | AABAB | 300/700 | 0.603736 | 0.480103 | 0.519897 | 0.000000 | 0.998416 | 0.111190 | would rank 24 |

## Manual visual interpretation and proposed promotions

**No promotion.** The metric shortlists balanced sign geometry; it does not decide which view looks better. The observations below are manual findings from the images, not new numerical classes.

- **140-c06** (AB, 3.48/3.64, zoom 2.8; score leader): in the app palette two broad dark-brown stable bands with thin bright superstable lines cross a blue-black chaotic field. It has the most balanced split, but the stable regions are large and flat, so the picture is coarser and dimmer than either reference. Reject as a preset proposal; the rank reflects sign balance, not richness.
- **140-c62** (ABB, 3.2933/3.5867, zoom 9): a large smooth stable sweep fills the lower half and a band of fine filigree fills the upper half. Fine structure is present, but contrast is low and most of the frame is a flat dark field. Not proposed.
- **140-c69** (AABB, 3.4133/3.5733, zoom 9): the most structurally varied of the three. It shows nested arc families (a spiral-like fan of chaotic stripes in the right half) over a large stable field. Worth an operator look, but the shipped Woven boundary has comparable filigree with more bright superstable curves, so no case for replacing it is made here.
- **Shipped Zircon Zity** is the most dramatic frame: bright superstable ridges and a large glowing stable lobe. Its sign score is low only because it is 78% stable. This is the clearest case of the sign metric ignoring brightness and magnitude: it ranks 37 of 72 despite being visually the strongest.
- **Shipped Woven boundary** shows dense filaments and nests across the whole frame under a dim palette, and scores 0.604 (rank 24 equivalent).

Because score sees only the sign of the exponent, it prefers windows where the stable and chaotic areas are near equal, which the rankings confirm (the top twelve sit at 42–63% stable). Brightness comes from stable magnitude near superstable points, which this score does not read. No CPU score is a GPU pixel-equivalence claim.

## App renderer and field evidence

**The `markus-lyapunov` route is shelved in the app (`SHELVED_SLUGS` in `src/app/registry.ts`), so the full app page cannot be loaded and no production change was allowed.** The colour screenshots below are instead produced by the app's own `Renderer` (WebGL2 backend, `data-renderer=webgl2`) driving the real `MarkusLyapunovKernel`, with the app's default Lyapunov colour options (`defaultColourOptionsFor`: palette `lyapunov`, gamma 0.8, contrast 1.3), the field render mode and its quality profile's default resolution, no bloom and rotation 0. They show the renderer's output, not the page chrome or controls. Each is a 1200×900 canvas; the renderer's compute grid is 739×554 (see `app.renderSize` in the JSON). The landscape aspect shows more plane along the A axis than the square 128² and 256² CPU fields, so these are separate checks, not numeric replays. In particular the Zircon Zity frame extends past A = 4 on the right, where the kernel writes empty cells (the dark-blue strip); the square fields do not.

Grayscale sign PNGs are 256² CPU fields: white stable, black chaotic, mid grey zero. The `stability-field` PNGs are the channel-0 magnitude (0 to 2 scaled to 0 to 1). They are not app renderer output.

| Candidate app render | Current Zircon Zity (identical presentation) | Current Woven boundary (identical presentation) |
|---|---|---|
| `140-140-c06-app.png` | `140-140-current-zircon-zity-app.png` | `140-140-current-woven-boundary-app.png` |
| `140-140-c62-app.png` | `140-140-current-zircon-zity-app.png` | `140-140-current-woven-boundary-app.png` |
| `140-140-c69-app.png` | `140-140-current-zircon-zity-app.png` | `140-140-current-woven-boundary-app.png` |

Every retained image:

| ID / role | App render | Sign field 256 | Sign field 256, doubled iterations | Stability magnitude 256 |
|---|---|---|---|---|
| 140-c06 (candidate) | `140-140-c06-app.png` | `140-140-c06-sign-256.png` | `140-140-c06-sign-256-doubled.png` | `140-140-c06-stability-field-256.png` |
| 140-c62 (candidate) | `140-140-c62-app.png` | `140-140-c62-sign-256.png` | `140-140-c62-sign-256-doubled.png` | `140-140-c62-stability-field-256.png` |
| 140-c69 (candidate) | `140-140-c69-app.png` | `140-140-c69-sign-256.png` | `140-140-c69-sign-256-doubled.png` | `140-140-c69-stability-field-256.png` |
| 140-current-zircon-zity (current reference) | `140-140-current-zircon-zity-app.png` | `140-140-current-zircon-zity-sign-256.png` | `140-140-current-zircon-zity-sign-256-doubled.png` | `140-140-current-zircon-zity-stability-field-256.png` |
| 140-current-woven-boundary (current reference) | `140-140-current-woven-boundary-app.png` | `140-140-current-woven-boundary-sign-256.png` | `140-140-current-woven-boundary-sign-256-doubled.png` | `140-140-current-woven-boundary-stability-field-256.png` |

## Resolution, iteration and pathology checks

Finalists and references re-measured with warmup and sample iterations doubled (Zircon Zity 200/500 to 400/1000; every other row to 600/1400), at 128² and 256². Static deterministic sign fields, so no time strips or seeds apply.

| ID | grid | score | score doubled | stable → doubled | boundary → doubled | changed-sign fraction | cells at magnitude ceiling |
|---|---:|---:|---:|---|---|---:|---:|
| 140-c06 | 128 | 0.788195 | 0.781707 | 0.558228 → 0.559937 | 0.053057 → 0.054718 | 0.002075 | 96 |
| 140-c06 | 256 | 0.639510 | 0.670401 | 0.557114 → 0.558975 | 0.037937 → 0.040196 | 0.002228 | 398 |
| 140-c62 | 128 | 0.736301 | 0.720251 | 0.480103 → 0.485352 | 0.070620 → 0.075480 | 0.005981 | 0 |
| 140-c62 | 256 | 0.804381 | 0.789296 | 0.478912 → 0.484268 | 0.051164 → 0.055568 | 0.006363 | 0 |
| 140-c69 | 128 | 0.734594 | 0.717536 | 0.593689 → 0.600342 | 0.063730 → 0.067667 | 0.007141 | 1 |
| 140-c69 | 256 | 0.733118 | 0.754181 | 0.593765 → 0.598969 | 0.046101 → 0.048032 | 0.005753 | 5 |
| 140-current-zircon-zity | 128 | 0.536782 | 0.543204 | 0.784790 → 0.786621 | 0.048782 → 0.050258 | 0.002197 | 557 |
| 140-current-zircon-zity | 256 | 0.423976 | 0.440451 | 0.785995 → 0.788544 | 0.036696 → 0.038810 | 0.002701 | 2222 |
| 140-current-woven-boundary | 128 | 0.603736 | 0.590212 | 0.480103 → 0.488525 | 0.111190 → 0.115773 | 0.009277 | 1 |
| 140-current-woven-boundary | 256 | 0.695501 | 0.683643 | 0.480453 → 0.488724 | 0.082698 → 0.086481 | 0.009186 | 2 |

Doubling iterations changes under 1% of cell signs and moves the score by at most 0.031, so sign geometry is converged enough for ranking. Resolution is a larger effect: boundary density falls by about 30% from 128² to 256² for c06 and its score drops from 0.788 to 0.640, because the boundary-density ramp is scale dependent. Scores are comparable only at one grid; the ordering of c62 and c69 against c06 reverses at 256². Cross-resolution readings are separate checks, not replays.

Pathology: across all 74 measured rows (72 candidates, 2 references) there are no non-finite cells and no cell has both channels positive. The maximum fraction of cells at the 2.0 magnitude ceiling is 0.0412 (140-c09, AABB at the Zircon Zity window); c06 has 96 of 16,384 cells at the ceiling. Nonzero zero fractions occur only in c50 and c52 (0.0078 each, one row), which are exactly their off-plane fraction: their windows reach B = 4.0025, so the top row lies outside the logistic plane and the kernel writes empty cells. No other candidate or reference leaves the plane at 128². No finalist is pathological in these terms.

## Reproduction and checks

```sh
npm run dev -- --host 127.0.0.1 --port 5173 --strictPort
SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 140 "
SWEEP_REPLAY=140 npx playwright test e2e/sweep.spec.ts -g "140 independently replay"
SWEEP_CONTRACT=140 npx playwright test e2e/sweep-140.contract.spec.ts
scripts/check-contract-test-gate.sh --worktree
npm run verify
npx playwright test e2e/sweep.spec.ts -g "metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation"
```

Check port 5173 is vacant before starting the owned server; do not reuse another preview, and stop only that process. With `MARKUS_REFINED_VIEWS` empty the sweep test runs the 48 coarse views only and writes `coarse-results.json`; with the committed 24 refined views it runs all 72 plus the references, convergence and renders. The exact sweep title executes one non-skipped test.

Worker validation: sweep exit 0 (1 passed, 72 candidates, 2 references, 5 renders); direct-import replay exit 0 (1 passed), 74 fields reproduced with identical ordering and maximum absolute metric deviation 0 against tolerance 1e-9, bypassing the shared driver and `scoreOne`. `npm run verify` exit 0: 397 passed, 38 skipped; typecheck and build green with the existing chunk-size warning. Baseline browser command exit 1: 4 passed, 1 known Gray–Scott literal failure, 1 opt-in skipped; Gray–Scott score 0.7065245840037978 and coverage 0.692138671875 match the documented pre-143 baseline. Frozen 140 contract exit 0: four passed, zero skipped, covering evidence completeness, unchanged protected source and historical configs, and metric calibration. Frozen-digest gate exit 0. Cross-family replay and operator promotion sign-off are not claimed by the worker.
