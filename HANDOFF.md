# HANDOFF.md

> **Status (2026-06-06b):** Per-sim tuning pass (operator requests): **Boids** flock (wander 0.12→0.05, stronger align/cohesion) instead of looking like noise; **Sandpile** fills the screen (2M pile + much higher per-step topple throughput, settles in ~30s at the default speed of 1); **DLA** defaults to dense coral and **self-randomises each run** (fresh seed unless a numeric `seed` param is passed); **Game of Life** gains a deterministic **spark** re-seed so it stays lively past 1500 iters instead of freezing to ash (flux ~0.13 vs 0.0 at iter 3000); **Burning Ship** opens on the **Mast detail** view. `npm run verify` green (118 tests), default Playwright suite headless (16 pass, 3 sweeps opt-in). All changes visually verified via Playwright screenshots. **Published** to `public/main` (`aw-pr`) at the clean tip `417776b`.
>
> **Branch model (read this):** `HANDOFF.md` is **dev-only** — it must never reach `main`/`publish`/`public` (the `pre-push` guard enforces it via `publishguard.privatefile`). `dev` = `main` + this single HANDOFF commit; `main` (site/Netlify) and `publish` (→ `public/main`) are kept HANDOFF-free. To promote dev work: commit on `dev`, then bring the non-HANDOFF changes onto `main` (rebase the HANDOFF commit to the tip and fast-forward `main` to its parent, or `git checkout dev -- <paths>` excluding `HANDOFF.md`), then `git publish`. Do not `git merge dev` into `main`/`publish`.
>
> **Prior (2026-06-06):** Playwright interestingness-sweep harness added under `e2e/` (`SWEEP=1 npx playwright test`); measured Gray-Scott F/k surface → **fixed the dead "Waves" preset** (rendered empty, score 0.000 → 0.831) and **densified "Spots"** (0.669 → 0.743), see `docs/sweeps/gray-scott-interestingness.md`. **Owed live-browser smoke paid**: all 12 routes load+run, DLA/sandpile/boids visually verified.
>
> **Prior (2026-06-01):** 7-commit hone pass on `dev` (DLA/sandpile/boids reworked, reset-to-defaults fix, per-sim grid/speed defaults, family intros+equations); `npm run verify` green, unpushed; live per-sim browser smoke owed (now done above).

## Phase: hone

emergence-lab is in the **hone phase** — refinement, parameter tuning,
performance, and UX polish on a working set of 12 simulations. There is no
per-model ownership of the repo: any agent edits whatever a task needs, and
multi-agent work runs through autometta when wanted. See `MODELS.md`.

## Current state

A solid set of simulations works. The `npm run verify` gate is green
(typecheck + kernel tests + production build). The WebGL2 renderer path is
landed and active by default; the Canvas2D path remains as a fallback.

emergence-lab is the first real adopter of the **autometta** dispatch loop
(`docs/dispatch-contract.md`, vendored from `~/repos/autometta`). Stage cards
under `docs/stages/` drive a worker / verifier cycle with cross-family
verification (Codex GPT-5.3 worker, Claude Sonnet 4.6 verifier) and the
orchestrator commits worker output on verifier-pass.

## Implemented simulations

Gray-Scott, Abelian sandpile, Game of Life, Belousov-Zhabotinsky, Boids,
Lorenz attractor, Diffusion-limited aggregation, Elementary cellular
automata, Brian's Brain, Mandelbrot, Julia set, Burning Ship. Kernel tests
live beside kernels as `src/sims/**/kernel.test.cjs`.

## Recent activity (2026-06-06b per-sim tuning: boids/sandpile/DLA/GoL/burning-ship)

Operator-requested tuning across five sims. Each landed as its own atomic commit;
all changes verified by Playwright screenshots and the kernel-test gate.

- **Boids — flocking.** `WANDER_STRENGTH 0.12 → 0.05` (the wander was washing the
  flock out into uniform noise), plus stronger `alignment 0.05→0.09`, `cohesion
  0.005→0.011`, wider `visualRadius 28→34`. The swarm now forms visible density
  streams/clumps instead of a uniform field.
