# Orbit-spread colouring for Inside-out: measurement audit (stage 99)

Date: 2026-10-02. Worker: Claude Fable 5.1. Evidence script:
`scripts/analyze-orbit-spread.mjs` (run after `npm run build:test`; prints
JSON to stdout, `--previews <dir>` also writes the PNGs). Every number below
names the JSON key it comes from. "Shipped" means the production
`sampleAttractorCell` at warmup 1500 and 8 samples (`settings.shippedWarmup`,
`settings.shippedSamples`); the float64 orbits the script iterates itself are
references and candidate estimators only.

The scalar under study is the operator's: a point at height Re(z) over cell c
reads the palette at `fract(bands * |Re(z) - h0(c)| - phase)`, with h0(c) the
mean height of the orbit at c and the distance absolute. Both are fixed
inputs; the comparators in question B inform and do not replace.

## Summary

- The mean centre works, but not with the estimator the renderer has today.
  The mean of the 8 plotted samples is biased by up to 0.57 of a lap on
  periodic cells whose period does not divide 8, and in the chaotic band it
  moves by a median 0.15 lap and a 90th-percentile 0.64 lap between adjacent
  columns, so colour strata would not line up column to column (B).
- With an exact cycle mean for cells that have a period and a 1024-iterate
  running mean for cells that do not, the column-to-column movement in the
  chaotic band drops to a median 0.012 lap, within a factor of two of the
  exact mean's own 0.0067 lap. The exact mean itself has 16 seams above
  5% of a lap across 424 column pairs, all at the edges of periodic windows,
  which no estimator removes.
- The scalar is continuous through the period-doublings at c = -0.75 and
  c = -1.25 and through the root of the 1/3 bulb. The shipped warmup leaves
  more than 1% of a lap of residual spread only within 0.001 of each
  bifurcation (C).
- Band density keeps its meaning as laps per unit of height deviation at
  1.5. The two period-2 branches then span 1.06 laps across the bulb and a
  chaotic column spans a median 2.5 laps (D). Every period-1 point sits at
  distance zero, so the whole cardioid sheet is one colour that changes
  with phase.
- Ground scalar: the RMS deviation of the column about h0 (E).
- Off the real axis, cells the sampler reports as periodless are almost all
  long-period or slowly converging cycles, not chaos: of 13,330 such cells
  on the shipped grid, 50 have no period up to 2048 (A, F).

## Method

- Grid: the shipped desktop compute grid, 2429 x 1518 over Re [-2, 1] x
  Im [-1, 1], middle row pinned to Im(c) = 0 as `orbit3d.ts` does
  (`settings.grid`). Column pitch 0.0012351 (`settings.pitchRe`).
- Shipped figures: `sampleAttractorCell(cRe, cIm, 1500, 8, ...)`, the
  period from its return value, h0 as the mean of the 8 float32 samples.
- Estimators: float64 orbit from z = 0, 1500 warmup iterates discarded, then
  the running mean of Re(z) over N = 8, 64, 256, 1024, 4096 iterates
  (`settings.estimatorConvention`). The reference is the same orbit's mean
  over 10^6 iterates. "Converged" references for question C use a 10^6
  warmup then a 64-iterate window.
- Classification of periodless cells (`runningMeanError.definition`):
  "unresolved" is bounded, shipped period 0 and still bounded through the
  10^6 reference; "chaotic" is unresolved with no period up to 2048 in the
  reference orbit's final 4096 iterates (tolerance 1e-10). The sampler's
  Brent-style early exit exposed the distinction: on one off-axis cell the
  sampler's window started exactly one iterate before the float64 clone's,
  which only a cycle of period 281 explains. The clone gap for the real-axis
  chaotic set is 6e-8 (float32 storage), for the off-axis unresolved set
  1.18 (`*.shippedWindow.maxCloneGap`).
- Lap fractions are jump x band density, tabulated at 1, 1.5, 2 and 3 bands
  (`settings.bandDensities`); 1.5 is the recommendation (D), so the "b1.5"
  column is quoted unless stated otherwise.

### Closed-form cells (acceptance criterion 3)

From `closedForm[*]`, shipped sampler, with the script's own check computed
afterwards from the fixed-point and 2-cycle formulas:

| Cell | Shipped period | h0 | Deviations | Closed form |
|---|---|---|---|---|
| c = 0 | 1 | 0 | all 0 | h0 = 0, deviation 0 |
| c = -0.5 | 1 | -0.366025418 | all 0 | (1 - sqrt 3) / 2 = -0.3660254 |
| c = -1 | 2 | -0.5 | all 0.5 | cycle {0, -1}, h0 = -0.5, deviation 0.5 |
| c = -0.8 | 2 | -0.5000000149 | all 0.22360681 | h0 = -0.5, sqrt(0.2) / 2 = 0.2236068 |
| c = 1 | escaped (-1) | null | null | no points, no centre |
| c = -2 | 1 | 2 | all 0 | orbit 0, -2, 2, 2, ... lands on the repelling fixed point exactly |

All agree to 1e-4 (`closedForm[*].check.agreesTo1e4`). The c = -2 row is
an exact-arithmetic curiosity: the next shipped column, c = -1.99938, is
chaotic.

## A. Estimating the mean

### A1. Window-mean bias on periodic cells

`meanBias.bulbs[*]` (1/q bulb centres found by Newton on f_c^q(0) = 0,
residual below 1e-15, shipped period confirmed) and `meanBias.realWindows[*]`
(real-axis superstable points of exact period q, by scanning f_c^q(0) sign
changes). `bias` is |mean of the 8 shipped samples - mean over one cycle|;
`worstCaseBiasOverWindowPhase` is the largest value over the q possible
window phases, which the Brent exit decides and the renderer cannot choose.

