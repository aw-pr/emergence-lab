# 2026-08-24 overnight summary — stages 58-64

> **Reconciled 2026-09-02, stage `74-sweep-write-ups-record-what-landed`,
> against `state/state.yaml` and the stage cards for 59, 60, 61, 63, 65, 66,
> 67, 68, 69, 72 and 73.** Every "still open" metric follow-up below has
> since closed; see the per-item closure notes. Three of the four
> escalations are settled (Physarum, Lenia, Crystal lattice); Brian's Brain
> remains open, now blocked on stage 72's `verifier_failed` outcome rather
> than unstarted. The stage 63 stall is resolved — it was requeued and
> completed 2026-09-01. Original text below is unaltered; closures are
> additions only.

Consolidates the overnight autometta slate authored in `bd63a34` and dispatched
against `dev` (base commit `d056e1e` through `798a212`). Six worker stages
(58-63) plus this report (64). Source data: `state/state.yaml`,
`state/verifiers/*.json`, `docs/stages/58-*.md` through `63-*.md`, the dated
2026-08-24/2026-08-25 appendices under `docs/sweeps/`, and `git log`.

## Outcome table

| Stage | Status | Verifier verdict | Commit / failure reason | Worker | Verifier | Tokens (worker + verifier) |
|---|---|---|---|---|---|---|
| 58-kernel-preset-not-reset | completed | PASS (6/6 criteria) | `9555f14` | Claude Opus 5 | GPT-5.6 Sol | 2,341,032 + 2,006,111 |
| 59-sandpile-topple-conservation | completed | PASS (5/5 criteria) | `520367d` | Claude Fable 5 | GPT-5.6 Sol | 1,585,831 + 794,709 |
| 60-ising-external-field-sweep | completed | PASS (5/5 criteria) | `e3227e5` | GPT-5.6 Sol | Claude Sonnet 5 | 699,410 + 608,138 |
| 61-cyclic-ca-crystal-rescue | completed | PASS (4/4 criteria) | `9fb0545` | GPT-5.6 Sol | Claude Sonnet 5 | 614,288 + 1,275,993 |
| 62-lenia-radius-sweep | completed | PASS (4/4 criteria) | `12a4e05` | GPT-5.6 Sol | Claude Sonnet 5 | 736,594 + 701,953 |
| 63-point-cloud-metrics | **stalled** | no verifier artefact (`state/verifiers/63-*.json` does not exist) | `stall_marker: worker_envelope_missing_after_exit` — no `state/handoffs/63-point-cloud-metrics.json` was ever written | Claude Fable 5 | GPT-5.6 Sol (never dispatched) | 4,617,912 + 0 |
| 64-overnight-summary-report | in progress (this report) | — | — | Claude Sonnet 5 | GPT-5.6 Sol | — |

Total landed on `dev` tonight: 5 commits, `9555f14` through `12a4e05`, all
merged with `integration.state: merged` in `state/state.yaml`.

## Promotions landed

### Stage 58 — kernel preset select now resets

Bug fix, not a parameter promotion: `buildKernelPresetRow` did not register its
`<select>` for reset, so the label survived a "Reset to defaults" click while
every underlying parameter reverted. Fixed at `src/app/controls.ts:786-808`
(registration) and `:1097-1126` (reset). No preset params changed.

### Stage 59 — Abelian Sandpile: conservative topple at all thresholds

Kernel fix at `src/sims/abelian-sandpile/kernel.ts:232-254`: toppling above
threshold 4 previously destroyed `(threshold − 4) * bulk` grains per topple.
No preset parameters were retuned (card's `presets.ts` deliverable was
conditional on the kernel fix still leaving "High threshold" weak — it did
not).

| Preset | Coverage before | Coverage after | Flux before | Flux after | Score before | Score after |
|---|---|---|---|---|---|---|
| Classic critical | 0.201 | 0.201 (reproduced) | 0.1106 | 0.1106 (reproduced) | 0.416 | 0.416 (reproduced) |
| Fast avalanches | 0.374 | 0.374 (reproduced) | 0.2084 | 0.2084 (reproduced) | 0.417 | 0.417 (reproduced) |
| High threshold | 0.001 | **0.317** | 0.0000 | **0.1517** | 0.004 | (alive, gates cleared: coverage > 0.05, flux > 0) |

### Stage 60 — Ising Model: "Positive field" promoted

`src/app/presets.ts:96-101` — `externalField` 0.35 → **0.02**, temperature held
at 1.8, `coupling: 1` fixed (was swept in 2026-08-23, now pinned; the sweep axis
moved from field-fixed/coupling-swept to field-swept/coupling-fixed).

