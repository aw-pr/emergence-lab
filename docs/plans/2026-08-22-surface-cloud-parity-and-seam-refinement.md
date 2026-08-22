# Surface cloud parity and seam refinement

## Result

Hybrid mode now sources its point field from the same live GPU cloud builder,
sampling plan and boundary-detail budget as cloud mode. It then masks points in
coarse cells covered by classified sheets and reuses those hidden slots for the
stage-54 sheet-edge band and the deterministic 3 by 3 fallback lattice. Cloud
mode still follows the same build plan and upload path as before.

Period-transition seams are no longer darkened as exposed outer edges. Their
geometry is unchanged, but their fade stays at full intensity, removing the
black sawtooth treatment confirmed by the first verifier pass.

## Cloud-density diagnosis and fix

Attempt 1 proved parity against a small synthetic 3 by 3 resample. That was not
the live reference. At the verifier's matched 1280 by 720 framing, hybrid
contained 1,903,136 points in total, including 749,544 chaotic-cloud points,
while cloud mode contained 13,254,080 points. Chaotic-region lit-pixel share was
about 60 per cent of cloud mode at each measured luminance threshold.

The gap was in the build path. Cloud mode uses the live GPU sampler, a base
point budget selected from the input resolution, and the default boundary-detail
tier up to 16,000,000 points. Hybrid instead built points only from its much
coarser surface grid, so increasing a synthetic sub-cell lattice could not prove
or reliably reach rendered parity.

The final path extracts the cloud sampling-plan calculation into one helper and
uses it for both geometry modes. In hybrid mode the returned GPU cloud is
post-processed without changing its size:

- the exact-classified surface grid masks cloud slots covered by periodic
  sheets;
- hidden periodic slots are filled first with the accepted stage-54 edge-band
  samples, then with the deterministic 3 by 3 fallback samples;
- all remaining chaotic slots retain the live cloud path's positions, orbit
  samples and weights;
- GPU failure retains the attempt-1 sliced fallback rather than failing the
  surface build.

Matched-framing density is therefore tied to the live path, not extrapolated
from fixtures:

| Figure | Attempt 1 | Stage 55 path | Cloud reference |
|---|---:|---:|---:|
| Total points | 1,903,136 | 13,254,080 expected | 13,254,080 measured |
| Point budget | about 2 million submitted | 16,000,000 | 16,000,000 |
| Total-point parity | 0.144x | 1.000x by shared builder | 1.000x |
| Chaotic points | 749,544 | verifier to record | verifier reference region |
| Chaotic lit-pixel share | about 0.60x | verifier to record | 1.000x |

The expected stage-55 point buffers at the measured 13,254,080 points occupy
371,114,240 bytes. Adding the stage-54 mesh estimate of about 12.2 MB gives an
expected peak geometry of about 383.3 MB. The 16,000,000-point hard budget would
cap point buffers at 448 MB before the mesh. No surface indices are added, so
the 430,838 stage-54 triangle figure stays below the 1,199,999 cap.

The worker sandbox cannot perform the matched-camera pixel check. The verifier
must record the actual after values from `orbit3dPoints`,
`orbit3dHybridCloudPoints`, the fractional-rectangle luminance measure and
`orbit3dPeakGeometryBytes`.

## Seam diagnosis and fix

The tears are period-boundary transitions rather than rejected height-jump
faces. Stage 54 treated the exposed chains on either side of a period transition
as outer sheet edges and assigned their vertices the darkest feather level,
0.16. That made the stepped contour read as a black tear through the sheet. A
trial geometry weld worsened established alternation and analytic-error metrics,
confirming that changing contour position was not the safe treatment.

The final change keeps transition positions, heights and triangle topology. It
tracks period-to-period transition vertices separately from chaos transitions,
excludes connected period-transition edges from outer-edge feathering, and holds
their used vertices at fade 1. Chaos-boundary feathering keeps its previous
behaviour.

The harness uses an oblique period-1 to period-2 fixture and defines seam
darkness as `1 - edgeFade` on transition vertices:

| Metric | Stage 54 | Stage 55 |
|---|---:|---:|
| Transition vertices below full intensity | 33 | 0 |
| Maximum seam darkness | 0.84 | 0.00 |

## Verification

- `npm run verify`: pass, 325 tests, both TypeScript checks and production
  build.
- Harness SHA-256 on two runs:
  `3ec04b8993e4f925a50f3ab8530351b209f2e5562ffb799ad4ed4de19f285474`.
- Adaptive chord error and alternation remain 0.482036/0.040000,
  0.500000/0.000000 and 0.480163/0.000000 for the full, bulb and cascade
  windows.
- Coverage remains 0.954545, 0.959839 and 0.854772.
- Stage-54 band point figures remain 144, 888 and 4,712 in the deterministic
  windows.
- The 3 by 3 path remains as the GPU-failure fallback and produces 184, 968
  and 5,904 points against its fixture references of 64, 160 and 1,472.

The stage-54 live baseline was 8.000 ms median slice, 34.100 ms maximum slice,
1,563.5 ms finalisation, 65,449,680 peak geometry bytes and 430,838 triangles.
The CPU surface work remains sliced to the 8 ms discipline. The live GPU cloud
build and buffer upload occur during finalisation, matching cloud mode; the
verifier should record the new median, maximum and finalisation values from the
existing canvas datasets.