| Centre | q | Cycle mean | 8-sample mean | Bias | Bias, lap at 1.5 | Worst case, lap at 1.5 |
|---|---|---|---|---|---|---|
| 1/3 bulb, -0.12256 + 0.74486i | 3 | -0.26164 | -0.29435 | 0.032705 | 0.0490575 | 0.0751348 |
| 1/5 bulb, 0.37951 + 0.33493i | 5 | 0.14817 | 0.21667 | 0.068499 | 0.102749 | 0.102749 |
| 1/6 bulb, 0.38901 + 0.21585i | 6 | 0.24533 | 0.29434 | 0.049011 | 0.0735159 | 0.123339 |
| 1/7 bulb, 0.37601 + 0.14475i | 7 | 0.30815 | 0.31663 | 0.008482 | 0.0127231 | 0.0795235 |
| 1/2 and 1/4 bulbs (controls, q divides 8) | 2, 4 | | | 0 | 0 | 0 |
| real period-3 window, -1.754878 | 3 | -0.14339 | -0.16131 | 0.017923 | 0.026885 | 0.302155 |
| real period-5 window, -1.625414 | 5 | -0.49516 | -0.45959 | 0.035575 | 0.0533618 | 0.265284 |
| real period-6 window, -1.476015 | 6 | -0.58028 | -0.53188 | 0.048393 | 0.0725897 | 0.16515 |
| real period-7 window, -1.574889 | 7 | -0.60712 | -0.72809 | 0.120971 | 0.181456 | 0.283596 |
| real period-7 window, -1.999096 (largest) | 7 | 1.03012 | 0.65147 | 0.378652 | 0.567978 | 0.567978 |

The bias scales with the cycle's height span: the satellite bulbs' cycles
span about 0.33 either side of their mean (`cycleSpanHalf`), the real-axis
windows near the tip span almost 2. A plot-window mean is therefore wrong by
up to a tenth of a lap on the bulbs and over half a lap on the antenna
windows, and it changes with the window phase from cell to cell. The cycle
mean over exactly q iterates is exact and the detection window already holds
at least two cycles for every q up to 32, so it costs no iterations.

### A2. Running-mean error on cells with no detected period

`runningMeanError`. Error is |mean over N - mean over 10^6|; max and RMS over
the cell set, lap fractions at 1.5 bands.

**Real axis** (`runningMeanError.realAxis`): the 439 shipped columns with
Re(c) <= -1.4012 and shipped period 0 (Re from -1.99938 to -1.40161). All
439 stay bounded through the reference; 437 are chaotic and 2 carry a
reference period between 33 and 2048 (`classification`).

| N | Max error | RMS error | Median | Max, lap | RMS, lap |
|---|---|---|---|---|---|
| 8 (shipped) | 0.790661 | 0.179612 | 0.0747 | 1.18599 | 0.269418 |
| 64 | 0.235682 | 0.0532937 | 0.0216 | 0.353523 | 0.0799405 |
| 256 | 0.1631 | 0.0275134 | 0.0087 | 0.244651 | 0.0412702 |
| 1024 | 0.0763358 | 0.0134868 | 0.0046 | 0.114504 | 0.0202302 |
| 4096 | 0.0442265 | 0.00733933 | 0.0022 | 0.0663398 | 0.011009 |

(`realAxis.unresolved.float64Windows[*]`; the 437-cell chaotic subset in
`realAxis.chaotic` differs in the fourth digit.) The error falls roughly as
1/sqrt(N) from N = 64 on; N = 8 is worse than that because the window is
shorter than the orbit's correlation time. The orbits themselves are wide:
reference RMS deviation median 0.927, max 1.470, maximum deviation median
1.69, max 2.27 (`realAxis.unresolved.referenceRmsDeviation`,
`.referenceMaxDeviation`).

