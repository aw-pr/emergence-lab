# Interestingness sweep batch — 2026-10-30

**Admission checkpoint: 13 reviewed cards; operator approval received and frozen-core preflight complete. No sweep results or preset promotions are claimed.** Dispatch remains operator-paused. Work is on dev at `14029cefb`; the parked zoom arc is excluded entirely. This report is the approval packet; the eventual result summary is a separate deliverable of card 149.

## Live baseline and scope reconciliation

- `AGENTS.md`, `CLAUDE.md`, HANDOFF top/Next session, the overnight report, Gray-Scott report and all four requested harness files were read. Historical claims were checked against source.
- The working tree was clean at entry. In particular the two named guard scripts had no uncommitted diff; this session leaves them untouched.
- `state/budget.json`: pause until 4102444800, with the operator's zoom-parking reason; cap 150,000,000, current-window spend 49,101,461 at inspection. These are live readings, not authority to modify any setting. No queue, budget or pause mutation is authorised yet.
- There are **16 already-configured kernels**, **18 primary sweep configs** when the three Clifford/De Jong/Svensson variants are counted separately, and **19 configs including the extra BZ diffusion line**. Thus “18 already-swept sims” is useful as a variant/config count, not a kernel census. The second pass covers every one, with Lorenz handled in priority card 142 and the extra BZ line accounted for in 143.
- Five genuinely uncovered kernels: burning-ship, elementary-cellular-automata, julia-set, mandelbrot, markus-lyapunov. Lorenz already has 72 candidates and five-snapshot scoring; its dedicated report is missing. `src/sims/fractal/` contains only `detail.ts`, shared by the escape-time kernels and Markus–Lyapunov. Card 137 supplies `fractal-interestingness.md` as an honest shared-coverage index, not an invented simulation.
- Brian's Brain's August escalation is superseded by the September 6 operator decision, corrected float32 comparison, completed dyingValue sweep and preset retune. Read the later sections of its write-up and card 72's re-brief. The current source has Math.fround. Interior dyingValue values are appearance-only, not new discrete dynamics. Card 147 searches different axes.
- Several harness reference rows are stale relative to later preset promotions (including Brian's Brain and Cyclic CA). Each card must derive its current references from shipped presets and distinguish these from preserved historical rows.

## Checks run before authoring

`npm run verify`: **PASS**, typechecks/build green; 395 kernel tests passed, 38 skipped, 0 failed. Skipped tests do not count as passes. Existing bundle-size warning remains.

`npx playwright test e2e/sweep.spec.ts -g 'metrics harness|non-phase|multi-snapshot summary|Lorenz multi-snapshot|circular autocorrelation'`: **4 passed, 1 failed, 1 skipped**. The skipped test is the opt-in Lorenz appendix command, not a successful sweep.

The failure is `non-phase Gray-Scott scores are unchanged`: expected score 0.7102674508287455 and coverage 0.6756591796875; current score 0.7065245840037978 and coverage 0.692138671875. Source now defaults to nine-point; the expected literals are five-point. Those current readings match the earlier nine-point appendix. This is an existing baseline mismatch, not permission to weaken the regression. Card 143 must preserve an explicit five-point regression and establish the current-nine-point comparison. No historical frozen assertions may be changed.

Planning logs remain locally at `/tmp/emergence-sweep-baseline-20261030.log` and `/tmp/emergence-sweep-browser-20261030.log`. The durable facts and readings are recorded above; those temporary logs are not final sweep evidence.

## Card list and order

All cards are serial in the listed order. Only 138 and 139 declare a native landed-code dependency on 137 because they consume its new static metric. Other searches do not depend on unrelated success. Summary 149 can report partial/failed work and has no success gate. Shared harness files make pipeline overlap inappropriate. Every stage uses a cross-family verifier; workers alternate GPT-6.1 Sol and Claude Sonnet 5.5. Verifier effort high, worker effort high for new metric design and medium for bounded search/interpretation. No frontier-tier polling or extra infrastructure stages.

| Card | Observable outcome | Worker → verifier | New candidate allowance |
|---|---|---|---|
| [137](../stages/137-mandelbrot-boundary-sweep.md) | Mandelbrot + reusable static boundary metric; shared fractal coverage index | Sol → Sonnet | 48 + 32 refinements |
| [138](../stages/138-burning-ship-boundary-sweep.md) | Burning Ship view shortlist | Sonnet → Sol | 48 + 32 |
| [139](../stages/139-julia-connectivity-sweep.md) | Julia connectivity shortlist | Sol → Sonnet | 64 + 32 |
| [140](../stages/140-markus-sign-mix-sweep.md) | Markus stable/chaotic sign-mix shortlist | Sonnet → Sol | 48 + 24 |
| [141](../stages/141-eca-rule-regimes.md) | ECA rule/seed census with class signals | Sol → Sonnet | 768 + 24 long-history checks |
| [142](../stages/142-lorenz-unexplored-regimes.md) | Novel Lorenz regimes and dedicated report | Sonnet → Sol | 64 + 24 |
| [143](../stages/143-reaction-diffusion-missed-regimes.md) | Gray-Scott, BZ, Lenia missed interactions | Sol → Sonnet | 48 + 16 per kernel |
| [144](../stages/144-particle-trail-missed-regimes.md) | Boids, Physarum, Particle Life missed interactions | Sonnet → Sol | 48 + 16 per kernel |
| [145](../stages/145-phase-missed-regimes.md) | Kuramoto, Swarmalators missed interactions | Sol → Sonnet | 64 + 16 per kernel |
| [146](../stages/146-growth-criticality-missed-regimes.md) | Sandpile, DLA, Ising missed interactions | Sonnet → Sol | 48 + 16 per kernel |
| [147](../stages/147-cellular-missed-regimes.md) | Brian's Brain, Cyclic CA, Life missed interactions | Sol → Sonnet | 48 + 16 per kernel |
| [148](../stages/148-attractor-coefficient-interactions.md) | Clifford, De Jong, Svensson missed c/d interactions | Sonnet → Sol | 48 + 16 per variant |
| [149](../stages/149-interestingness-sweep-summary.md) | Verified evidence index, proposal shortlist, HANDOFF | Sol → Sonnet | no new sweep |

Searches are bounded coarse-to-fine investigations, not arbitrary full Cartesian expansion. Current references, independent replays and seed/resolution checks are additional to the new-candidate allowance. Before measuring, workers declare exact samples, what prior grid each differs from, and stopping conditions. No requirement to manufacture a winner; negative results count if well evidenced.

## Visual and dynamic evidence

Retain complete compact ranked JSON in `docs/sweeps/data/2026-10-30/`, finalist/reference screenshots in `docs/images/sweeps-2026-10-30/`, and link them from each report. Keep large scratch outputs under e2e/artifacts only as supplemental data. Each promoted-preset proposal includes exact parameters, current-reference comparison, search coverage, limitations and reproduction command.

Use actual app screenshots for visual judgement where the route exists; label grayscale kernel fields separately. Dynamic candidates need at least three separated frames, a longer-horizon replay, and three seeds where the kernel exposes seeding. Confirm at app-relevant resolution/population to avoid the documented small-grid artefacts. Shelved kernels stay shelved. Static palette cycling or rotation must not masquerade as novel dynamics. No production presets/defaults land without the operator's later visual approval.

## Spend estimate and stop policy

Source: nonzero recorded worker/verifier attempts for stages 58–86 in `state/cost-log.jsonl`, including failed attempts. Units here are **cached-inclusive tokens**, calculated as input + cached_input + output in those historical records. They are not a price estimate or a claim about current provider quota accounting.

| Role | Sample size | Median cached-inclusive | Median cached input alone | p95 cached-inclusive |
|---|---:|---:|---:|---:|
| Worker | 36 | 1,729,975 | 1,648,045.5 | 7,202,477 |
| Verifier | 34 | 1,330,661 | 1,269,945 | 4,053,257 |

- Thirteen worker/verifier pairs: **58,152,084 tokens**, roughly 58.2M: seven single-outcome/collation pairs at 3.061M plus six grouped pairs at 6.121M (2× median).
- Separate batch preparation allowance: **4M**, covering authoring, baseline runs, oracle preparation and cold reads. This is a planning allowance, not a runtime cap change. Planning-session actual usage is unavailable from the cost ledger and is not reported as zero; cold-read usage is recorded separately below when returned.
- One conservative outlier reserve (sum of per-role p95): **11,255,734**, roughly 11.3M. It is not a statistically measured p95 of the pair.
- Proposed planning envelope: **73,407,818**, rounded **74M cached-inclusive tokens**. First-priority cards 137–142 account for about 18.4M of the 58.2M attempt estimate.
- Current-model behaviour may differ substantially from the August/September sample. Re-estimate after the first accepted pair from actual usage; do not silently enlarge the batch or any cap. No retries are pre-authorised.
- No drain is created now. If later approved, its expiry must stay inside the current UTC quota window. Exact dispatch readiness, current quota headroom and server availability are checked at admission, without changing pause/caps on the strength of this estimate.

## Card-review checkpoint

All 13 cards have outcome, seats, cross-family pairing, serial gates, scope, evidence obligations, known baseline failures and bounded search/wall-clock allowances. Shared consumers were read rather than inventing a second harness. The live source invalidates the stale “Lorenz unswept”, “fractal kernel” and “Brian's Brain unresolved” premises.

**These are design drafts, not dispatch-ready cards.** Implementation cards still need orchestrator-owned frozen core tests, intended-red baseline evidence, proportionate positive proof, complete per-command preflight and strict lint. The cards explicitly name those gaps; no prose-only exemption is claimed for implementation. The final collation card is genuinely prose-only. Authoring every oracle before the operator has accepted the corrected scope would front-load the infrastructure spend this brief asks to avoid. The next preparation pass must stay within the same 4M allowance, not reset it.

Cross-family cold review completed; see the outcome below. Nothing may be queued until both review closure and operator admission are recorded. Batch approval does not itself authorise default promotion or touching the parked arc.


## Cross-family review and responses

Claude Sonnet 5.5 reviewed all thirteen card texts in a fresh session with tools disabled. Verdict: **not ready to queue**. Its independent review identifies real readiness work, not an implementation PASS. Measured review usage: 61,749 cache-creation input + 2 uncached input + 0 cache-read input + 13,390 output = **75,141 tokens**, within the shared preparation allowance. Lead-session actual remains unmetered here.

Material design findings resolved in the cards:

- **Oracle ownership versus adaptive grids:** frozen acceptance is orchestrator-owned; supplemental worker tests are separate. A retained pre-measurement manifest declares samples, historical ranges/citations and fixed settings; the oracle checks correspondence and completeness without predetermining winners.
- **Server ambiguity:** use port 5173 only when vacant, start an owned Vite process from the exact run worktree, never reuse another preview. Occupancy blocks admission; no new port infrastructure is planned.
- **Failure chain:** retain only real data dependencies (137 → 138/139). Summary has no success gate and reports partial work honestly. A worker/verifier PASS without landing does not satisfy a code dependency.
- **Gray-Scott contradiction:** the known baseline failure may remain unchanged before 143; 143 explicitly pins the old test to five-point and adds a current-nine-point comparison. It cannot replace old literals or frozen assertions. After 143 the repaired checks must be green.
- **Grouped-card sizing:** allow up to 60 worker and 30 verifier minutes per kernel/variant, with 240/120 minute bands for three-kernel cards and 150/90 for the two-kernel card. Double their token estimate. A throughput pilot that cannot fit must trigger a split/re-brief, not a truncated sweep.
- **Visual evidence:** morphology descriptions are manual observations, not claims of mathematical topology or universal class labels. Fixed deterministic replay tolerance is absolute 1e-9; seed spread is reported without claiming population statistics. Shelved Swarmalators uses explicitly labelled kernel-field evidence, not nonexistent app screenshots.
- **Shared fractal index:** 137 creates a helper-consumer index; 149 reconciles final coverage. Static checks use 128² and 256²; capped iteration doubling is reported as capped, not invented.
- **Ising symmetry:** spin-flipped negative-field counterparts are controls, not new regimes. Novel search targets coupling/temperature and initial-state interactions.
- **Summary boilerplate:** removed the accidental shortlist rerun requirement; final verifier reconciles evidence rather than repeating twelve stages.

Remaining pre-dispatch obligations are explicit: frozen numeric metric calibration, intended-red and bounded-positive proof, per-card executable-command preflight, exact sample manifests and final review closure. Structural strict lint currently passes all 13 cards, but it does **not** prove oracle readiness: the draft cards use “Planned test file”, not a fabricated frozen digest. They must not be queued on that lint result alone.

The reviewer also suggested mandatory high effort and an approval quote for medium effort; that is not the run-design rule (only xhigh/max need explicit approval), so medium remains intentional. Its inability to inspect schemas and landed history is resolved by the lead's live-source checks documented above, not by claiming the cold reader verified those facts.

Live queue inspection: no current stage, no pending/in-progress stages. Two historical verifier_failed entries remain unchanged. This does not lift the global operator pause or authorise a retry.


## Operator admission — 2026-10-30

The operator replied “approved” to the 13-card scope, approximately 74M cached-inclusive planning envelope, and lifting the pause **once readiness checks pass**, with existing caps unchanged. This is execution authority for this sweep batch only. It does not permit logistic-mandelbrot work, production-preset promotion, cap changes or main/publish pushes.

Admission preparation uses the same 4M allowance. Three agents own disjoint per-card oracle/card files (137–140, 141–144, 145–148); this is preparation under the orchestrator, not worker dispatch. The lead reviews/finalises every frozen block and digest before committing and queueing. No generic orchestration framework is added. Full scientific and visual positive evidence remains the worker's deliverable and the cross-family verifier's independent responsibility; synthetic validator fixtures cannot supply it.

Live admission readings: no pending/in-progress stage; port5173 vacant; fleet tick launch agent loaded; token cap150M, window spend49,101,461, consecutive failures2 of3. Keep those caps/counters unchanged. A new failure may therefore halt the batch, as the existing policy intends. Provider snapshot: Claude43% five-hour/30% weekly; Codex2% weekly. The tick's own current quota gate remains authoritative at dispatch. No drain is necessary or created because the unchanged repo cap already covers the planning envelope at this reading.


## Final admission review

All twelve executable cards now name frozen tests and digests; card149 remains prose-only. Explicit node-only baselines total **25 positive controls and 21 intended failures**, with no skipped tests in each selected run. Failures identify missing new configs, retained results or metric exports; they are the worker's tasks, not broken test imports. Positive controls exercise valid/nonempty evidence and corruptions, unchanged production source/guard scripts/historical configurations and legacy scoring. ECA also verifies the existing kernel's generated-row count. Default discovery compiles all46 new tests and skips them unless their stage is selected, preserving unrelated e2e behaviour. All13 cards pass strict lint and all12 digests match.

The final fresh Claude Sonnet5.5 review cleared twelve cards and conditionally questioned Lorenz's spread truthiness. Live source and a five-identical-snapshot probe close that concern: spread.score is an object with min0/max0/standardDeviation0, so equilibria pass. No assertion was changed. Final-review usage:145,500 cache-creation input +7,649 cache-read input +2 uncached input +36,795 output =189,946 tokens. Both cold reads total265,087; lead/agent actual usage is not available in the stage ledger and is not represented as zero.

Live checks also confirmed all referenced config/kernel field names and enums. Project `npm run typecheck` passes. The optional standalone e2e typecheck could not run because @types/node is absent; existing project configs do not include e2e, and Playwright parsed and executed the new files. No tooling dependencies were added for this extra check.

The completion-only gate was found to admit an awaiting-integration predecessor. Cards138/139 now use Autometta's existing `Depends on` mechanism, which rejects awaiting integration and requires dependency-commit ancestry in dev. This closes the review item without changing orchestration code. All other cards remain serial, with summary149 permitted to report a partial/failed batch.

Before queueing, commit these cards/tests and the HANDOFF checkpoint onto dev so ephemeral run worktrees inherit them. The approved unpause will clear only paused_until/paused_reason; caps, counters, provider routes and parked-stage records remain unchanged. Real scientific/visual results must still be independently verified; the preparation controls are not successful sweeps.