- **Sandpile — fills the screen.** The pile looked small because it relaxed
  *slowly*, not because it was under-grained. `initialPile 1.5M→2M`,
  `topplesPerStep 500k→1.5M` (cap → 3M). The bigger per-step topple budget is
  what does the work, so the mandala fills most of the canvas height in ~30s
  even at the default simulation speed of **1** (the slider goes to 16 to speed
  it up). [The default speed briefly shipped at 12 in this pass, then dropped
  back to 1 on operator request.]
- **DLA — dense coral + per-run randomisation.** Defaults `stickiness 1→0.45`,
  `seedCount 1→4` (a fuller coral). The kernel now draws a **fresh random seed
  each init**, so every run/reset grows a different cluster — *unless* a numeric
  `seed` param is supplied, which keeps it deterministic (the kernel tests pass
  `seed`, the app omits it). This is a deliberate, scoped relaxation of the
  "same params ⇒ identical state" note in `docs/INTERFACE.md` for DLA only; the
  interface *shape* is unchanged.
- **Game of Life — longevity.** Added a `sparkRate` param (default 0.04, set 0
  for purist B3/S23): every 24 generations a sparse, **deterministic** layer of
  fresh cells is sprinkled in, so the board keeps spawning gliders forever.
  Measured: without spark, frame-to-frame flux collapses to 0.000 by iter 3000
  (dead ash); with spark it holds ~0.12–0.17. Stays fully deterministic.
- **Burning Ship — default view.** Kernel defaults moved to the Mast-detail
  regime (`centerX -1.755, centerY -0.03, zoom 14, maxIter 260`). The "Harbour
  view" preset returns to the whole ship. (localStorage caveat: existing visitors
  see it after Reset-to-defaults + reload.)

## Recent activity (2026-06-06 interestingness-sweep harness + Gray-Scott tuning)

Added a **Playwright interestingness-sweep harness** (`e2e/`) that tunes by
measurement rather than eyeballing. It drives the kernels headlessly through the
Vite dev server: imports `src/app/registry.ts` in the page, injects a parameter
set, steps the kernel deterministically, and scores the **float field** (not
rendered pixels — colour/GPU/timing-independent, so reproducible) on four
metrics: frame entropy, spatial autocorrelation, temporal flux, non-background
coverage, combined into one composite (`e2e/harness/metrics.ts`).

- **No production code touched by the harness** — `e2e/**` is outside both
  tsconfigs, so `npm run verify` is unaffected. Run sweeps with
  `SWEEP=1 npx playwright test`; default suite skips the heavy sweeps.
- **Gray-Scott (priority kernel) measured + retuned**, recorded with deltas in
  `docs/sweeps/gray-scott-interestingness.md`:
  - **Waves** preset was **dead** — `F=0.014,k=0.045` sits in the dying zone and
    rendered an empty field (score **0.000**). Retuned to the genuine
    travelling-wave regime `F=0.018,k=0.0487` (**0.831**, the sweep's top set, a
    full field of pulsing cells). Defect fix.
  - **Spots** densified `F=0.030,k=0.062 → 0.026,0.0597` (**0.669 → 0.743**): a
    full hexagonal lattice instead of sparse dots with an empty centre.
- **Boids / Lorenz swept, not promoted** (reasoning in the doc): the occupancy
  lens is wrong for a sparse swarm (Boids interest is velocity coherence — a
  velocity order-parameter metric is the right follow-up); Lorenz's full butterfly
  needs `rho≈37`, but `rho=28` is canonical and "Wide wings" already covers the
  full-butterfly want, and a single trajectory snapshot is timing-sensitive.
- **Owed live-browser smoke paid** (`e2e/smoke.spec.ts`): all 12 routes load with
  a renderer backend and the stepping sims advance; DLA grows an isotropic
  branching dendrite (fill plateaus ~0.16, no star artifact), sandpile fills a
  360² Ultra-scale grid, boids stay responsive and spread at 5k **and** 12k.
  Screenshots land under `e2e/artifacts/smoke/` (git-ignored).