**Off axis** (`runningMeanError.offAxis`): every shipped-grid cell with
|Im(c)| >= 0.01 that is bounded with no detected period, 14,864 cells
(`candidates`). 1,534 escape later in the reference, 13,330 stay bounded
(unresolved); of those 11,472 have a reference period of 32 or below (slow
convergence the 1500-iterate warmup did not finish), 1,808 a period between
33 and 2048 (beyond the sampler's cap), and 50 no period up to 2048
(`classification`). |Im(c)| runs from 0.0112 to 0.926. The card asked for
at least 200 chaotic cells off the axis; at the shipped pitch only 50 exist
by this definition, so both populations are reported in full.

| N | Unresolved (13,330): max | RMS | Chaotic (50): max | RMS | Chaotic RMS, lap |
|---|---|---|---|---|---|
| 8 (shipped) | 0.139923 | 0.0188549 | 0.0930827 | 0.0308718 | 0.0463077 |
| 64 | 0.0257812 | 0.0021396 | 0.00542038 | 0.0024701 | 0.00370514 |
| 256 | 0.00643958 | 0.000490692 | 0.00388189 | 0.001121 | 0.0016815 |
| 1024 | 0.00164891 | 0.000133564 | 0.00050264 | 0.000234751 | 0.000352126 |
| 4096 | 0.000401207 | 0.0000283276 | 0.000101103 | 0.0000390845 | 0.0000586267 |

(`offAxis.unresolved.float64Windows[*]`, `offAxis.chaotic.float64Windows[*]`.)
Off-axis attractors are small (unresolved RMS deviation median 0.007, 90th
percentile 0.60; chaotic median 0.106), so even the shipped window is within
0.14 of the reference and N = 64 is within 0.03. The real axis is the hard
case and sets N.

The 8-sample window also misreads the spread: on the real-axis chaotic set
the shipped maximum deviation sits a median 0.123 below the reference's
(`realAxis.unresolved.shippedMaxDevMinusReference.median` = -0.12348), while
the shipped RMS deviation is unbiased (median +0.0005) with RMS error 0.142.
This matters for the ground (E).

## B. Is the centre smooth where it needs to be?

`smoothness`. Jumps are |h0(column x+1) - h0(column x)| between adjacent
shipped columns at pitch 0.0012351.

### Chaotic band, pairs where both columns have shipped period 0 (424 pairs)

`smoothness.chaoticBand.jumpsBetweenChaoticNeighbours.<series>`, lap
fractions from `lapFractionMedian` / `lapFractionRms` / `lapFractionMax`:

| Centre | Median jump | RMS | p90 | p99 | Max | Median, lap 1.5 | RMS, lap 1.5 | Median, lap 1.0 | Median, lap 2.0 |
|---|---|---|---|---|---|---|---|---|---|
| shipped 8-sample mean | 0.1001 | 0.2539 | 0.4298 | 0.8646 | 1.0897 | 0.150178 | 0.38086 | 0.100118 | 0.200237 |
| 64-iterate mean | 0.0320 | 0.0720 | 0.1207 | 0.2271 | 0.3304 | 0.0480285 | 0.107932 | 0.032019 | 0.0640379 |
| 256-iterate mean | 0.0159 | 0.0468 | 0.0718 | 0.1582 | 0.3855 | 0.0239055 | 0.0702701 | 0.015937 | 0.031874 |
| 1024-iterate mean | 0.00769 | 0.0314 | 0.0343 | 0.0825 | 0.4544 | 0.0115299 | 0.0471658 | 0.00768663 | 0.0153733 |
| 4096-iterate mean | 0.00535 | 0.0293 | 0.0250 | 0.0695 | 0.4806 | 0.00801989 | 0.0440159 | 0.00534659 | 0.0106932 |
| reference 10^6 mean | 0.00446 | 0.0271 | 0.0188 | 0.0555 | 0.4668 | 0.00669719 | 0.0406093 | 0.00446479 | 0.00892959 |
| Re(z*) (comparator) | 0.000443 | 0.000444 | 0.000472 | 0.00048 | 0.00048 | 0.000663889 | 0.000665326 | 0.000442593 | 0.000885186 |
| per-bulb constant (comparator) | undefined in chaos | | | | | | | | |

**Verdict on the shipped estimator.** With the plot-window mean the strata
in the chaotic curtain are incoherent: the centre moves by a median 0.15
lap and a 90th-percentile 0.64 lap between neighbouring columns, and one
column pair in a hundred moves by more than a full lap. Level sets of
|Re(z) - h0| cannot line up under that. This is stated plainly as the card
asks: the mean *as the renderer could compute it today* fails.

**Verdict on the mean itself.** The exact mean is coherent: median 0.0067
lap, 90th percentile 0.028 lap. It is not smooth everywhere. Sixteen of the
424 pairs move by more than 5% of a lap, four by more than 10%, one by more
than 25% (`smoothness.referenceSeamsInChaoticBand`): the largest is 0.4668
(0.70 lap) between -1.9438 and -1.94257, then, in height units, 0.130 at
-1.8635, 0.110 at -1.7499 (the period-3 window's crisis edge) and 0.077 at
-1.7907; the 5% threshold is 0.0333 height units at 1.5 bands. These are
the attractor's own band-merging and crisis points, where the invariant
measure genuinely jumps, and no estimator removes them. They will read as
isolated vertical seams in the curtain.

**What to use instead.** No substitution of the centre is needed; the
estimator changes. A 1024-iterate mean gets to a median 0.0115 lap and RMS
0.047 lap, within a factor of two of the exact mean on every statistic;
4096 reaches 0.0080 / 0.044. 1024 is the recommendation (cost in the
decisions section); 4096 is the alternative if the sampler budget allows.

### Comparators on the same cells

`smoothness.comparatorAgreement.<region>`, |comparator - reference mean|:

| Region (real-axis cells) | Re(z*) median | Re(z*) max | Per-bulb constant median | Per-bulb max | Per-bulb defined |
|---|---|---|---|---|---|
| period 1 (806) | 1.6e-11 | 1.6e-11 | 0.2487 | 0.4973 | 806 |
| period 2 (407) | 0.1165 | 0.2236 | 0 | 0.0021 | 407 |
| period 3 to 32 (170) | 0.2437 | 1.3034 | 0.0041 | 0.0204 | 149 |
| chaotic band (439) | 0.3532 | 1.3038 | undefined | undefined | 0 |

- **Re(z*)** equals the mean exactly over the cardioid (it is the attractor
  there) and is the smoothest field on the axis (max jump 0.0217, near the
  cusp where the square root is steep; `wholeRealAxis...fixedPointRe`). It
  departs from the mean by 0.12 to 0.22 across the period-2 bulb, by a
  median 0.35 and up to 1.30 in chaos, where it tracks the repelling fixed
  point rather than the orbit. Used as the centre it would place the bands'
  origin off the orbit's middle through the whole antenna.
- **Per-bulb constant** (cycle mean at the window's superstable centre,
  real axis, windows of period 1 to 8) agrees with the mean to 0.002 inside
  the period-2 bulb and to 0.02 inside the period 3 to 8 windows, but over
  the cardioid it is off by a median 0.25 and up to 0.50, because the fixed
  point drifts from 0 at c = 0 to -0.5 at c = -0.75 while the constant stays
  at 0. It is undefined in chaos. It steps at every window edge
  (`smoothness.perBulbSteps`): 0.5 (0.75 lap) between -0.7458 and -0.7445,
  where the reference mean moves 0.0006; 0.0121 at the 4-to-2 edge; 0.0126
  at 8-to-4; 0.022 at 6-to-3.

### Off the real axis

`runningMeanError.offAxis.neighbourJumpsUnresolved` (shipped-grid pairs
one column over, 7,440 pairs, and one row over, 7,324 pairs, both cells
unresolved): shipped 8-sample mean median 0.00174 / 0.00197 (0.0026 /
0.0030 lap), 90th percentile 0.0161 / 0.0166 (0.024 / 0.025 lap), max
0.139; 1024-iterate mean median 0.00061 / 0.00019 (0.0009 / 0.0003 lap);
reference 0.00062 / 0.00018. These cells are near-periodic, and their
centres are already coherent at the shipped window.
`neighbourJumpsChaotic` has 0 pairs along either axis: at the shipped pitch
every one of the 50 off-axis chaotic cells is isolated, so chaotic strata
off the axis are single cells and coherence does not arise.

## C. Bifurcations

`bifurcations[*].rows`, offsets in a geometric sequence 1e-5 to 1e-1 either
side. `shippedScalarMax` is the shipped max |Re(z) - h0| with h0 the exact
cycle mean where a period q <= 8 is detected (what the implementation would
compute) and the window mean otherwise; `referenceMaxDev` is the converged
value; `residual` their difference. Window-mean figures are alongside as
`shippedWindowMaxDev` and `residualWindowMean`.

### Period 1 to 2 at c = -0.75 (`bifurcations[0]`)

| Offset | Shipped period | Shipped scalar max | Reference max | Residual | Residual, lap 1.5 |
|---|---|---|---|---|---|
| -0.1 | 2 | 0.316228 | 0.316228 | 1.3e-8 | 0 |
| -0.01 | 2 | 0.100000 | 0.1 | 8.9e-9 | 0 |
| -0.001 | 2 | 0.032415 | 0.031623 | 0.000792 | 0.00119 |
| -0.0003 | 2 | 0.022419 | 0.017321 | 0.005098 | 0.00765 |
| -0.0001 | 2 | 0.019564 | 0.01 | 0.009564 | 0.01435 |
| -0.00001 | 2 | 0.018311 | 0.003162 | 0.015148 | 0.02272 |
| +0.00001 | 2 | 0.018036 | 1.4e-7 | 0.018036 | 0.02705 |
| +0.0001 | 2 | 0.016817 | 3.0e-13 | 0.016817 | 0.02523 |
| +0.001 | 2 | 0.007137 | 1.7e-14 | 0.007137 | 0.01070 |
| +0.003 | 2 | 0.000583 | 7.0e-15 | 0.000583 | 0.00087 |
| +0.01 | 1 | 6.0e-8 | 2.0e-15 | 6.0e-8 | 0 |
| +0.1 | 1 | 0 | 5.0e-16 | 0 | 0 |

The reference spread goes to zero from both sides (sqrt(-4c - 3) / 2 on the
period-2 side: 0.0316 at -0.001, 0.01 at -0.0001, 0.00316 at -0.00001; zero
on the period-1 side), so the scalar is continuous. The shipped warmup's
residual exceeds 1% of a lap at 1.5 bands for offsets -0.0001 and inward on
the period-2 side and +0.001 and inward on the period-1 side
(`offsetsWhereResidualExceeds1pctLap["b1.5"]`). On the stable side the
sampler reports period 2 out to +0.003 because the slowly decaying
alternation passes the lag-2 test; the reported spread there is below
0.007, so the reading is harmless.

### Period 2 to 4 at c = -1.25 (`bifurcations[1]`)

Reference max deviation from the period-2 side: 0.70640 at +0.001,
0.70704 at +0.0001, 0.70710 at +0.00001; from the period-4 side: 0.73338
at -0.001, 0.71538 at -0.0001, 0.70972 at -0.00001. Both approach
sqrt(2) / 2 = 0.70711, so the outermost branch's distance is continuous
through the doubling. Residuals: 0.00124 at +0.001 (0.0019 lap), 0.00895
at +0.0001 (0.0134 lap), 0.0103 at +0.00001 (0.0155 lap); 0.0000272 at
-0.001, 0.0039 at -0.0001 (0.0058 lap), 0.0080 at -0.00001 (0.0121 lap).
Above 1% of a lap at 1.5 bands: offsets -0.00001, +0.00001, +0.00003,
+0.0001 only.

### Period 1 to 3 at the root of the 1/3 bulb (`bifurcations[2]`)

Root -0.125 + 0.649519i (cardioid at angle 2pi/3), offsets along the unit
direction (0.025571, 0.999673) from the root towards the bulb's centre
-0.122561 + 0.744862i; negative offsets lie in the cardioid.

| Offset | Shipped period | Shipped scalar max (cycle mean) | Shipped (window mean) | Reference max | Residual | Residual, lap 1.5 |
|---|---|---|---|---|---|---|
| -0.1 | 1 | 0 | 0 | 3.1e-16 | 0 | 0 |
| -0.01 | 1 | 0 | 0 | 1.8e-15 | 0 | 0 |
| -0.003 | 3 | 0.000686 | 0.000639 | 5.6e-15 | 0.000686 | 0.00103 |
| -0.001 | 3 | 0.015841 | 0.014889 | 2.1e-14 | 0.015841 | 0.02376 |
| -0.0001 | 3 | 0.047564 | 0.044770 | 2.4e-13 | 0.047564 | 0.07135 |
| -0.00001 | 3 | 0.051628 | 0.048594 | 1.8e-7 | 0.051628 | 0.07744 |
| +0.00001 | 3 | 0.052533 | 0.049445 | 0.019238 | 0.033295 | 0.04994 |
| +0.0001 | 3 | 0.056594 | 0.053264 | 0.041369 | 0.015226 | 0.02284 |
| +0.0003 | 3 | 0.065364 | 0.061500 | 0.059571 | 0.005793 | 0.00869 |
| +0.001 | 3 | 0.090329 | 0.084875 | 0.088764 | 0.001565 | 0.00235 |
| +0.01 | 3 | 0.192567 | 0.179666 | 0.189558 | 0.003009 | 0.00451 |
| +0.03 | 3 | 0.275693 | 0.310155 | 0.271386 | 0.004308 | 0.00646 |
| +0.1 | 3 | 0.406857 | 0.373465 | 0.400500 | 0.006357 | 0.00954 |

Continuous: the reference spread rises from 0 at the root like a square
root (0.019 at +0.00001, 0.089 at +0.001, 0.40 at +0.1) and is identically
0 inside the cardioid. The shipped residual exceeds 1% of a lap at 1.5 bands
from -0.001 inward on the cardioid side, where the slowly converging orbit
still shows a 3-cycle of spread up to 0.052, and from +0.0001 inward on the
bulb side. Deeper in the bulb the window-mean column shows the A1 bias
(0.039 at +0.03, 0.027 at +0.1, `residualWindowMean`) that the cycle mean
removes (0.0043, 0.0064).

Across all three bifurcations the residual is under 1% of a lap at 1.5
bands once the offset exceeds 0.001, and the shipped sampler's period
reading on the stable side is harmless because it comes with a small
spread, not a wrong centre.

## D. Range and band density

`regions` (shipped grid at stride 2 including the pinned axis row: 922,185
cells, 690,153 escaped, 232,032 bounded). Deviations are per plotted point
and per cell, quantiles from 0.001-wide bins reported as the bin's lower
edge.

| Region | Cells | Share of bounded | Point deviation p50 / p90 / p99 / max | Cell max deviation p50 / p90 / p99 / max | Cell RMS deviation p50 / p90 / p99 / max |
|---|---|---|---|---|---|
| period 1 | 178,318 | 76.85% | 0 / 0 / 0 / 0.000129 | 0 / 0 / 0 / 0.000129 | 0 / 0 / 0 / 0.000091 |
| period 2 | 29,802 | 12.84% | 0.516 / 0.653 / 0.694 / 0.7046 | same as point | 0.516 / 0.653 / 0.694 / 0.7045 |
| periods 3 to 32 | 19,989 | 8.61% | 0.270 / 0.621 / 0.958 / 2.121 | 0.437 / 0.845 / 1.019 / 2.121 | 0.282 / 0.701 / 0.753 / 1.362 |
| no detected period | 3,923 | 1.69% | 0.118 / 0.645 / 1.393 / 2.447 | 0.291 / 0.785 / 1.83 / 2.447 | 0.200 / 0.685 / 1.219 / 1.484 |

(`regions.regions.<region>.pointDeviation`, `.cellMaxDeviation`,
`.cellRmsDeviation`.) The period-2 pair is symmetric about h0 = -0.5 (the
cycle satisfies z1 + z2 = -1), so each point's deviation is half the
branch separation and the two branches always share a colour; it runs from
0 at the cardioid root to 0.7046 at the period-4 doubling. A real-axis
chaotic column spans a reference maximum deviation of median 1.69, 90th
percentile 2.09, max 2.27 (`runningMeanError.realAxis.unresolved.referenceMaxDeviation`);
the 8 plotted points of a column reach a median 0.29 and 99th percentile
1.83, because 8 samples rarely include the extremes.

**Meaning of `cycleBands`.** Palette laps per unit of height deviation: a
point at |Re(z) - h0| = d reads the palette at `fract(bands * d - phase)`.
No clamp; d runs to 2.45.

**Band density.** At the candidate values the two period-2 branches span,
across the bulb from -0.75 to -1.25, 0.7046 x bands laps, and a median
chaotic column spans 1.69 x bands laps:

| bands | Period-2 branches, laps | Median chaotic column, laps | Max chaotic column, laps | 1024-mean noise, RMS lap (A2) | Chaotic-band median jump, lap (B) |
|---|---|---|---|---|---|
| 1.0 | 0.70 | 1.69 | 2.27 | 0.0135 | 0.0077 |
| 1.5 | 1.06 | 2.54 | 3.40 | 0.0202 | 0.0115 |
| 2.0 | 1.41 | 3.38 | 4.53 | 0.0270 | 0.0154 |
| 3.0 | 2.11 | 5.07 | 6.80 | 0.0405 | 0.0231 |

Recommendation: 1.5, the current default. The period-2 pair then completes
exactly one lap over its bulb, so the colour at the period-4 doubling returns
to the cardioid's colour and the bulb reads as one complete band cycle; a
chaotic column carries two and a half laps, enough for the strata to read
as strata; and the centre noise stays at 2% of a lap. At 1.0 the period-2
bulb never completes a lap, at 2.0 and above the chaotic column's seams and
noise double and the bulb shows a lap and a half with a wrap in the middle.

**Consequence for period 1.** Every period-1 point is at distance zero, so
the whole cardioid sheet (76.9% of bounded cells) reads the palette at
`fract(-phase)`: a single colour, the same at every c, changing with phase.
The ground under it is the same colour (E). The period-2 branches leave that
colour at the root and return to it at the doubling.

## E. Ground plane

`ground.*`, per-cell candidates from the shipped 8 samples and from a
4096-iterate window: maximum deviation in the column and RMS deviation about
h0.

| Candidate | Period 1 | Period 2 | Periods 3 to 32 (p50 / p99 / max) | No period (p50 / p99 / max) |
|---|---|---|---|---|
| max deviation | 0 | 0 to 0.7046, equal to the points' | 0.437 / 1.019 / 2.121 | 0.291 / 1.83 / 2.447 |
| RMS deviation | 0 | 0 to 0.7045, equal to the points' | 0.282 / 0.753 / 1.362 | 0.200 / 1.219 / 1.484 |

Both are zero under the cardioid, so the ground there is one flat colour,
the same as the sheet above it. Both equal the points' own scalar under the
period-2 bulb, so ground and sheets agree there too.

**Smoothness** (`ground.<transect>.neighbourJumps`, steps of 0.0025):

| Transect | shipped max dev: RMS jump / p99 | shipped RMS dev: RMS / p99 | 4096 max dev: RMS / p99 | 4096 RMS dev: RMS / p99 |
|---|---|---|---|---|
| real axis -2 to 0.25 (900 points) | 0.1099 / 0.497 | 0.0834 / 0.361 | 0.0191 / 0.0889 | 0.0164 / 0.0920 |
| Re(c) = -1, Im 0 to 0.4 (115 bounded) | 0.0108 / 0.0333 | 0.00088 / 0.0029 | 0.0115 / 0.0471 | 0.00080 / 0.0025 |
| Re(c) = -0.1, Im 0 to 0.75 (299 bounded) | 0.0129 / 0.0445 | 0.0080 / 0.0187 | 0.0105 / 0.0070 | 0.0045 / 0.0038 |

**At the set boundary.** Along Re(c) = -1 the ground is bounded up to
Im = 0.28625 and escaped from 0.28875 (`ground.period2BulbUpward.firstEscapedT`);
the last bounded cell holds max 0.744 / RMS 0.568 (4096: 0.838 / 0.573), so
the scalar is finite and non-zero right up to the edge and then undefined.
The ground must keep the escape-time texture on escaped texels, as stage 98
does, and the interior field ends with a step there whatever scalar is
chosen. Along Re(c) = -0.1 the cardioid's zero runs to Im = 0.60125, the
gap to the 1/3 bulb is escaped from 0.65125, and the bulb from 0.70125
carries max 0.296 / RMS 0.229. At the real-axis tip the chaotic column's
max tends to 2 and RMS to about 1.4 (the arcsine density on [-2, 2]).

**Recommendation: RMS deviation.** On the period-2 bulb's upward transect it
is ten times smoother than the maximum (p99 jump 0.0029 against 0.0333),
because the maximum flips whenever the 8-sample window catches an outer
period-8 or period-16 point near the bulb's edge; along the real axis it is
25% smoother; and on the chaotic band the 8-sample maximum is biased low by
a median 0.12 (A2) where the RMS is unbiased. Its range is also narrower
(max 1.48 against 2.45), so the ground never needs more laps than the cloud.
Both candidates come from the same running sums as h0, so the choice costs
nothing. With a 1024-iterate window for unresolved cells both are smooth
enough; the RMS still wins on bias and range.

## F. Escaped and clipped cells

`regions` over 922,185 cells (232,032 bounded, 1,856,256 bounded samples) and `closedForm`.

- **Escaped cells**: `sampleAttractorCell` returns -1 and zero-fills the
  window (`closedForm[4].samples` is eight zeros). There are no points and
  no centre. The mean of a zero-filled window is 0, a plausible height, so
  the implementation must gate on the escaped flag and never on h0; the GPU
  metadata carries that flag in channel z (`orbitSampler.ts` line 608).
- **Clipping at |Re(z)| = 2**: a bounded orbit has |Re(z)| <= |z| <= 2, so
  the clamp can only ever be the identity. Measured: 0 samples beyond the
  clip and 0 samples exactly at it on the stride-2 grid
  (`regions.samplesBeyondClip`, `regions.samplesAtClip`). The one parameter
  whose orbit sits at the clip value is c = -2 itself (orbit 0, -2, 2, 2,
  ...), period 1, h0 = 2, deviation 0; it is not a shipped cell centre and
  its neighbour at -1.99938 is chaotic. Clipping needs no treatment.
- **Centre defined**: every bounded cell has eight finite samples, so h0 is
  finite for all 232,032 bounded cells (`regions.boundedCellsWithoutFiniteCentre`
  = 0, `regions.nonFiniteSamples` = 0). 172,870 bounded cells have zero
  spread (`regions.boundedCellsWithZeroSpread`), the period-1 cells.
- **Slow convergence** (C): the shipped reading on the stable side of a
  bifurcation is a tiny spread with the right centre, not a wrong centre;
  no special case.
- **Periodless off-axis cells** are 86% slowly converging cycles of period
  32 or below and 13.6% cycles of period 33 to 2048 (A2); their 1024-iterate
  mean is within 0.0016 of the reference, so the same estimator serves them.

## G. What stage 98 leaves behind

By test title. "Contradicted" means the assertion encodes behaviour this
colouring reverses; "holds" means the assertion is still true of the new
scalar by reasoning from the formula.

`src/app/orbitColour.test.cjs`:

- "inside-out coordinate is fract(bands * m - phase)": the arithmetic holds
  for any scalar in the first argument, but the name and intent (m is the
  multiplier) are contradicted; keep only if the function is re-documented
  as taking the deviation.
- "inside-out coordinate closes the cyclic loop at phase 1 and clamps m":
  the loop closure holds; the clamp to [0, 1] is contradicted, the deviation
  runs to 2.45 and must not be clamped.
- "forward phase moves a fixed colour towards larger m": holds with m read
  as the deviation, and is now the operator's stated intent (bands travel
  outwards from h0).
- "classification follows the period, not the multiplier value": the
  function's return values hold, but its purpose (routing unresolved cells
  to a steady neutral) is contradicted; unresolved cells are the chaotic
  band and must be coloured.
