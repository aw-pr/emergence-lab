# Logistic Mandelbrot Hybrid Surface Implementation Plan

> **For Claude:** Use `${SUPERPOWERS_SKILLS_ROOT}/skills/collaboration/executing-plans/SKILL.md` to implement this plan task-by-task.

**Goal:** Add an optional hybrid rendering mode that turns stable Logistic Mandelbrot attractor branches into lit glass sheets while retaining the chaotic region as the existing point cloud.

**Architecture:** Keep the reviewed kernel interface unchanged. Cloud mode continues through the existing reservoir-sampled point path. Hybrid mode samples a capped regular c-grid, sorts each detected period-q orbit into q height-ranked sheets, builds triangles only between compatible neighbouring cells, and draws unresolved cells as points. A depth attachment supports opaque surfaces; opacity below 1 uses order-independent additive glass layering with a Fresnel rim.

**Tech Stack:** TypeScript 6, raw WebGL2, Vite 6, Node test runner, Playwright.

---

## Fixed product decisions

- Add `Geometry: Cloud | Hybrid surface` to the existing simulation. Do not add another gallery card or kernel.
- Keep `cloud` as the factory default so the released view is unchanged until visual review.
- Add `Surface opacity`, default `0.40`, minimum `0.1`, maximum `1`, step `0.05`.
- At opacity `1`, draw an opaque, depth-writing surface. Below `1`, draw luminous glass with depth testing, no depth writes, premultiplied additive energy, and a Fresnel edge.
- Mesh only stable detected periods. Escaped, chaotic, under-sampled, and discontinuous regions remain absent from the mesh and continue as points.
- A surface is a collection of open branching sheets. Do not invent a watertight shell, thickness, refraction, or a volume.
- Keep all current colour modes, camera controls, the ground plane, sweep, cycle phase, and tone mapping.
- Do not change `docs/INTERFACE.md`, presets, defaults beyond the two new controls, thumbnails, publishing, or Promo Flow.

## Performance and correctness budgets

- Surface cell ceilings by the existing quality tier: 128² performance, 192² balanced, 256² high, 384² ultra, 512² extreme.
- The default extreme profile must stay at or below 512² sampled cells and 600,000 triangles.
- Sampling remains time-sliced with the existing 8 ms build slices.
- Cloud mode must retain its current point budgets and draw path.
- Hybrid mode must finish building within the targeted Playwright test timeout on the development Mac and expose its build/triangle state through canvas data attributes.
- Every index must address an emitted vertex. No triangle may cross an escaped cell, mix detected periods, or exceed the height-jump threshold.

### Task 1: Add the rendering controls and regression tests

**Files:**
- Modify: `src/sims/logistic-mandelbrot/kernel.ts`
- Modify: `src/sims/logistic-mandelbrot/kernel.test.cjs`
- Modify: `src/app/simView.ts`

**Step 1: Write failing schema assertions**

Extend the metadata test to require:

```js
assert.deepEqual(geometryMode.options, ["cloud", "hybrid"]);
assert.equal(geometryMode.default, "cloud");
assert.deepEqual(
  [surfaceOpacity.default, surfaceOpacity.min, surfaceOpacity.max, surfaceOpacity.step],
  [0.4, 0.1, 1, 0.05],
);
```

**Step 2: Run the focused kernel test**

Run: `npm run build:test && node --test src/sims/logistic-mandelbrot/kernel.test.cjs`

Expected: FAIL because the descriptors do not exist.

**Step 3: Add the descriptors**

Put `geometryMode` and `surfaceOpacity` at the start of the View descriptors. Add both keys to `VIEW_PARAM_KEYS["logistic-mandelbrot"]` so they appear together at the top of the controls.

**Step 4: Re-run the focused test**

Expected: PASS.

### Task 2: Build deterministic period-gated sheet topology

**Files:**
- Create: `src/app/orbitSurface.ts`
- Modify: `src/sims/logistic-mandelbrot/kernel.test.cjs`
- Modify: `tsconfig.test.json`

**Step 1: Define a pure topology boundary**

Export data-only interfaces and one pure builder. It accepts regular-grid cell samples and returns compact typed arrays:

```ts
export interface OrbitSurfaceCells {
  width: number;
  height: number;
  sampleCount: number;
  samples: Float32Array;
  periods: Int16Array;
  interiors: Float32Array;
  boundaries: Float32Array;
  escaped: Uint8Array;
}

export interface OrbitSurfaceMesh {
  positions: Float32Array;
  periods: Float32Array;
  interiors: Float32Array;
  boundaries: Float32Array;
  ranks: Float32Array;
  indices: Uint32Array;
}
```

**Step 2: Write failing fixtures**

Add tests for a 2x2 period-1 grid, a 2x2 period-2 grid with phase-shifted samples, a mixed-period seam, an escaped corner, a period larger than `sampleCount`, and a large height discontinuity.

Assertions must prove deterministic output, sorted rank matching, finite values, in-range indices, one and two sheet counts, and rejection of every forbidden triangle.

**Step 3: Include the pure module in the test build**

Add `src/app/orbitSurface.ts` to `tsconfig.test.json` and require `.test-build/app/orbitSurface.js` from the existing Logistic Mandelbrot test.

**Step 4: Implement the minimal builder**

For each usable cell, take the first q samples where `0 < q <= sampleCount`, sort them ascending, and emit q vertices. For each grid quad, consider its two triangles independently. Emit a rank only when all three cells have the same q and `max(height) - min(height)` is no greater than the exported threshold. Period zero, escaped, and under-sampled cells emit no surface vertices.

