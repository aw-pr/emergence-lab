# Run log: logistic-mandelbrot, 2026-07-17

![The one-shot result: the orbit-attractor sheets over the Mandelbrot
plane, first real-GPU session after the five-stage
run](2026-07-17-logistic-mandelbrot-oneshot.png)

*The image above is the operator's screenshot from the first real-GPU
session, taken minutes after stage 21 landed — the run's one-shot
result, unretouched.*

First live autometta run pairing Claude Fable 5 and GPT-5.6 Sol, manually
dispatched (no tick loop), both on subscription billing. Five stages
(cards 17-21 in `docs/stages/`) building a new sim: the Mandelbrot set in
the c-plane with orbit attractors as height, whose real-axis slice is the
logistic bifurcation diagram. Orchestrated by Claude Fable 5 from a
Claude Code session; verifier roles filled by Sol, Opus 4.8, and Sol
again as availability shifted.

All times BST. Token figures are raw parser totals and, for
Claude-family agents, include prompt-cache reads at full weight (see
Observations).

## Pre-flight

- Research phase: three parallel agents scoped the sim concept (the
  Veritasium Mandelbrot-bifurcation object; no interactive WebGL
  implementation found anywhere), the particle-life wave feasibility, and
  autometta's readiness for a Fable+Sol pairing.
- autometta fixes landed before dispatch:
  - `557f225` — non-panel codex dispatch never pinned `--model`; a Sol
    card would run whatever `~/.codex/config.toml` named.
  - mcp-hub `65a9a3e` — `agent-whoami` had no `claude-fable-5` case.
  - `de4c1b1` — Claude-family token accounting was blind: text-mode
    `claude -p` prints no usage line, so every Claude worker/verifier
    recorded zero tokens. New `claude-token-log.sh` filter (JSON output
    re-emitted as readable log + `Total tokens:` line). The first draft
    of the filter passed the program via heredoc, which silently
    swallowed the piped stdin — caught in round-trip testing before any
    dispatch used it.
  - `0d90d89` — provider limit errors (usage/rate limit, overload,
    credit) surfaced from agent logs into the phat-controller dashboard
    as a per-repo alerts array. Nothing previously noticed a worker
    whose PID stayed alive while its log went quiet.
- Config corrections: emergence-lab's manifest had codex routed to
  metered api billing (flipped to subscription for this run) and an
  `autometta_root` pointing at a deleted Homebrew Cellar path (repointed
  at the repo checkout).
- Smokes on subscription: Sol OK (13,294 tokens), Fable OK. Budget reset
  to a fresh 1M-token cap; five stage cards authored and committed
  (`f8ea387`).

## Stage 17 — orbit sampler + CPU reference kernel (Fable → Sol)

- Worker (Fable): 15.5 min, 3,310,968 tokens. Delivered sampler, kernel,
  12 tests encoding the logistic conjugacy (r = 1+√5 two-cycle mapped to
  {0, −1}), registry entry. `npm run verify` green, scope clean,
  envelope `pass`.
- The 3.31M figure immediately blew the 1M budget cap — cache-read
  inflation, not real spend. Cap raised to 25M for the run.
- Verifier (Sol) attempt 1: dead in 99s — "Selected model is at
  capacity" (OpenAI-side, transient). 61,008 tokens. The limit scanner
  didn't know that phrasing; pattern added (`b907207`).
- Verifier attempt 2: 6 min, PASS on all five criteria, 149,506 tokens.
  Independently re-derived c = −1 → r = 3.236… with samples {−1, 0}
  period 2, and c = −1.76 inside the period-3 window.
- Committed `4fc6252`.

## Stage 18 — orbit3d render mode + point cloud (Sol → Opus)

- Worker (Sol): 8.7 min, 136,297 tokens. Chose static CPU point cloud
  (8ms-sliced async build, incremental bufferSubData upload) over
  ping-pong textures; 1.0M-4.8M quality-scaled point budgets; 2D
  fallback. Verify green; browser checks left to the verifier (no
  browser in the worker sandbox).