- "the GLSL twin evaluates the same expression": contradicted, the regex
  pins `clamp(multiplier, 0.0, 1.0)`.

`e2e/inside-out-cycling.spec.ts`:

- "CPU and GPU production sampling recover the analytic cycle multipliers":
  holds; the multiplier is still computed and nothing here removes it.
- "the ground attraction field classifies and measures at its texel
  centres": contradicted in part; the field's measured channel becomes the
  ground scalar (RMS deviation) and a centre, not the multiplier, and the
  unresolved classification no longer selects a neutral.
- "point and sheet palette colour ignores height and follows the
  multiplier": contradicted outright.
- "two sheets over a period-2 point share hue in the real route": holds,
  and is now exact rather than incidental, since both sheets sit at the
  same absolute distance from h0 = -0.5.
- "point, sheet and ground palette lookups follow fract(bands*m - phase) in
  both directions": contradicted; the scalar changes and the ground's
  scalar (RMS) differs from the points'.
- "the shared phase reverses sign once and pins at speed zero": holds.
- "exterior ground keeps escape-time colouring": the escaped-texel
  assertions hold; its third probe, an unresolved texel taking the neutral
  grey, is contradicted.
- "selecting Inside-out through the controls animates without rebuilding
  the cloud or the field": holds in intent; if the mean window becomes a
  parameter it must join the field's cache key.