**Step 5: Run the focused test**

Expected: PASS with deterministic typed-array output.

### Task 3: Add the capped hybrid build path

**Files:**
- Modify: `src/app/orbit3d.ts`
- Modify: `src/app/webglRenderer.ts`

**Step 1: Add geometry mode to the rebuild key**

Changing Cloud to Hybrid must cancel and restart the build. Changing only opacity must redraw without rebuilding.

**Step 2: Preserve Cloud byte-for-byte where practical**

Keep the current reservoir sample dimensions, point budgets, compaction, attributes, and point ordering for `cloud`.

**Step 3: Sample a regular grid for Hybrid**

Select the capped grid from the existing input cell tier. Reuse `sampleAttractorCell`, the 8 ms timer slices, boundary-distance calculation, and sample-major point layout. Retain per-cell samples long enough to call the pure surface builder. Do not reservoir-sample the hybrid grid because adjacency is the topology.

**Step 4: Keep the particulate region**

Upload the point attributes for hybrid cells, but make the point shader reject detected-period points in Hybrid. Period-zero chaotic/unresolved samples remain visible and continue to respect `pointDensity`.

**Step 5: Expose build evidence**

Extend `Orbit3DStats` and the canvas dataset with geometry mode, triangle count, surface availability, and build state. Real-slice-only has no 2D adjacency, so report zero triangles and draw the cloud curtain.

### Task 4: Draw opaque and glass surfaces safely

**Files:**
- Modify: `src/app/orbit3d.ts`

**Step 1: Add optional surface resources**

Create a dedicated program, VAO, vertex attribute buffers, and `ELEMENT_ARRAY_BUFFER`. Surface resource failure must disable only the surface and fall back to Cloud, not disable the whole orbit3d renderer.

**Step 2: Add and own the depth attachment**

Attach a `DEPTH_COMPONENT16` renderbuffer to the existing RGBA16F accumulation framebuffer. Check framebuffer completeness and delete the renderbuffer during resize/failure/destroy.

**Step 3: Implement the shader**

Reuse the current world transform and colour semantics. Derive two-sided normals from `dFdx`/`dFdy`, light with a restrained key/fill, and add a view-dependent cyan-white Fresnel edge. Carry period, interior multiplier, boundary distance, and rank so existing palette/sweep/cascade semantics remain available.

**Step 4: Implement the two material paths**

At opacity `1`:

```ts
gl.disable(gl.BLEND);
gl.enable(gl.DEPTH_TEST);
gl.depthMask(true);
```

Below `1`:

```ts
gl.enable(gl.BLEND);
gl.blendFunc(gl.ONE, gl.ONE);
gl.enable(gl.DEPTH_TEST);
gl.depthMask(false);
```

The glass fragment output must premultiply its HDR energy by opacity. Restore depth/blend state before the existing point and tone-map passes.

**Step 5: Respect partial reveal and fallback**

Use the rank attribute plus `visibleIterations` to hide whole rank-matched triangles during cascade reveal. If the surface or depth target is unavailable, draw the existing cloud and report the fallback in the dataset.

### Task 5: Add browser evidence and user-facing copy

**Files:**
- Modify: `e2e/smoke.spec.ts`
- Modify: `essays/logistic-mandelbrot.md`

**Step 1: Add a targeted Playwright test**

Load `/#/logistic-mandelbrot`, skip only when WebGL2 is unavailable, select Hybrid, and wait for `data-orbit3d-build="complete"`. Assert triangle count is positive and below 600,000, no GL/console error occurs, and the geometry dataset says `hybrid`.

**Step 2: Exercise both material paths**

Set opacity to `0.40`, capture `e2e/artifacts/smoke/logistic-mandelbrot-hybrid-glass.png`, then set it to `1` and capture the opaque comparison. Assert changing opacity does not return the build state to `building`.

**Step 3: Exercise fallback**

Switch to real-slice-only and assert zero surface triangles with a working point curtain. Switch back to Cloud and assert the original point budget path returns.

**Step 4: Update the essay**

Add a short paragraph explaining that stable periodic regions form open sheets while the chaotic boundary remains particulate, and that opacity moves between luminous glass and opaque surface.

### Task 6: Run the complete gate and hand off

**Files:**
- Modify only the files named in Tasks 1 to 5.
- Create as the final runtime action: `state/handoffs/26-logistic-mandelbrot-hybrid-surface.json`

**Step 1: Run focused tests**

Run: `npm run build:test && node --test src/sims/logistic-mandelbrot/kernel.test.cjs`

Expected: PASS.

Run: `npx playwright test e2e/smoke.spec.ts --grep "Logistic Mandelbrot hybrid surface"`

Expected: PASS with two comparison screenshots.

**Step 2: Run the repository gate**

Run: `npm run verify`

Expected: all tests, TypeScript, and Vite build PASS.

**Step 3: Inspect scope and resources**

Run: `git diff --check` and `git status --short`.

Expected: only the declared deliverables plus the ignored handoff envelope are changed; every new WebGL resource has a matching cleanup path.

**Step 4: Write the handoff envelope**

Report `pass` only when every command above passes. Otherwise report `partial` or `fail` with the exact blocker. Do not commit. Autometta makes one atomic worker-authored commit only after Fable returns a PASS artefact.
