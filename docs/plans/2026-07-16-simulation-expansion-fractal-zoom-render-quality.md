# Simulation Expansion, Fractal Zoom, and Render Quality Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Add two complementary emergence simulations, make Mandelbrot and Julia navigation feel immediate while preserving deep detail, and maximise every simulation's standalone and fullscreen graphical quality.

**Architecture:** Keep `docs/INTERFACE.md` v1.2.0 unchanged. First establish browser baselines, then separate display density, compute-grid density, post-processing, and fractal iteration depth into explicit quality policies aimed at large standalone canvases. Fractal gestures use low-resolution coalesced previews followed by one full-quality render; new simulations continue to satisfy the existing synchronous `SimKernel` contract.

**Tech Stack:** TypeScript 6, Vite 6, WebGL2 with Canvas 2D fallback, Node test runner, Playwright.

---

## Review conclusions

The live registry contains 16 kernels and 20 gallery cards (the strange-attractor kernel has five variants). The “12 simulations” text in `AGENTS.md` is stale, and `e2e/smoke.spec.ts` currently omits Physarum, Particle Life, and Cyclic CA.

The main rendering finding is that “resolution” is four separate controls:

1. **Display backing resolution**: CSS size multiplied by device pixel ratio, currently capped by render mode in `src/app/renderer.ts`.
2. **Compute-grid resolution**: capped by `RESOLUTION_TARGETS`, but currently starts from CSS pixels rather than device pixels. A large or high-DPI standalone canvas can therefore have a much denser display backing store than simulation field.
3. **Sampling quality**: the WebGL state texture itself uses `NEAREST`, but the fragment shader already performs manual bilinear sampling for field, smooth, and fractal modes. Canvas 2D mirrors this with image smoothing. This part should be preserved and tested rather than reimplemented.
4. **Fractal detail**: Mandelbrot and Julia recompute the complete CPU field synchronously on every wheel/pinch event, at display-pixel resolution and with a fixed iteration budget.

Increasing every number globally would regress interactivity and, for models such as Lenia, Physarum, DLA, and the sandpile, can also change the visible dynamics. The implementation must use per-simulation quality profiles and measured gates.

## Recommended simulation additions

| Candidate | Visual impact | New conceptual coverage | Contract/performance fit | Decision |
|---|---:|---:|---:|---|
| 2D Ising model | High | Statistical physics, phase transitions, criticality | Excellent: one channel, local updates | Add first |
| Kuramoto oscillators | High | Synchronisation and collective phase-locking | Excellent: O(N) global order parameter or local stencil | Add second |
| Wa-Tor predator-prey | High | Ecology and population cycles | Good, but overlaps the CA implementation pattern | Next candidate |
| Schelling segregation | Medium | Social and organisational tipping | Good technically; requires careful explanatory framing | Backlog |
| Neural cellular automata / Flow-Lenia | Very high | Learned local rules and regeneration | Large scope: trained assets, provenance, and a new validation story | Separate project stage |

The first release should therefore take the gallery from 16 to 18 kernels with Ising and Kuramoto. Wa-Tor is the best third addition if a broader ecology strand is wanted.

Primary references for implementation and copy:

- Metropolis et al., [Equation of State Calculations by Fast Computing Machines](https://www.osti.gov/biblio/4390578) for the Monte Carlo update method used by the Ising model.
- Acebrón et al., [The Kuramoto model: A simple paradigm for synchronization phenomena](https://doi.org/10.1103/RevModPhys.77.137) for the oscillator equation and order parameter.
- Dewdney, [Computer Recreations: Wa-Tor](https://www.scientificamerican.com/article/computer-recreations-1984-12/) for the deferred predator-prey model.
- Schelling, [Dynamic Models of Segregation](https://www.tandfonline.com/doi/abs/10.1080/0022250X.1971.9989794) for the deferred social model.
- [WebGL best practices](https://developer.mozilla.org/en-US/docs/Web/API/WebGL_API/WebGL_best_practices) for high-DPI sizing and GPU resource limits.

## Acceptance budgets

- Target viewports: desktop `1440x900 @2x`, large desktop/fullscreen `2560x1440 @2x`, and mobile `390x844 @3x`. Iframe dimensions are not an acceptance target.
- All routes: no console errors, correct non-zero display/grid sizes, and no texture allocation beyond reported WebGL limits.
- Stepping models: the default quality-first profile sustains at least 30 FPS at the desktop viewport and 24 FPS at large fullscreen. Lenia and Physarum may keep a lower compute grid if higher-resolution smoothing and post-processing produces a better result than adding cells.
- Fractal wheel/pinch: event bursts are coalesced to at most one preview compute per animation frame; a visible preview arrives within 100 ms on the benchmark machine; one full-quality render begins only after 120-160 ms idle.
- Fractal navigation: the complex coordinate under the pointer remains invariant to within `1e-10` for Mandelbrot and Julia across zoom-in and zoom-out tests.
- Final gate: `npm run verify`, full Playwright smoke, quality comparison artefacts, and regenerated thumbnails all pass before merging.

### Task 1: Establish complete route and quality baselines

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Create: `e2e/harness/quality.ts`
- Create: `e2e/quality.spec.ts`
- Modify: `package.json`

**Step 1: Write the failing registry-coverage smoke check**

Replace the hand-maintained 13-slug assumption with a browser-side read of `REGISTRY`, flattening variants only when testing cards and using unique slugs when testing kernels. Assert that the smoke set contains `physarum`, `particle-life`, and `cyclic-ca`.

**Step 2: Run the focused check and verify it exposes the gap**

Run: `npx playwright test e2e/smoke.spec.ts --grep "live route"`

Expected before the fix: the current suite only schedules 13 live-route tests.

**Step 3: Make route coverage registry-driven**

Add a small helper that evaluates:

```ts
const reg = await import("/src/app/registry.ts");
return reg.REGISTRY.map((entry) => entry.slug);
```

Use the result to exercise all 16 unique routes. Keep variant-card checks separate so the Lorenz-family routes are not lost.

**Step 4: Add an opt-in quality recorder**

In `e2e/harness/quality.ts`, collect for each route:

```ts
interface QualitySample {
  slug: string;
  backend: string;
  displaySize: [number, number];
  gridSize: [number, number];
  medianFps: number;
  p95FrameMs: number;
}
```

Sample `requestAnimationFrame` intervals after a warm-up, read `data-display-size` and `data-render-size`, and write JSON/screenshots only under ignored `e2e/artifacts/quality/`.

**Step 5: Add the command**

Add:

```json
"test:quality": "QUALITY=1 playwright test e2e/quality.spec.ts"
```

The baseline recorder must fail only on invalid/non-finite measurements, not on machine-specific FPS.

**Step 6: Capture the pre-change baseline**

Run: `npm run test:quality`

Expected: JSON and screenshots for all 16 slugs at the desktop and large-fullscreen viewports.

**Step 7: Commit**

```bash
git add e2e/smoke.spec.ts e2e/harness/quality.ts e2e/quality.spec.ts package.json
git commit --author="$(agent-whoami)" -m "test: baseline simulation render quality"
```

### Task 2: Make fractal view transforms shared and testable

**Files:**
- Create: `src/app/fractalView.ts`
- Modify: `src/app/fractalCanvas.ts`
- Create: `e2e/fractal-interactions.spec.ts`

**Step 1: Write failing pointer-invariance tests**

For Mandelbrot and Julia, load a route, record the centre and zoom controls, wheel at an off-centre canvas point, and reconstruct the complex coordinate before and after. Assert the coordinate is stable within `1e-10`. Add a Burning Ship regression test because it shares the gesture module.

**Step 2: Run the focused tests**

Run: `npx playwright test e2e/fractal-interactions.spec.ts`

Expected: FAIL until the page exposes stable parameter selectors and shared transform helpers.

**Step 3: Extract pure view maths**

Move the per-slug pixel-to-complex, zoom-around-anchor, and pan calculations from `fractalCanvas.ts` into `fractalView.ts`. Use a discriminated `FractalViewKind` and one `ViewBounds` result so wheel, pinch, pan, and tests use identical maths.

**Step 4: Add stable control selectors**

Modify `src/app/controls.ts` while implementing this task if needed so generated parameter controls expose `data-param-key="zoom"`, `data-param-key="centerX"`, and `data-param-key="centerY"`. Keep this selector-only and behaviour-neutral.

**Step 5: Re-run the focused tests**

Run: `npx playwright test e2e/fractal-interactions.spec.ts`

Expected: PASS for all three fractals.

**Step 6: Commit**

```bash
git add src/app/fractalView.ts src/app/fractalCanvas.ts src/app/controls.ts e2e/fractal-interactions.spec.ts
git commit --author="$(agent-whoami)" -m "refactor: share tested fractal view transforms"
```

### Task 3: Add coalesced progressive fractal zoom

**Files:**
- Modify: `src/app/renderer.ts`
- Modify: `src/app/fractalCanvas.ts`
- Modify: `src/app/simView.ts`
- Modify: `src/app/controls.ts`
- Modify: `e2e/fractal-interactions.spec.ts`

**Step 1: Write the failing burst/coalescing test**

Dispatch a burst of 20 wheel events, instrument changes to `data-render-size`, and assert:

- intermediate renders are smaller than `data-display-size`;
- fewer recomputes occur than wheel events;
- the final render returns to the full display size after idle;
- the final centre/zoom equals the accumulated gesture, not merely the last event.

**Step 2: Add explicit preview and commit paths to `Renderer`**

Add behaviour equivalent to:

```ts
previewParams(next, scale = 0.35): void
commitParams(next): void
```

For fractal mode only, `previewParams` computes a grid scaled from display size while leaving the display backing store unchanged. `commitParams` restores scale `1`. Fixed-grid simulations must ignore this path.

**Step 3: Coalesce gesture events**

In `fractalCanvas.ts`:

- accumulate wheel and pinch transforms in local pending params;
- schedule at most one preview callback per `requestAnimationFrame`;
- restart a 140 ms settle timer for each event;
- issue exactly one full-quality commit when the timer expires;
- cancel RAF and timer handles in the returned disposer.

Keep the existing CSS translate preview for drag-pan and perform its full commit on pointer-up.

**Step 4: Keep controls and persistence in sync**

Add a non-persisting external-sync option to `ControlsPanel`. In `simView.ts`, use it for previews so the widgets update without callback loops or repeated local-storage writes; persist only the settled full-quality values.

**Step 5: Run focused and full checks**

Run: `npx playwright test e2e/fractal-interactions.spec.ts`

Expected: PASS, with one final full-resolution render after the burst.

Run: `npm run verify`

Expected: PASS, 203 or more kernel tests.

**Step 6: Commit**

```bash
git add src/app/renderer.ts src/app/fractalCanvas.ts src/app/simView.ts src/app/controls.ts e2e/fractal-interactions.spec.ts
git commit --author="$(agent-whoami)" -m "feat: render progressive fractal zoom previews"
```

### Task 4: Improve deep-zoom detail and navigation controls

**Files:**
- Create: `src/sims/fractal/detail.ts`
- Modify: `src/sims/mandelbrot/kernel.ts`
- Modify: `src/sims/mandelbrot/kernel.test.cjs`
- Modify: `src/sims/julia-set/kernel.ts`
- Modify: `src/sims/julia-set/kernel.test.cjs`
- Modify: `src/app/fractalCanvas.ts`
- Modify: `src/app/simView.ts`
- Modify: `src/app/styles.css`
- Modify: `e2e/fractal-interactions.spec.ts`

**Step 1: Write failing kernel tests for adaptive detail**

Add tests proving:

- zoom accepts values through `1e8`;
- `autoIterations=true` increases the effective iteration limit logarithmically with zoom;
- the effective limit is capped at 4096;
- `autoIterations=false` preserves the explicit base limit;
- identical params remain deterministic.

Use one shared helper in `src/sims/fractal/detail.ts`, imported by both kernels. Do not change the `SimKernel` interface.

**Step 2: Add Mandelbrot interior shortcuts**

Before the escape loop, detect the main cardioid and period-2 bulb. Add a fixture test showing those points remain interior while nearby exterior points still escape. This recovers enough CPU time to spend on deeper zoom detail.

**Step 3: Implement adaptive limits**

Use:

```ts
effective = auto
  ? Math.min(4096, base + Math.floor(48 * Math.log2(Math.max(1, zoom))))
  : base;
```

Expose `autoIterations` as a boolean defaulting to true. Raise the explicit `maxIterations` ceiling to 2048 and `zoom` ceiling to `1e8` for Mandelbrot and Julia.

**Step 4: Add compact navigation affordances**

Add an unobtrusive fractal overlay with:

- current zoom (`×1`, `×12.4K`, `×3.1M` formatting);
- `+` and `-` buttons centred on the canvas midpoint;
- a home button restoring only `centerX`, `centerY`, and `zoom` to factory values;
- keyboard `+`, `-`, and `0`, ignored while an editable control has focus.

All controls need accessible labels and must use the same shared view-transform path.

**Step 5: Verify kernel and interaction behaviour**

Run: `npm test -- --test-name-pattern="Mandelbrot|Julia|adaptive|interior"`

If the custom runner does not forward the filter, run: `npm test`.

Run: `npx playwright test e2e/fractal-interactions.spec.ts`

Expected: PASS, including keyboard, home, pointer anchoring, and deep-zoom checks.

**Step 6: Commit**

```bash
git add src/sims/fractal src/sims/mandelbrot src/sims/julia-set src/app/fractalCanvas.ts src/app/simView.ts src/app/styles.css e2e/fractal-interactions.spec.ts
git commit --author="$(agent-whoami)" -m "feat: deepen Mandelbrot and Julia navigation"
```

### Task 5: Separate display, compute, and post-processing quality policies

**Files:**
- Create: `src/app/qualityProfiles.ts`
- Modify: `src/app/renderer.ts`
- Modify: `src/app/simView.ts`
- Modify: `src/app/webglRenderer.ts`
- Modify: `src/app/canvasRenderer.ts`
- Create: `e2e/quality-policy.spec.ts`

**Step 1: Write failing profile tests**

Cover the policy cohorts:

- discrete grids preserve nearest-neighbour sampling;
- continuous fields use smooth sampling when supported;
- fractals compute per display pixel at settled quality;
- costly kernels can cap their maximum compute preset without lowering display backing density;
- requested sizes are clamped to backend texture and pixel budgets.

**Step 2: Add a pure `QualityProfile` table**

Define fields such as:

```ts
interface QualityProfile {
  defaultPreset: ResolutionPreset;
  maxPreset: ResolutionPreset;
  computeScale: number;
  displayDprCap: number;
  maxDisplayPixels: number;
  bloomScale: number;
}
```

Move `defaultResolutionFor` out of `simView.ts`. Keep per-slug decisions in this one table rather than adding more renderer switches.

**Step 3: Make compute scale explicit**

For continuous fields, allow the source grid to start above one cell per CSS pixel before applying the preset cap. Keep semantic grid models at scale `1` unless a benchmark proves that more cells preserve their dynamics. Continue to derive fractal grids from the display backing store.

**Step 4: Preserve GPU sampling and raise post-processing quality**

Keep the existing shader-side bilinear path for continuous `field`, `smooth`, and `fractal` modes and nearest sampling for cellular grids and particle occupancy. Make bloom/render-target scale profile-driven so high-quality standalone and fullscreen modes can use larger offscreen targets without forcing costly kernels to use larger compute grids. Canvas 2D must continue to mirror smooth versus discrete presentation.

**Step 5: Verify fallback and limits**

Run: `npx playwright test e2e/quality-policy.spec.ts`

Expected: PASS in WebGL2. Include a unit-level/browser-evaluated clamp test that does not require forcing Canvas 2D.

Run: `npm run verify`

Expected: PASS.

**Step 6: Commit**

```bash
git add src/app/qualityProfiles.ts src/app/renderer.ts src/app/simView.ts src/app/webglRenderer.ts src/app/canvasRenderer.ts e2e/quality-policy.spec.ts
git commit --author="$(agent-whoami)" -m "feat: add per-simulation render quality profiles"
```

### Task 6: Tune and verify all 16 existing simulations

**Files:**
- Modify: `src/app/qualityProfiles.ts`
- Modify only if evidence requires it: `src/sims/*/kernel.ts`
- Modify matching tests if a kernel default changes: `src/sims/*/kernel.test.cjs`
- Create: `docs/audits/render-quality-2026-07.md`

**Step 1: Run the post-policy quality matrix**

Run: `npm run test:quality`

Compare every route against Task 1 at the desktop, fullscreen, and mobile target viewports. Record display size, grid size, FPS, p95 frame time, and state-buffer bytes.

**Step 2: Tune by cohort**

- **Continuous fields:** Gray-Scott, BZ, Physarum, Lenia. Increase compute detail while meeting the quality-first frame budget; prefer the existing GPU bilinear sampling and higher-quality post-processing over brute-force cells for Physarum and Lenia.
- **Discrete grids:** sandpile, Life, DLA, ECA, Brian's Brain, Cyclic CA. Preserve visible cell semantics and completion/growth times; resolution is not automatically “better” if the pattern becomes too small or never fills the frame.
- **Particles/traces:** Boids, Particle Life, Lorenz variants. Prioritise display DPR, point/trail quality, and bloom target size; do not multiply agent count merely to match pixels.
- **Fractals:** Mandelbrot, Julia, Burning Ship. Use full display-pixel settled renders and progressive interaction previews.

**Step 3: Record evidence, not preferences**

In `docs/audits/render-quality-2026-07.md`, include a before/after table and a one-line reason for each final default or cap. Explicitly record any model whose compute resolution is intentionally unchanged.

**Step 4: Apply only measured default changes**

Update `qualityProfiles.ts`, and change kernel defaults only when necessary to preserve scale/density at a larger grid. Add or update metadata tests for every changed default.

**Step 5: Run all gates**

Run: `npm run verify`

Run: `npx playwright test e2e/smoke.spec.ts e2e/quality-policy.spec.ts e2e/fractal-interactions.spec.ts`

Expected: all pass; no route is below its agreed FPS floor.

**Step 6: Commit**

```bash
git add src/app/qualityProfiles.ts src/sims docs/audits/render-quality-2026-07.md
git commit --author="$(agent-whoami)" -m "tune: raise measured simulation render quality"
```

### Task 7: Add the 2D Ising model

**Files:**
- Create: `src/sims/ising-model/kernel.ts`
- Create: `src/sims/ising-model/kernel.test.cjs`
- Modify: `src/app/registry.ts`
- Modify: `src/app/renderModes.ts`
- Modify: `src/app/simView.ts`
- Modify: `src/app/presets.ts`
- Modify: `src/app/colormap.ts`
- Create: `essays/ising-model.md`

**Step 1: Write the standard failing kernel contract suite**

Cover metadata, shape, stable state reference, deterministic seeded initialisation, bounded output, parameter effects, destroy safety, and `selfTest()`.

Add physics-specific fixtures:

- low temperature grows aligned domains;
- high temperature remains disordered;
- positive/negative external field biases magnetisation;
- `applyImpulse` flips or aligns spins in a bounded brush.

**Step 2: Implement a deterministic Metropolis kernel**

Use a seeded PRNG, checkerboard or seeded random initial states, periodic boundaries, and one normalised output channel. Parameters:

```text
temperature, coupling, externalField, sweepsPerStep,
initialState(random/up/down/checkerboard), seed
```

Keep updates allocation-free and use a preallocated `Float32Array`.

**Step 3: Run the kernel tests**

Run: `npm test`

Expected: all existing tests plus the Ising tests pass.

**Step 4: Wire the app**

Add the `Statistical Physics` family, formula, presets around/above/below criticality, a diverging two-colour map, an appropriate quality profile, and pointer interaction.

**Step 5: Add the essay**

Explain local spin agreement, temperature/noise, magnetisation, and why large domains near the phase transition are emergent. Avoid claiming the toy lattice is a direct model of social behaviour.

**Step 6: Verify and commit**

Run: `npm run verify`

Run: `npx playwright test e2e/smoke.spec.ts --grep "ising"`

```bash
git add src/sims/ising-model src/app essays/ising-model.md
git commit --author="$(agent-whoami)" -m "feat: add Ising phase-transition simulation"
```

### Task 8: Add Kuramoto oscillators

**Files:**
- Create: `src/sims/kuramoto-oscillators/kernel.ts`
- Create: `src/sims/kuramoto-oscillators/kernel.test.cjs`
- Modify: `src/app/registry.ts`
- Modify: `src/app/renderModes.ts`
- Modify: `src/app/simView.ts`
- Modify: `src/app/presets.ts`
- Modify: `src/app/colormap.ts`
- Create: `essays/kuramoto-oscillators.md`

**Step 1: Write the standard failing kernel contract suite**

Add model-specific assertions:

- zero coupling preserves phase differences apart from natural frequencies;
- strong global coupling increases the order parameter;
- local coupling produces bounded phase waves;
- identical seed/params are deterministic;
- pointer impulse changes phase locally without allocation.

**Step 2: Implement the kernel**

Represent phase as `[0,1)` and preallocate phase, next-phase, and natural-frequency arrays. For global coupling, compute the Kuramoto order parameter in O(N):

```text
r cos(psi) = mean(cos(theta_i))
r sin(psi) = mean(sin(theta_i))
dtheta_i = omega_i + K r sin(psi - theta_i)
```

Support `global` and `local` coupling modes without an O(N²) loop. Parameters:

```text
coupling, frequencySpread, timestep, couplingMode, noise, seed
```

**Step 3: Run the kernel tests**

Run: `npm test`

Expected: all tests pass.

**Step 4: Wire the app**

Add the `Synchronisation` family, cyclic phase colour map, weak/critical/locked/local-wave presets, formula, and quality profile. Use smooth field rendering.

**Step 5: Add the essay and verify**

Explain the order parameter and the transition from incoherence to phase locking, with examples such as coupled oscillators but without overclaiming real-world equivalence.

Run: `npm run verify`

Run: `npx playwright test e2e/smoke.spec.ts --grep "kuramoto"`

**Step 6: Commit**

```bash
git add src/sims/kuramoto-oscillators src/app essays/kuramoto-oscillators.md
git commit --author="$(agent-whoami)" -m "feat: add Kuramoto synchronisation simulation"
```

### Task 9: Refresh gallery artefacts, docs, and final evidence

**Files:**
- Modify: `public/thumbnails/*.png`
- Modify: `README.md`
- Modify: `AGENTS.md`
- Modify: `docs/todo.md` only for current, non-historical statements
- Modify: `docs/audits/render-quality-2026-07.md`

**Step 1: Regenerate thumbnails**

Run: `node scripts/generate-thumbnails.mjs`

Expected: updated images for changed defaults plus new Ising and Kuramoto images.

**Step 2: Review the thumbnails**

Check that each new card is non-empty, visually distinct, and representative of its default. Re-tune a preset/default rather than hand-editing generated PNGs.

**Step 3: Update counts and descriptions**

Change current documentation from 16 kernels to 18 and remove the stale “12 simulations” phase wording. Do not rewrite historical changelog entries solely to change old counts.

**Step 4: Run the complete release gate**

Run: `npm run verify`

Run: `npx playwright test e2e/smoke.spec.ts e2e/fractal-interactions.spec.ts e2e/quality-policy.spec.ts`

Run: `npm run test:quality`

Expected: all checks pass; the audit contains before/after evidence for all 18 kernels.

**Step 5: Test standalone and fullscreen layouts manually**

Serve the production build with `npm run preview` and test normal desktop, large-window, fullscreen, and mobile-responsive layouts. Check zoom, pinch, drag, fullscreen transitions, resize, and keyboard focus. Iframe-specific behaviour is explicitly deferred.

**Step 6: Commit**

```bash
git add public/thumbnails README.md AGENTS.md docs/todo.md docs/audits/render-quality-2026-07.md
git commit --author="$(agent-whoami)" -m "docs: refresh expanded simulation gallery"
```

## Decision gate after Task 6

If the progressive preview appears within 100 ms but the settled Mandelbrot/Julia render still blocks the main thread for more than 1.5 seconds at the desktop viewport, stop before adding a direct GPU bypass. Write a separate contract proposal comparing:

1. an internal Worker-backed fractal kernel using the existing double-buffer allowance; and
2. a versioned GPU-resident render surface that changes the kernel-renderer boundary.

Do not quietly special-case direct fractal shaders in the renderer: the current `Float32Array` interface is an explicit reviewed boundary.