- "warm-cache render timing and field build time against the unchanged
  baseline": holds as a gate; the field build gains the extra iterations
  of the mean window.
- "cloud: forward and reverse sequences over the ground and the period-2
  bulb move in opposite directions" and "hybrid: ..." : hold; direction
  follows the phase sign only.

`e2e/inside-out-cycling.contract.spec.ts` (frozen, not run): at speed 0.1
the phase advances 0.25 lap between the two frames 2.5 s apart, and every
bounded point's coordinate shifts by the same 0.25 lap, including the
cardioid sheet (one colour to a different one) and the ground, so the
motion metric stays above 1 as it did for the multiplier. At speed 0 the
phase is constant and the scalar is static, so motion stays below 0.1. The
lit-fraction assertions hold because no bounded cell is drawn neutral. Both
assertions remain true under the new scalar.

## GPU metadata channel (evidence for decision 2)

The period shader in `src/app/orbitSampler.ts` writes one RGBA32F texel per
cell and the readback consumes three of its four channels. Facts read from
the source on 2026-10-02:

| Fact | Value | Where in `src/app/orbitSampler.ts` |
|---|---|---|
| Metadata target allocation | `createTexture2D(gl, width, height, null)`, which calls `texImage2D` with internal format `gl.RGBA32F`, format `gl.RGBA`, type `gl.FLOAT` | line 455 (allocation), lines 1057-1065 (format) |
| Shader output declaration | `layout(location = 0) out vec4 outMetadata` | line 185 |
| Shader output, bounded cell | `outMetadata = vec4(float(period), interior, 0.0, 0.0)`: x period, y interior, z 0, w 0 | line 279 |
| Shader output, escaped or out-of-range cell | `outMetadata = vec4(0.0, 1.0, 1.0, 0.0)`: z is the escape flag, w 0 | line 219 |
| Readback | `readPixels(..., gl.RGBA, gl.FLOAT, metadata)` into a `Float32Array` of 4 per cell | lines 589, 600 |
| Channels consumed | x to `periods`, y to `interiors`, z `> 0.5` to `escaped`; w is never read | lines 606-608 |
| Free channel for h0 | w, written 0.0 on both shader paths and ignored by the readback | lines 219, 279, 606-608 |