`npm run verify` green (118 kernel tests + types + build). Default Playwright
suite headless: 16 pass, 3 sweeps skipped (opt-in).

## Recent activity (2026-06-01 hone: defaults, kernels, reset fix, metadata)

Operator-driven single session (not autometta — the work converged on shared
files `simView.ts` / `presets.ts` / `controls.ts`, so parallel workers would
have collided; flagged and done inline). Seven atomic commits on `dev`,
`b5940dc..786cbda`, author = Claude Opus 4.8:

| SHA | Concern |
|---|---|
| `b5940dc` | DLA: cluster-tracking circle spawn + **radial** inward bias + kill/edge-stop. Fixes the solid-disc default, the runaway single tendril, and the diagonal-**star** artifact (the first inward bias snapped to the dominant axis → funnelled onto diagonals). |
| `9c58daf` | Abelian sandpile: channel range `[0,12]→[0,4]` (vivid), drip `4→1`, pile/topple ceilings raised so the mandala grows large. |
| `3d9d97e` | Boids: uniform **spatial-grid** neighbour search + per-boid neighbour cap (48) so the tab can't freeze; count clamp `1200→40000` (default `2000→5000`); `visualRadius 12→28` so it actually flocks; **wander noise** + looser cohesion to stop rigid blobs; glyph `16→6`. |
| `d1c94b0` | Presets retuned (DLA new semantics; Game of Life maze seeds sparsely → corridors not noise; boids flock on the real grid). |
| `c4de8c1` | **Reset-to-defaults fix**: `initialResolution` was read from localStorage (so reset restored the *persisted* grid quality) and param reset used raw schema defaults (ignoring per-sim overrides). View now passes explicit factory params + resolution that reset uses. |
| `c571e0b` | Per-sim defaults: Lorenz / elementary CA / Game of Life / DLA / sandpile → **Ultra** grid; Lorenz+CA 1.5×, sandpile 5×, boids 3× (boids gets a wider "swarm" speed control). |
| `786cbda` | Family tag + one-line intro under each title; KaTeX equation/rule for the models that have one. Includes the operator's README edit. |

**Verified**: `npm run verify` green (118 kernel tests + build). Behaviour
checked headlessly (no browser driver in this env): DLA isotropic across 16
angular sectors (no star) and fills to the edge-stop; boids self-organise
(local alignment plateaus ~0.45, not rigid) and scale (5k ≈ 60fps, 12k ≈ 30fps,
40k responsive); sandpile fills ~42% of the Ultra half-grid by ~30s. **No live
in-browser smoke this session.**

## Recent activity (2026-05-29 resolution-decoupling pass)

Decoupled the simulation **compute grid** from the **display canvas** to fix
variable performance across screen sizes and the reset-on-resize bug. Before,
the grid was the canvas pixel buffer, so expanding to the page grew the grid
(more cells → slower CPU stepping) and every resize called `kernel.init()`,
reseeding the sim.

Now:

- `Renderer` tracks display size and grid size separately
  (`src/app/renderer.ts`). `resizeDisplay()` (on the `ResizeObserver`) only
  resizes the backing store and lets the backend letterbox the existing grid —
  no reseed, iteration count preserved. `reinitGrid()` reallocates + reseeds and
  runs only on load, resolution change, param change, or manual reset.
- Grid size comes from a **resolution preset** (`performance` / `balanced` /
  `high` / `ultra`, cell-count caps in `RESOLUTION_TARGETS`). The preset is a
  **cost ceiling**: the grid fits the current window (~1 cell per CSS px →
  crisp) but never exceeds the cap, so small/medium windows render near 1:1 and
  a big window caps out (bounded blur + bounded step cost). Evaluated only on
  load / preset / reset / param — a plain resize keeps the grid (no reseed).
