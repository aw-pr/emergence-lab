# Logistic-Mandelbrot GPU sampler — state and next actions

**Written:** 2026-08-15
**Branch:** `feat/logistic-mandelbrot-gpu-sampler` (worktree `../emergence-lab-gpu`, cut from `dev`)
**Stages:** 34 complete · 35 `verifier_failed` · 36 not dispatched

## Where this came from

The question was whether logistic-Mandelbrot has GPU acceleration. It has a GPU
*renderer* — `src/app/orbit3d.ts` is a full WebGL2 point-cloud renderer — but the
orbit *sampling* is CPU TypeScript, swept across `step()` calls under an
iteration budget (`src/sims/logistic-mandelbrot/kernel.ts:63-70`). At the
`extreme` preset that is 1920×1920 cells, which is the tens of seconds the
prebaked ELPC cloud exists to avoid. Stages 34-36 move that sampling onto the GPU.

Only four sims have any GPU compute path at all: Mandelbrot, Julia Set and
Burning Ship via `fractalKind()` (`src/app/webglRenderer.ts:2681`), plus
Kuramoto's ping-pong path. All 22 kernels are otherwise CPU.

**Naming trap, which has now misled twice.** The orbit iterated is the complex
quadratic map `z → z² + c` (`src/sims/logistic-mandelbrot/model.ts:154-158`) —
the ordinary Mandelbrot recurrence. "Logistic" describes what the reveal *plots*:
attractor samples arranged so the period-doubling cascade reads like a logistic
bifurcation diagram. It is not `x → rx(1-x)`.

## Stage 34 — complete (`94a049e`)

Verifier PASS 9/9, each criterion with evidence including a re-run of the script.

Deliverables: `scripts/spike-fp32-orbit.mjs`, `docs/spikes/2026-08-14-fp32-orbit-precision.md`.

Measured over 12,288 seeded cells (9,216 boundary-classified), at production
(warmup 1500, 8 samples) and baker (20000, 64) settings:

| Region | Max abs `zr` | p99 abs `zr` | Period mismatch |
|---|---|---|---|
| Stable interior | 1.133e-6 | 5.327e-7 | 0 / 3,072 |
| Boundary band | — | — | ~1.77% |

Recommendation: **go-with-mitigation**. Tolerances for stages 35 and 36 are
**2e-6** absolute per `zr` and **0.05%** maximum period-mismatch fraction, both
at production and baker settings.

The findings document pre-commits against the obvious cheat:

> If stage 35 instead sends the whole field to plain fp32, these tolerances
> should fail it. Raising the full-field value gate to about `2.7` or the period
> gate toward the observed `1.77%` boundary rate would merely encode visible
> disagreement as success. Use split-double arithmetic before relaxing those gates.

It also settled a trap worth remembering: `CONVERGENCE_TOLERANCE_SQ = 1e-18`
(`model.ts:47`) is a *squared* distance, so a separation of 1e-9. fp32 spacing
near magnitude 1 is ~1.2e-7, so in single precision that Brent-style early exit
degenerates into a test for exact bitwise equality.

## Stage 35 — verifier FAIL 6/10

Worker GPT-5.6 Sol (158k tokens), verifier Claude Opus 5 (4.19M tokens).
**Uncommitted**, in run worktree `../emergence-lab-gpu-run-35-logistic-mandelbrot-gpu-sampler`
on branch `autometta/35-logistic-mandelbrot-gpu-sampler`:

- `src/app/orbitSampler.ts` — new, 884 lines
- `src/app/orbit3d.ts` — +93/-81 across both files
- `src/app/webglRenderer.ts`

Passed: 1 (`npm run verify` green), 2 (protected files untouched), 5 (prebake
still wins), 6 (CPU fallback usable), 10 (no regression to Kuramoto, the three
GPU fractals, or camera/marker behaviour).

### The defect: the shader never compiles

`OrbitSampler.create(gl)` (`src/app/orbitSampler.ts:298`) returns `null` on an
M2 Max. `PERIOD_FRAGMENT_SHADER` (`orbitSampler.ts:171-242`) fails to compile
with two GLSL ES 3.00 errors:

1. `ERROR: 0:7: 'sampler2DArray' : No precision specified` — the declaration at
   `orbitSampler.ts:177` needs `precision highp sampler2DArray;`. Unlike
   `sampler2D`, `sampler2DArray` has no default precision in GLSL ES 3.00.
2. `ERROR: 0:82: 'sample' : Illegal use of reserved word` — the loop variable
   `int sample` at `orbitSampler.ts:211`. `sample` is reserved in GLSL ES 3.00.

`createProgram` throws at `orbitSampler.ts:812`, the `catch` at
`orbitSampler.ts:30` swallows it, `this.orbitSampler` stays null
(`orbit3d.ts:621`), and the entire `if (this.orbitSampler)` block at
`orbit3d.ts:1111-1133` is skipped. **Both passes still run on the CPU.**