Float32 precision cost of carrying h0 in channel w, derived from the format
above (IEEE binary32 has a 24-bit significand; one lap is 1.5 height units
at the recommended density):

| Quantity | Height units | Lap at 1.5 bands | Derivation |
|---|---|---|---|
| Storage quantisation of h0, \|h0\| <= 2 | 2.38e-7 | 3.58e-7 | float32 spacing just above 2 is 2^-22 |
| Worst-case rounding of a float32 running sum over 1024 iterates, \|Re(z)\| <= 2 | 1.22e-4 | 1.83e-4 | partial sums stay below 2048, whose half-spacing is 2^-13 = 1.22e-4; 1024 adds give at most 0.125 on the sum, 1.22e-4 after dividing by 1024 |
| Estimator noise it must be compared with | 0.0135 RMS, 0.0763 max | 0.0202 RMS, 0.1145 max | `runningMeanError.realAxis.unresolved.float64Windows[3]` |

Both float32 costs are at least two orders of magnitude below the estimator
noise, so the channel's precision is not the limiting factor. The ground's
RMS scalar would need a fourth value and the texel has none left once w
carries h0; the escape flag in z is a boolean, so it can share the period
channel as a negative sentinel, or the sampler can add a second render
target. The renderer's ground field texture is RG32F
(`src/app/webglRenderer.ts` lines 1201, 1944, 2937) and would need a third
channel for the same reason.