| | externalField | Score | Coverage |
|---|---|---|---|
| Before (incumbent) | 0.35 | 0.003 | 0.99 |
| After (promoted) | 0.02 | 0.519 | 0.768 |

Unchanged presets reproduced exactly: Critical domains 0.457, Cold quench
0.564, Hot noise 0.222 (all match the 2026-08-23 reference table).

### Stage 61 — Cyclic CA: "Crystal lattice" promoted

`src/app/presets.ts:767-776` — threshold 2 → **1**, `states: 12` unchanged,
`vonNeumann` unchanged.

| | states | threshold | Score | Flux | Autocorrelation |
|---|---|---|---|---|---|
| Before (incumbent) | 12 | 2 | 0.283 | 0.0000 (frozen) | — |
| After (promoted) | 12 | 1 | **0.626** | 0.4625 | 0.553 |

The verifier confirmed the numeric gate (flux > 0.01, autocorrelation > 0.5,
distinct params from "Demons" at states 14/threshold 1/moore) but flagged that
the worker made the "visually distinct from Demons" call itself rather than
deferring it — the card's Escalation clause reserves that judgement for the
operator. See Escalations below.

### Stage 62 — Lenia radius sweep: no promotion

`src/app/presets.ts` unchanged (`git diff` empty). Best swept set (radius 14,
mu 0.24, sigma 0.028) scored **0.463**, an 11.97% margin over "Geminium
storm" re-scored at 0.4135 in the same run — clearing the card's >5% gate, but
the winner is a different visual character rather than a sharper version of
the incumbent, so per Escalation it was recorded as a fourth-preset candidate
rather than promoted. See Escalations below.

## Escalations awaiting the operator

Four judgement calls are now open, three carried forward from 2026-08-23 and
one new from tonight.

### 1. Physarum — fourth-preset candidate (carried from 2026-08-23)

| | params | Score |
|---|---|---|
| Incumbent (best, Filigree web) | angle 38, dist 5, turn 34, evap 0.96 | 0.851 |
| Candidate | angle 60, dist 5, turn 12, evap 0.90 | 0.901 |

Candidate beats incumbent by 5.9% but is a different-looking network (wide
sensor, slow turn → broad even mat), not a replacement for any of the three
shipped presets. Operator decides whether to add it as a fourth preset.

> **Closed — stage `68-physarum-fourth-preset`, completed 2026-09-01T12:27:21Z,
> commit `d2ebcf5`.** The operator authorised the candidate as a fourth
> preset, "Root mat". See `docs/sweeps/physarum-interestingness.md`.

### 2. Brian's Brain — "Classic waves" ranking inversion (carried from 2026-08-23)

| | params | Score | Autocorrelation | Coverage |
|---|---|---|---|---|
| Incumbent | Classic waves: birth 2, seed 0.22, dying 0.5 | 0.071 | 0.32 | 0.043 |
| Candidate | birth 1, seed 0.18, dying 0.5 | 0.174 | 0.10 | 0.377 |

The candidate outscores the incumbent on the composite purely via coverage
while being less structured (lower autocorrelation). The write-up explicitly
recommends not promoting on this number; if "Classic waves" changes at all it
should be via the untried `dyingValue` axis, not `seedDensity`. Operator
decides whether to leave as-is, or commission a `dyingValue` follow-up sweep.

> **Still open (reconciled 2026-09-02, stage
> `74-sweep-write-ups-record-what-landed`).** The operator commissioned the
> `dyingValue` follow-up: stage `72-brians-brain-dying-value-comparison`
> (started 2026-09-01T20:32:42Z) fixed the underlying float32 comparison bug
> that made `dyingValue` inert for non-dyadic values, but the verifier
> returned `verifier_failed` at 2026-09-01T20:43:06Z — the kernel fix itself
> passed, but two of the three shipped presets (Sparse spirals, Storm) are
> not byte-identical to `dev` under the fix, since 0.62 and 0.42 are exactly
> the non-dyadic values the bug made silently inert. That trade is an
> operator decision the card's own Escalation clause reserves, so the stage
> has not merged and the sweep along this axis has still not been run. This
> is the one metric follow-up in this document that remains genuinely open.

### 3. Lenia — fourth-preset candidate (new, from stage 62)

| | params | mu / sigma | Score |
|---|---|---|---|
| Incumbent (re-scored this run) | Geminium storm | (own) | 0.4135 |
| Candidate | radius 14 | 0.24 / 0.028 | 0.4630 |