- Both backends gained `resizeDisplay()` + `setGrid()` and a centred,
  aspect-preserving letterbox via `containRect()` in
  `src/app/rendererBackend.ts`. WebGL2 sets `gl.viewport` to the contain rect
  over a black clear; Canvas2D renders to an offscreen grid-sized buffer and
  `drawImage`-scales it into the rect.
- New "Simulation resolution" control (`src/app/controls.ts`), persisted via
  `el:resolution:<slug>` (`src/app/persistence.ts`), wired in `src/app/simView.ts`.
  Reset-to-defaults clears it. Default quality is `balanced`, except
  **Gray-Scott = `performance`**; Gray-Scott also defaults to **1.0× speed**.
- **Fractal sims keep grid == display** (per-pixel detail), so the resolution
  control is hidden for them and they still recompute on resize, as before.
- **Sharpness/perf tuning**: dropped the WebGL 5-tap soft blur and switched to
  plain bilinear upscale; raised `RESOLUTION_TARGETS` (384²/640²/960²/1280²).

**Verified**: `npm run verify` green (118 kernel tests + build). Browser smoke
**passed** (Playwright, WebGL2 + Canvas2D fallback): no reset on resize/maximise,
letterbox without distortion, preset scales grid independent of window, small
window renders ~1:1, Ultra reaches 1:1 on a big window.

**Shipped** as 3 atomic commits (author = Claude Opus 4.8, committer = human):
`62430fa` docs (governance + INTERFACE v1.0.1), `6ca37d8` renderer (decouple +
presets + letterbox), `7e439cf` controls (resolution preset + persistence +
Gray-Scott defaults). Now on `main`, `dev`, and `publish`; mirrored to
`public/main` via `git publish`.

**Deploy gap**: Netlify builds from **`origin/main`** (`tw-one`), not `publish`.
`git publish` updated the public mirror but the site only deploys on a push to
`origin/main`. Next session: verify `origin/main` is at `7e439cf` and the
Netlify build ran; if not, `git switch main && git push origin main`. Possible
future change: repoint Netlify at `public/main`.

## Recent activity (2026-05-26 tuning-and-visual-fixes pass)

Eleven stages dispatched through the autometta loop on branch
`tuning-and-visual-fixes`. Commits landed in this order:

| Stage | Status | SHA | Notes |
|---|---|---|---|
| 01 iteration counter | completed | `93db71b` | renderer-side step counter in controls header |
| 02a fractal cycle defaults | completed | `61c0139` | 2× cycle speed default + slider max=5 (mandelbrot/julia/burning-ship) |
| 02b mandelbrot inferno | completed | `b7c678c` | operator hot-patch — palette default is renderer-owned, not in paramSchema |
| 02c fractal cycle bump | completed | `5fd49f4` | operator hot-patch — first 2× was 50s/cycle (still invisible); bumped to 0.2-0.3 = ~3-5s/cycle |
| 03 DLA revive | completed | `9c23f63` | spawn radius reduced so walkers reach the seed within budget |
| 04 boids polish | completed | `f65746d` | directional triangle glyphs, larger default point size — first stage on the new orchestrator-commit model |
| 05 math formula rendering | **verifier_failed** | `8863280` | KaTeX bundled and rendering on 5 sims; only criterion 6 (bundle-size report) was missed — paperwork, not substance |
| 06 GPU acceleration audit | completed | `ab97387` | written audit at `docs/audits/gpu-acceleration-audit.md` |
| 07 cycle units mismatch | completed | `024db3f` | unifies cycleSpeed units between CPU and WebGL2 render paths via `cycleSpeed * dt` |
| 08 fractal cycle defaults stale | completed | `870988b` | drops stale per-frame `cycleSpeed` overrides in `simView`/`presets`; cycling now visible at defaults |
| 09 fractal zoom (trackpad+mouse) | completed | `bd334ea` | mouse wheel ~1.6× per notch, `ctrlKey`+wheel pinch for macOS trackpad, Safari `gesturestart/change/end` |
| 10 julia default = Dense-spiral | completed | `510ccee` | Julia kernel defaults land on the former `filled-spiral` preset (cRe=-0.4, cIm=0.6, zoom=1.45, etc.); preset removed |
| 11 fractal drag-pan responsive | completed | `7d1f17a` | canvas `transform: translate3d` during drag, single `panByBitmapDelta` commit on `pointerup`, all 3 fractals |