## Previews

Written by `--previews e2e/artifacts/orbit-spread` (git-ignored). Raw
`magma-cyclic` ramp stops with the renderer's smoothstep between stops, no
gamma, contrast or tone map (`previews`).

- `real-axis-phase-0.00.png`, `-0.25.png`, `-0.50.png`, `-0.75.png`: 1800
  columns from Re(c) = -2 to 0.25 (pitch 0.00125, the shipped pitch is
  0.001235), Re(z) from -2 to 2 upwards, the 8 shipped samples per column
  as 2 x 2 dots, centre = exact cycle mean where a period is detected,
  else the 1024-iterate mean, bands 1.5.
- `real-axis-centre-comparison.png`: the same view at phase 0 for four
  centres stacked and labelled: A the shipped 8-sample mean, B the
  recommended estimator, C Re(z*), D the per-window constant with
  undefined columns in grey.
- `off-axis-slice.png`: the line through the 1/3 bulb's root
  (-0.125, 0.649519) and centre, from (-0.131393, 0.399601) inside the
  cardioid to (-0.116050, 0.999405) outside the set
  (`previews.offAxisSlice.start`, `.end`), Re(z) from -1.5 to 1.5. Along it
  the shipped period runs 1 up to t = -0.004, 3 to t = 0.188, then 6, a
  one-cell escape, 6 and 12 to t = 0.232, escaped beyond
  (`previews.offAxisSlice.periodRuns`).

What the pixels show, sampled by the script's own decoder: in the phase 0
frame the period-1 columns at Re(c) = -0.6, -0.25 and 0 are all RGB
(40, 16, 60), the palette's origin, and in the phase 0.5 frame all three
are (245, 136, 97); at Re(c) = -1.125 the upper and lower period-2 branches
are both (93, 39, 80) at phase 0 and both (207, 82, 107) at phase 0.5; at
Re(c) = -1 both branches are (200, 116, 131) at phase 0 and (132, 38, 122)
at phase 0.5. In the comparison image panel A's chaotic region is speckled
column by column where panel B shows contiguous strata, panel C colours
the period-2 branches differently from each other (Re(z*) is not their
midpoint), and panel D's cardioid sweeps through the palette with Re(c)
while the recommended centre holds it at one colour. The judgement is the
operator's.