Same shape as the Physarum escalation: a >5% margin but a different visual
character. Operator decides whether to add a fourth Lenia preset.

> **Closed — stage `69-lenia-fourth-preset`, completed 2026-09-01T15:17:06Z,
> commit `3e04c18`.** The operator authorised the candidate as a fourth
> preset, "Living labyrinth". See `docs/sweeps/lenia-interestingness.md`.

### 4. Crystal lattice — "visually distinct from Demons" sign-off (new, from stage 61)

The stage 61 promotion (threshold 2 → 1) already landed on `dev` — the worker
made the distinctness call and promoted rather than deferring it, which the
verifier flagged as a process deviation from the card's Escalation clause
("the operator picks"). The numeric gate is unambiguously met and the params
are not the Demons twin (states 12 vs 14, vonNeumann vs moore), but the
subjective "regular, nested diamond waves vs irregular Moore spirals" call was
made by the worker, not the operator. Operator should review the landed preset
and confirm or reject the distinctness judgement post hoc.

> **Settled (reconciled 2026-09-02, stage
> `74-sweep-write-ups-record-what-landed`).** The stage 61 promotion stands
> on `dev`; nothing further landed or is pending in code or docs. No record
> was found anywhere in `docs/sweeps/` of the operator's post-hoc
> distinctness sign-off itself — that stays a standing operator item, not a
> metric follow-up, since resolving it either way requires no further work
> from this stage (the preset already ships either as accepted or as a
> pending revert, and the operator has taken neither action recorded in
> writing).

## Failures and stalls

### Stage 63 — point-cloud-metrics: stalled, no verifier ever dispatched

`state/state.yaml` records `status: stalled`, `stall_marker:
worker_envelope_missing_after_exit` — the worker exited without writing
`state/handoffs/63-point-cloud-metrics.json`, so the dispatch loop never
handed the stage to the verifier. No `state/verifiers/63-*.json` exists.

The dirty worktree is still standing at
`../emergence-lab-run-63-point-cloud-metrics`
(branch `autometta/63-point-cloud-metrics`, HEAD at `12a4e05`, same as `dev`
— no commit was made) with uncommitted changes to:

- `e2e/harness/metrics.ts` (modified)
- `e2e/harness/sims.ts` (modified)
- `e2e/sweep.spec.ts` (modified)
- `e2e/grayscott-repro.scratch.spec.ts` (untracked scratch file, not a
  deliverable — the card's deliverable list does not include it)

Worker token spend was 4,617,912 against a 240-minute budget with no recorded
completion — the largest single spend of the night with no landed result.
None of the card's deliverables (dated appendices in
`docs/sweeps/particle-life-interestingness.md` and a new
`docs/sweeps/boids-interestingness.md`) are present in the tracked tree.

This stage needs a fresh dispatch (see the `autometta-requeue` pattern) rather
than a resume — the worktree should be inspected for salvageable partial work
in `metrics.ts`/`sims.ts` before requeuing, since the diff is substantial and
unverified.

> **Closed — stage `63-point-cloud-metrics` was requeued and completed
> 2026-09-01T18:59:14Z, commit `2bf4c47` (reconciled 2026-09-02, stage
> `74-sweep-write-ups-record-what-landed`).** Both card deliverables landed:
> `docs/sweeps/particle-life-interestingness.md` got its point-cloud
> appendix and `docs/sweeps/boids-interestingness.md` was created. Worker
> token spend on the successful attempt was 5,315,615 (verifier 3,942,158).

## Metric follow-ups still open

None of tonight's six stages closed any of these; they remain exactly as
recorded on 2026-08-23 (stage 63, which was scoped to address the
point-cloud/sparse-sim gap, stalled before producing artefacts):

- **Circular statistics for Kuramoto** — the phase channel wraps at 1.0;
  linear spatial-autocorrelation and temporal-flux read the wrap as a
  discontinuity. A circular-statistics metric (mean resultant length,
  circular autocorrelation) is the right instrument. Recorded in
  `docs/sweeps/kuramoto-oscillators-interestingness.md`.
  > **Closed — stage `65-circular-phase-statistics`, completed
  > 2026-08-30T21:36:30Z, commit `b66b803`.**
- **Circular statistics for Swarmalators** — same root cause, phase channel.
  Recorded in `docs/sweeps/swarmalators-interestingness.md`.
  > **Closed — stage `65-circular-phase-statistics`, completed
  > 2026-08-30T21:36:30Z, commit `b66b803`** (same stage as Kuramoto above).