The new dispatch-model commits (stages 04, 06, 07, 08, 09, 10, 11) carry
the canonical `<stage-id>: <headline>` subject prefix, author = worker
identity, and `Co-Authored-By: <verifier-identity>` trailer. Earlier
stages (01-03, 05) were worker self-commits made before the new model
was in effect locally.

## Open items

- **Live browser smoke for the 2026-06-01 pass — DONE (2026-06-06).** Paid via
  `e2e/smoke.spec.ts` (all 12 routes + DLA/sandpile/boids, screenshots eyeballed).
  Note: DLA fill plateaus around **0.16** at default params, a touch under the
  ~0.25 target but a clean isotropic dendrite (no star); nudge `INWARD_BIAS` /
  `stickiness` up if a denser cluster is wanted. Boids responsive at 5k and 12k.
- **Boids count ceiling.** Hard-clamped at 40000 (`MAX_BOID_COUNT`); smooth to
  ~12000, choppy-but-alive beyond. A literal "million" isn't feasible — flocking
  is an N-neighbour problem. Raising it further needs a coarser neighbour model.
- **These 7 commits are on `dev`, unpushed.** Same deploy gap as below applies
  (Netlify builds from `origin/main`). `HANDOFF.md` itself is left uncommitted
  by operator preference — fold it into the next upgrade's commit.
- **Resolution-decoupling roll-out / smoke.** The change is in shared renderer
  code so all 12 sims inherit it. Still to do: a manual browser pass per sim —
  confirm no reset on resize/fullscreen, letterbox without distortion, and
  sensible preset scaling. Spot-check cost-heavy sims (DLA, sandpile, boids) and
  confirm field/smooth modes (BZ, Lorenz) look right upscaled; consider a
  per-sim default preset other than `balanced` where warranted. Optional polish:
  bilinear upscaling for grid-mode sims so low presets look less blocky on big
  screens (currently nearest, intentionally crisp).
- **Stage 05 sits at `verifier_failed`.** The work is in the tree
  (commit `8863280`). Decided to leave the audit record honest rather
  than rerun for paperwork.
- **localStorage caveat.** Existing slider values persist via
  `el:values:<slug>` / `el:bounds:<slug>:*`. New schema defaults
  (cycle speed, Julia Dense-spiral params, Inferno palette) are only
  visible after **Reset to defaults** on each sim plus a hard reload.