## Decisions for the implementation card

1. **Centre estimator.** Cells with a detected period q: the exact mean of
   one cycle of q iterates taken from the detection window (zero bias,
   where the plot-window mean is off by up to 0.103 lap on the bulbs,
   `meanBias.bulbs[*].biasLapFraction["b1.5"]` max 0.102749 at the 1/5
   bulb, and 0.568 lap on the real windows,
   `meanBias.realWindows[*].biasLapFraction["b1.5"]` max 0.567978). Cells with
   no detected period: the running mean of 1024 iterates after the warmup
   (RMS error 0.0202 lap, `runningMeanError.realAxis.unresolved.float64Windows[3]`;
   median column jump 0.0115 lap,
   `smoothness.chaoticBand.jumpsBetweenChaoticNeighbours.float64Window1024.lapFractionMedian["b1.5"]`).
   Cost 3.98 extra iterations per cell, +4.4% of the sampler's iterations,
   worst cell 2588 (`cost.extraForUnresolvedWindow["1024"]`); 4096 would be
   +17.6% for RMS 0.011 lap.
2. **GPU sampler channel.** Yes: the period shader's metadata target is an
   RGBA32F texture whose channel w is written 0.0 on both shader paths and
   never read back, while z carries the escape flag (table "GPU metadata
   channel", first block). h0 fits in w at float32 precision: storage
   quantisation 2.38e-7 height units (3.58e-7 lap) and a float32 running
   sum over 1024 iterates at most 1.22e-4 (1.83e-4 lap), both at least two
   orders of magnitude below the estimator's 0.0135 RMS error (same
   section, second block). The ground's RMS scalar has no free channel:
   either move the escape flag into the period channel as a negative
   sentinel or add a second render target, and the RG32F ground field
   texture needs a third channel for the same reason (same section).
3. **Band density.** `cycleBands` means palette laps per unit of
   |Re(z) - h0|, no clamp, default 1.5: period-2 branches 1.06 laps across
   the bulb (`regions.regions.period2.pointDeviation.max` 0.7046 x 1.5),
   median chaotic column 2.54 laps
   (`runningMeanError.realAxis.unresolved.referenceMaxDeviation.median` 1.69 x 1.5).
4. **Ground scalar.** RMS deviation of the column about h0 from the same
   window as h0 (p99 jump 0.0029 against the maximum's 0.0333 on
   `ground.period2BulbUpward.neighbourJumps`; unbiased where the 8-sample
   maximum is low by a median 0.12,
   `runningMeanError.realAxis.unresolved.shippedMaxDevMinusReference.median`).
5. **Escaped, clipped, slow-converging.** Escaped: gate on the escape flag,
   never on h0 (the sampler returns a zero-filled window for an escaped
   cell, `closedForm[4].samples`, whose naive mean would be 0; the script
   reports `closedForm[4].h0` as null only because it gates on
   `closedForm[4].escaped`).
   Clipped: none for bounded orbits (`regions.samplesAtClip` 0,
   `regions.samplesBeyondClip` 0). Slow-converging: no treatment; the
   residual is below 1% of a lap beyond 0.001 from every bifurcation
   (`bifurcations[*].offsetsWhereResidualExceeds1pctLap["b1.5"]`).
6. **Stage 98 tests to retire or rewrite** (G): in `orbitColour.test.cjs`
   the clamp assertions of "closes the cyclic loop at phase 1 and clamps
   m" and the whole of "the GLSL twin evaluates the same expression"; in
   `inside-out-cycling.spec.ts` "point and sheet palette colour ignores
   height and follows the multiplier", "point, sheet and ground palette
   lookups follow fract(bands*m - phase) in both directions", the
   multiplier and neutral assertions of "the ground attraction field
   classifies and measures at its texel centres", and the unresolved-neutral
   probe inside "exterior ground keeps escape-time colouring". The frozen
   contract stays true.
7. **Open risks.** (a) The exact mean has 16 seams above 5% of a lap and
   one of 0.70 lap in 424 chaotic-band column pairs
   (`smoothness.referenceSeamsInChaoticBand`); they are the attractor's
   own crises and will show as vertical lines. (b) CPU and GPU h0 for
   unresolved cells agree only to the estimator noise, not to float
   precision, so an analytic-multiplier-style equality test cannot be
   written for them; test periodic cells exactly. For unresolved cells the
   1024-iterate mean's worst error against the 10^6 reference is 0.0763
   height units, 0.1145 lap at 1.5 bands
   (`runningMeanError.realAxis.unresolved.float64Windows[3].maxError`
   0.0763358 x 1.5), so a test of either path against a long reference
   needs a tolerance of 0.08 height units (0.12 lap at 1.5 bands). A
   CPU-against-GPU test compares two independent estimates that may err
   in opposite directions, so its bound is twice that, 0.153 height units
   (0.229 lap); use 0.16 height units (0.24 lap at 1.5 bands). Both
   tolerances are stated in height units and scale with the band density
   if it changes. (c) Off the real axis chaotic cells are isolated at the
   shipped pitch (`runningMeanError.offAxis.neighbourJumpsChaotic` 0
   pairs), so the chaotic strata the operator wants exist only on the
   antenna. (d) The cardioid, 77% of bounded cells, becomes one flat colour
   cycling with phase; whether that reads as intended is a visual call.
   (e) The verifier's reproduction of criterion 4 must follow
   `settings.estimatorConvention` (1500 discarded iterates, then the next
   N), or the N = 64 figures will not match to two significant figures.