- Verifier dispatch attempt 1 exposed a real autometta bug: the new
  claude-token-log pipeline left the filter's stderr attached to the
  spawn script's stdio, so piping spawn output made the caller wait on
  the background agent — and the caller's 2-minute timeout SIGTERMed the
  process group, killing the dispatched verifier (disown guards SIGHUP,
  not group SIGTERM). Fixed by redirecting the whole background
  subshell's stderr into the stage log (`a6f46ae`).
- Attempt 2 (Fable): dead in 93s — "You've hit your session limit ·
  resets 6:20pm". The Anthropic 5-hour window, burned by the stage-17
  work plus the orchestrator session itself. 508,810 tokens.
- Resumed 19:12 after the reset. Attempt 3 (Fable): dead — "Usage
  credits are required for this model". Fable had dropped off
  subscription (later understood as an outage, not a plan change).
  1,158,580 tokens.
- Role swap: Opus 4.8 (still on subscription, smoke 40,770 tokens) took
  the Claude verifier slot for stages 18-20; stage 21's worker moved
  provisionally to Sol (`922da5e`).
- Attempt 4 (Opus): 7 min, PASS on all five, 1,681,895 tokens. Flagged
  honestly that 60fps could not be confirmed under SwiftShader software
  rasterisation (4fps observed is a software artifact); real-GPU check
  deferred to ship time.
- Committed `63f2fee`. Verifier attempts for the stage: 4.

## Stage 19 — orbit camera + c-marker (Sol → Opus)

- Worker (Sol): 23.7 min, 154,342 tokens, six files, verify green.
- Verifier (Opus): 3.4 min, PASS on all five, 561,733 tokens.
  Browser-visual components grounded in the verify gate,
  model-confirmed periods (1 on the cardioid, 2 on the disc, 3 on the
  period-3 bulb), and the worker's on-canvas smoke.
- Committed `eed6f5c`. A mid-run "was there a reset?" check found the
  Sol worker untouched — the Anthropic reset does not affect
  Codex-family dispatches.

## Stage 20 — animate the maths (Sol → Opus)

- Worker (Sol): 12.7 min, 146,387 tokens. Cascade reveal as a
  plotted-iterations ramp (not a fade), real-axis sweep with drag
  interruption crossing the period-3 window, real-slice toggle. Touched
  the stage-17 kernel/tests to add params — legitimate, and explicitly
  re-checked by the verifier.
- Verifier (Opus): 3.9 min, PASS on all five, 811,409 tokens. Confirmed
  animations are dt-based and stages 17-19 stayed green.
- Committed `97830da`.
- Fable outage ended around this window; smoke passed (42,086 tokens)
  and stage 21 was reinstated to its original Fable-worker pairing
  (`c05da3c`), restoring cross-family verification in both directions
  across the run.

## Stage 21 — ground plane, presets, essay, gallery (Fable → Sol)

- Worker (Fable): 22.6 min, 14,288,666 tokens (cache-inflated).
  Delivered ground plane, three presets, essay, deterministic thumbnail
  across ten files. Surfaced a genuine card ambiguity instead of
  papering over it: "plane at z = 0" would slice mid-cloud (orbit values
  span [−2, 2]), so the plane went to the marker base plane at −2.08
  with the whole cloud above it.
- Verifier (Sol) attempt 1: 3.9 min, **FAIL**, 188,281 tokens. Five of
  six criteria passed, including the essay's maths (conjugacy
  c = (r/2)(1 − r/2); period-3 onset at c = −7/4). Criterion 5 failed:
  the card required the essay to render on the sim page, but nothing in
  `src/` imports `essays/` — it is a repo documentation convention and
  no existing sim renders its essay in-app. A card-authoring error, not
  a worker defect: the worker followed the house convention; the
  verifier refused to rubber-stamp a criterion the deliverable did not
  literally meet. The audit trail records whose error it was.