- **Multi-lag / FFT-band structure term** — the current lag-1 spatial
  autocorrelation misreads Game of Life's "Maze-like" preset (fine-scale
  periodic corridors read as anti-correlated noise, score 0.082, despite
  being a stable working pattern). Recorded in
  `docs/sweeps/game-of-life-interestingness.md`. A related note in
  `docs/sweeps/ising-model-interestingness.md` on the same structure term
  (Critical domains vs Cold quench) is explained as correct behaviour, not a
  metric gap, and needs no follow-up.
  > **Closed — stage `66-multi-lag-structure-term`, completed
  > 2026-08-31T21:41:41Z, commit `7814fd7`.**
- **Lorenz multi-snapshot averaging** — a single-frame score is
  timing-sensitive for a trajectory sim; `rho=28` reads as a thin one-wing
  trace (0.174) purely because the snapshot catches it early. Recorded in
  `docs/sweeps/gray-scott-interestingness.md`. No preset action needed (the
  existing "Wide wings" preset at `rho=35` already renders the full
  butterfly); this is a scoring-robustness improvement only.
  > **Closed — stage `67-lorenz-multi-snapshot-scoring`, completed
  > 2026-08-30T22:14:53Z, commit `2a5b388`.**
- **Point-cloud / sparse-sim scoring (Boids, Particle Life)** — this is
  exactly what stage 63 was dispatched to fix and did not land. Both sims
  remain effectively invisible to the field-sim metric stack (Boids ≈0.02
  across all sets; Particle Life spread 0.025). Still open.
  > **Closed — stage `63-point-cloud-metrics`, completed 2026-09-01T18:59:14Z,
  > commit `2bf4c47`, after a requeue.** See the stall closure note above and
  > `docs/sweeps/boids-interestingness.md` /
  > `docs/sweeps/particle-life-interestingness.md`.

None of the five metric follow-ups above are open any longer as of the
2026-09-02 reconciliation.

## Still genuinely open (added 2026-09-02, stage `74-sweep-write-ups-record-what-landed`)

Everything that was open in `docs/sweeps/` as of tonight's summary and the
sweeps written since has closed except:

- **Brian's Brain `dyingValue` axis** — escalation 2 above. The float32
  comparison bug is fixed (stage
  `72-brians-brain-dying-value-comparison`), but the stage's verifier
  returned `verifier_failed` on 2026-09-01 pending an operator call on
  retuning two shipped presets, so the axis is still unswept and "Classic
  waves" is unchanged.

One item outside this report's scope is also open and unrecorded as a card:
`docs/sweeps/particle-life-interestingness.md` (line ~162, added by stage 63)
names a species-mixing statistic as "the sharper follow-up instrument" for
Particle Life, beyond the smoothed point-cloud density stage 63 shipped. Not
carded here per this stage's out-of-scope constraint (no new follow-ups) —
flagged for the operator.

> **Correction (added 2026-09-03, re-brief of stage
> `74-sweep-write-ups-record-what-landed`).** The list above was closed by
> omission: stage 73's appendix in
> `docs/sweeps/gray-scott-interestingness.md` (search "neither of them
> decided here") names two further items it deliberately left undecided,
> and both are still open:
>
> - **The `F=0.062, k=0.0615` labyrinth scoring 0.727** — a real pattern a
>   hair above the retired U-skate preset's kill rate, neither promoted nor
>   rejected. As of 2026-09-03 this has a card, `docs/stages/75-gray-scott-labyrinth-preset.md`
>   (`state/state.yaml` status `pending`, not yet started).
> - **Gliders at a finer discretisation** (a nine-point Laplacian or a
>   sub-unit timestep) — out of stage 73's scope since it is a kernel change
>   affecting every Gray-Scott preset. As of 2026-09-03 this has a card,
>   `docs/stages/76-gray-scott-nine-point-laplacian.md` (`state/state.yaml`
>   status `pending`, not yet started).
>
> Re-checked every appendix dated 2026-09-01 or later across `docs/sweeps/`
> for the same pattern (an item explicitly left undecided): the gray-scott
> U-skate appendix (above, now covered), particle-life's 2026-09-01 re-run
> note (no new undecided item, confirms the already-recorded species-mixing
> follow-up), boids-interestingness.md (2026-09-01, no undecided item), and
> lenia-interestingness.md's fourth-preset section (2026-09-01, no undecided
> item beyond the already-closed promotion). No other instance found.

## HANDOFF.md

Status line replaced with a dated pointer to this report.
