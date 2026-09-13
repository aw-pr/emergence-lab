# CPU fallback refinement default

Stage 94 keeps the descriptor defaults at `tailRefinement: 0` and
`boundaryDetail: 1`. The renderer resolves tail refinement by sampling path:

| Sampling path | Effective tail refinement for a live full cloud |
| --- | --- |
| `gpu-sampled` | Finite numbers clamp to [0, 0.6], including 0 staying off; other values use 0.3. GPU boundary detail is unchanged. |
| `cpu-sampled` | With no sampler, 0 means automatic 0.3; positive finite numbers clamp to [0, 0.6]; other non-finite or non-number values use 0.3. |
| `cpu-sampled-gpu-failed` | The same CPU rule applies after a GPU build returns null or throws, by re-planning with GPU availability false. |
| `prebaked` | Unchanged: baked clouds carry their own sampling and supersede live buffers. |

Real-slice-only builds always resolve to 0. Negative finite values retain
the existing clamp to 0; the panel cannot supply them because its minimum is 0.

Zero means automatic on the CPU path because that fallback has no GPU boundary
tier and therefore no other sharpening. An off setting is not a use case worth
another slider. The operator loses the ability to disable CPU tail refinement
from the panel for a full cloud. Descriptor defaults, ranges and steps stay
unchanged; there is no new control, uniform or shader.

Sampler availability at planning time cannot predict whether the GPU build will
succeed. The renderer therefore reassigns only the nine CPU plan bindings after
the failed GPU attempt and before the first `Float32Array` allocation. A
successful GPU build returns first, with unchanged arguments. A machine with
no sampler needs only the initial plan call. Neither GPU plan fields nor their
budget assignment are recomputed. The existing CPU point-budget assignment is
retained. Both CPU routes resolve the schema default to `refineFraction = 0.3`
and `refineActive = true` for non-real-slice builds.

The existing canvas dataset readouts are `orbit3dSampler`,
`orbit3dRefinedCells` and `orbit3dRefinedShare`. The last is the intended readout
for seeing refinement on a CPU machine, but it is a measured cell share, not
the configured budget fraction. There are pre-existing limitations: the live
cloud fallback labels even a missing sampler `cpu-sampled-gpu-failed`, and
the refined-cell statistics are populated by the hybrid builder, not the live
cloud CPU loop. A zero readout on the latter does not prove refinement is off.
Changing these diagnostics and adding a hybrid fallback re-plan are outside
this card's permitted renderer diff.

The eight unit cases cover the seven named GPU/CPU values and real-slice
suppression across both paths. Verification uses `npm run verify` and the
worktree contract gate; this card introduces no frozen assertion block.