- Card amended per the dispatch contract, amendment noted on the card
  (`93c09c1`); verifier re-dispatched against the corrected criterion.
- Verifier attempt 2 (Sol): 7.3 min, PASS on all six criteria, 175,424
  tokens.
- Committed `9c09efc`. Run complete: five stages, five green verdicts,
  final budget 23.33M/25M raw tokens recorded.

## Incident summary

| # | Incident | Root cause | Resolution |
|---|---|---|---|
| 1 | Budget cap blown by one stage | Cache reads counted at full weight | Cap raised; weighting fix noted as follow-up |
| 2 | Sol verifier died in 99s | OpenAI capacity (transient) | Retry succeeded; scanner pattern added |
| 3 | Verifier dispatch hung caller, agent killed | stderr leak in new claude pipeline + group SIGTERM | `a6f46ae`; capture spawn output to file, never pipe |
| 4 | Fable dead: session limit | Anthropic 5-hour window | Waited for reset |
| 5 | Fable dead: "usage credits required" | Fable outage (initially read as subscription drop) | Opus substituted for stages 18-20; Fable reinstated for 21 |
| 6 | Stage 21 FAIL | Orchestrator card error (essay-render criterion impossible by repo convention) | Card amended, re-verified |

## Observations for the write-up

- Cross-family verification earned its keep twice: Sol's stage-17
  re-derivation was genuinely independent mathematics, and its stage-21
  FAIL caught an orchestrator error no self-review would have.
- Raw token totals are not comparable across families: Claude-family
  figures include prompt-cache reads at full weight (Fable's stage-17
  worker shows 3.31M; Sol's equivalent stages show ~140-155k). Weighting
  cache reads at their true cost fraction in `claude-token-log.sh` is
  the outstanding fix; until then the by-model dashboard rollup
  overstates Claude spend by roughly an order of magnitude.
- Neither worker nor verifier sandboxes had a browser for most stages,
  so interactive-visual criteria passed on code mechanism, independent
  maths, and worker smoke records. A single real-GPU eyeball of
  `/#/logistic-mandelbrot` covers the accumulated visual debt: fps,
  camera feel, marker highlighting, cascade splits (discrete, not a
  fade), plane alignment.
- Model availability is the dominant operational risk on subscription
  billing: of six incidents, three were availability. The stage card's
  one-line Worker/Verifier fields made mid-run substitution trivial —
  the whole Fable→Opus→Fable dance was three one-line card edits.
- Every stage was implemented and verified by frontier models
  end-to-end; the orchestrator's contributions were card authoring,
  dispatch, budget accounting, incident response, and commits. Total
  wall clock from first worker dispatch to the stage-21 re-verify:
  about 4.5 hours, including the 50-minute limit outage.

## Commit chain (emergence-lab)

| Commit | Stage | Author |
|---|---|---|
| `f8ea387` | Cards 17-21 authored | Claude Fable 5 |
| `4fc6252` | 17: sampler + kernel | Claude Fable 5 (verify: Sol) |
| `922da5e` | Role swap to Opus | Claude Opus 4.8 |
| `63f2fee` | 18: orbit3d point cloud | GPT-5.6 Sol (verify: Opus) |
| `eed6f5c` | 19: camera + c-marker | GPT-5.6 Sol (verify: Opus) |
| `97830da` | 20: cascade animations | GPT-5.6 Sol (verify: Opus) |
| `c05da3c` | Fable reinstated for 21 | Claude Fable 5 |
| `93c09c1` | Card 21 criterion amended | Claude Fable 5 |
| `9c09efc` | 21: gallery polish | Claude Fable 5 (verify: Sol) |

autometta fixes this run: `557f225`, `de4c1b1`, `0d90d89`, `b907207`,
`a6f46ae`; mcp-hub: `65a9a3e`.