- **macOS cron + claude verifier auth.** Cron-spawned `claude` CLI
  fails keychain access from non-Aqua launchd sessions ("Not logged
  in"), so verifiers must be dispatched from an interactive shell
  until the per-repo LaunchAgent lands. Follow-up card filed in
  autometta as `12-launchagent-heartbeat` (commit `a4fe6d2` on
  autometta `publish`); not yet implemented.
- **README + publish-guard work in progress (operator-driven).**
  Commit `f5d02cd` rewrote the README as a public landing and added
  MIT licence. The working tree carries further uncommitted publish-
  guard scaffolding (`scripts/install-guards.sh`, `scripts/git-hooks/`,
  `.publish-guard.local.example`, edits to `docs/PUBLISH-WORKFLOW.md`).
  Out of autometta scope; left for the next operator pass.
- **Phase 0 / Phase 1 / Phase 2 from earlier HANDOFF revisions
  are done.** Per-sim parameter review, slider min/max overrides,
  Reset-to-defaults button, even-distribution DLA walk direction,
  cycleSpeed unit-unification, fractal zoom/pan UX overhaul —
  all landed in this and the prior pass (commits before `82dbfd0`
  for phase 2, and `870988b..7d1f17a` for this pass's fractal polish).

## Autometta upstream landings during this pass

Bugs surfaced by running emergence-lab through the loop end-to-end,
landed on `~/repos/autometta` `publish` branch (= `public/main`).
Cellar reinstalled from the same tree, now at `9e282f3`:

| Autometta SHA | Concern |
|---|---|
| `4d51e77` | exec bit on `add-stage.sh` and `health-check.sh` |
| `a1ded4f` | installer defensively `chmod +x scripts/*.sh` |
| `d042ab7` | gitignore broadened from `.claude/settings.local.json` to `.claude/` |
| `f6bf91d` | tick.sh: artefact-check before stall-check; budget unit regex on bash 3.2 |
| `2f0a315` | adopter feedback memory: card input-vs-deliverable scope failure mode |
| `bc0650b` + `3df462c` + `93e0709` + `26f1d00` + `31e66e8` | orchestrator-commits-not-workers dispatch-model change (stage 07 upstream) |
| `a6063b5` | `autometta --version` reads from cellar VERSION file (stage 08 upstream) |
| `70e4b75` | `budget_check_caps` returns 0/1/2; halt_reason preserved (stage 09 upstream) |
| `2fac950` | token-usage tracking from worker/verifier logs (stage 10 upstream) |
| `1096581`..`6f87171` + `17d28c8` | central cost dashboard (stage 11 upstream, now complete) |
| `9e282f3` | **new**: `cd $repo_root` when spawning worker/verifier so codex/claude don't inherit cron's `$HOME` cwd (surfaced when emergence-lab stage 10 cron-dispatch died on the codex trust check) |
| `a4fe6d2` | **new**: stage card 12 — per-repo LaunchAgent heartbeat to replace cron on macOS (filed, not yet implemented) |

## Interface

`docs/INTERFACE.md` is at v1.0.1 (2026-05-29) — a documentation clarification
that compute resolution (the grid passed to `init()`) is renderer-chosen and
independent of canvas pixels; the interface surface is unchanged. It is a
reviewed boundary, no longer framed as owned by a single model. The user-bounds
+ persistence overlay (Phase 2),
renderer-side iteration counter, KaTeX formula rendering, palette
defaults, and the fractal zoom/pan UX overhaul are all implemented
as renderer-layer concerns without a contract change.

## Verification

```bash
npm run verify
```

Manual browser smoke routes (current Chrome or Safari):

```text
/#/gray-scott
/#/belousov-zhabotinsky
/#/lorenz-attractor
/#/mandelbrot
/#/game-of-life
/#/boids
/#/brians-brain
/#/diffusion-limited-aggregation
/#/abelian-sandpile
/#/julia-set
/#/burning-ship
/#/elementary-cellular-automata
```

Expected after this pass: nonblank canvas, WebGL2 path active, visible
motion within a few seconds at defaults, frame rate ≥30 fps at defaults,
slider min/max override + persistence work, Reset-to-defaults button
restores schema defaults, palette cycling is visibly fast on
Mandelbrot/Julia/Burning Ship under both CPU and WebGL2 paths,
Julia loads on the Dense-spiral c-parameter at default zoom,
mouse-wheel zoom advances ~1.6× per notch on the three fractal sims,
trackpad pinch (macOS, `ctrlKey + wheel` and Safari gesture events)
zooms around the cursor without page-zooming the browser, dragging
a fractal canvas translates the bitmap 1:1 with the cursor and only
re-runs the kernel once on release, KaTeX formulas render under the
title on Gray-Scott / Mandelbrot / Julia / Burning Ship / Lorenz,
DLA grows a visible cluster within ~30 seconds, iteration counter
appears next to fps on every sim.

## Publish notes

Clean squashed `main`; private history backed up outside the repo.
Publish-guard hooks are armed; `.publish-guard.local` is gitignored. No
git remote on emergence-lab yet. Full workflow in `docs/PUBLISH-WORKFLOW.md`.