This is why criteria 3, 4, 8 and 9 all fail: there are no parity figures, no
GPU cloud to compare visually, neither call site executes, and there is nothing
to time. The observed build was `orbit3dSampler="cpu-sampled"`, 1,164,769
points, ~3.1s — identical to pre-stage behaviour.

Note that `npm run verify` passed throughout. The fallback works exactly as
designed, so a green build proves nothing here. That is the whole reason this
stage carries a GUI verifier.

### A second, separate problem: criterion 7

`webglRenderer.ts:1280` now constructs `new Orbit3DPointCloud(gl, floatTargets !== null)`
unconditionally, where it previously read `floatTargets ? new Orbit3DPointCloud(gl) : null`.
So `supportsOrbit3d()` (`webglRenderer.ts:1765-1768`) stays true without float
targets, thanks to a new RGBA8 accumulation fallback (`orbit3d.ts:1559`, `:1564`).

Observed with the extension hidden: `simulationRenderer="gpu-orbit3d"`, never
`orbit3d-fallback-field`. The verifier's judgement — "defensible, but
unasked-for, and it retires a dataset value stage 36 expects to assert on."

This one is a design decision, not a bug. **It needs an operator call** (see
next actions), because stage 36's whole job is asserting on the four-way
fallback chain and this collapses it to three.

## Next actions, in order

1. **Fix the two shader errors.** Add `precision highp sampler2DArray;` at
   `orbitSampler.ts:177`; rename the `sample` loop variable at
   `orbitSampler.ts:211`. Both are one-liners. This is a re-brief of stage 35,
   not a new stage — the card's round-2 section should say plainly that the
   architecture is not in question and must not be rebuilt.
2. **Make the shader failure loud.** The `catch` at `orbitSampler.ts:30` turned
   two compile errors into a silent CPU fallback that passed `npm run verify`.
   Whatever the fallback does, a shader that fails to compile should surface —
   a console error at minimum, ideally a distinct `canvas.dataset` value. A
   silent fallback is how this cost a full 4.19M-token verification round.
3. **Decide the RGBA8 accumulation fallback** (criterion 7). Either keep it and
   amend stage 36's card so it asserts on three paths plus the new one, or
   revert `webglRenderer.ts:1280` to the conditional form so
   `orbit3d-fallback-field` stays reachable. Do not leave this for the stage-36
   worker to infer.
4. **Re-run stage 35's verifier** once 1-3 are done. Parity and visual
   comparison have never actually executed, so criteria 3, 4, 8 and 9 are
   untested rather than failed-on-merit. The split-double arithmetic the worker
   chose — the whole-field mitigation stage 34 recommended, rather than the
   easier hybrid of parking boundary cells on the CPU — is still unproven.
5. **Stage 36 stays undispatched.** Its `Assertions digest` is deliberately
   UNSET; the frozen block cannot be written until stage 35's numbers exist.
   The card carries an ORCHESTRATOR block explaining this.

## Environment notes that will bite

- **Dev server port.** `playwright.config.ts:31-33` sets
  `reuseExistingServer: !process.env.CI` against `localhost:5173`. A manual
  `npm run dev` on 5173 from a *different* worktree will be silently reused by
  the e2e suite, which then screenshots the wrong branch. Run manual servers on
  5174 (`npm run dev -- --port 5174 --strictPort`), or kill 5173 before any
  stage that drives Playwright.
- **`Verifier effort` is unset in cards 34-36**, with a comment saying why.
  Autometta's fix landed (`8a77b08`); the lines can be restored.

## Autometta defects found while running this

Both carded in `~/repos/autometta/examples/self-host/`:

- **`29-run-worktree-state-writable`** — open. Worktree-per-run dispatch
  symlinks the run worktree's `state/` outside the `workspace-write` sandbox, so
  a codex worker cannot write its handoff envelope and the stage stalls after
  doing all its work. Masked by `Requires GUI: true` cards, which run
  unsandboxed — which is why stage 35 wrote its envelope and stage 34 did not.
- **`30-effort-flags-ifs-wordsplit`** — fixed (`8a77b08`, `0cf4231`, `ae099a4`).
  `IFS=$'\n\t'` has no space, so `--effort high` reached the CLI as one argv
  element.

Also fixed outside the cards: `~/.phat-controller/config.yaml` had
`autometta_root` pinned to a Cellar version brew had removed, so spawns
resolved against a dead path and died with an empty log. Now points at
`/opt/homebrew/opt/autometta/libexec`, the stable symlink.

## Standing constraints

- `feat/logistic-mandelbrot-hybrid-surface` (worktree `../emergence-lab-surface`)
  is a parked experiment whose fate is undecided. Not a base, not a reference,
  not to be deleted. See `CLAUDE.md` / `AGENTS.md`.
- `src/sims/logistic-mandelbrot/model.ts` is the reference implementation and
  the parity oracle. If the GPU disagrees with it, the GPU is wrong.
- The CPU sampler, the ELPC format and `applyPrebaked()` all stay.
