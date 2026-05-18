# START-PROMPT-cursor.md

Paste the block below verbatim into a Cursor session.

---

## Task: Shared renderer and gallery UI

You are building the shared front end for the `emergence-lab` repository. Your task is strictly scoped to `src/app/**`.

### Contract

Read `docs/INTERFACE.md` (FINAL v1.0) before writing any code. It defines the `SimKernel` TypeScript interface that every simulation kernel implements. You consume this interface; you do not implement it and you do not modify it. Key v1.0 points you must rely on: `step()` is synchronous; `readState()` is `Float32Array` only, so you do the float-to-pixel mapping; normalise using `kernel.channelRanges`; label the legend from `kernel.channelLabels`; and build the controls panel generically from `kernel.paramSchema` (no per-sim UI code).

### Files you may create or edit

```
src/app/**
```

Everything under `src/app/` is yours. Do not touch `src/sims/**` or any file outside `src/app/`. Do not modify `docs/INTERFACE.md`.

### Stack

- **Vite** + **TypeScript**. The project does not have a framework yet; you may add React or keep it vanilla — choose what fits a canvas-heavy sim viewer best, but keep the dependency footprint minimal.
- Rendering: Canvas 2D or WebGL. WebGL preferred for performance (large grids update every frame).
- No CSS framework required; utility-first or plain CSS is fine.

### What to implement

#### 1. SimKernel loader

A dynamic import mechanism that loads a kernel by name. Kernels live at:

```
src/sims/<name>/kernel.ts
```

The loader should import the default or named export, verify it satisfies `SimKernel` (type-only check is fine), and return an instance. The renderer never imports kernel files directly; it always goes through the loader.

#### 2. Renderer

A canvas-based renderer that:

- Accepts a `SimKernel` instance.
- Calls `kernel.readState()` after each `kernel.step(dt)`.
- Maps the `Float32Array` state to pixel colours. Normalise each channel using `kernel.channelRanges[i]` (do not assume [0, 1]). For a 2-channel kernel, map the channels to a legible combined colour map; this must work for any `channelCount`, not just 2.
- Runs at `requestAnimationFrame` pace.
- Handles canvas resize: calls `kernel.init()` again with new dimensions and restarts.

#### 3. Controls panel

A simple UI panel (HTML or component) that:

- Shows the current simulation name.
- Exposes a play/pause toggle.
- Exposes a reset button (calls `kernel.init()` with current params).
- Exposes a step-rate slider (frames per animation frame, 1–10).
- Auto-generates per-sim parameter controls from `kernel.paramSchema`: a `number` descriptor renders a labelled slider using its `min`/`max`/`step`/`default`, `boolean` a checkbox, `enum` a dropdown from `options`. Changing any control calls `kernel.init()` with the updated `SimParams`. This is generic: no Gray-Scott-specific code.

#### 4. Gallery page

A landing/gallery view that lists available simulations by name. For now it only needs to list "Gray-Scott" as a placeholder (the kernel does not need to be loaded on the gallery page). Clicking a sim navigates to the renderer view for that sim.

Routing can be hash-based (`#/gray-scott`) or a minimal client-side router — keep it simple.

### Determinism and performance

- Do not put simulation logic in `src/app/**`. The renderer only calls the kernel interface; all numerics are the kernel's responsibility.
- Aim for 60 fps on a 512x512 grid with a 2-channel kernel on a modern laptop.

### Forbidden

- Do not create or edit `src/sims/**`.
- Do not modify `docs/INTERFACE.md`.
- Do not add server-side code.
- Do not hardcode params, channel counts, or value ranges for a specific kernel; the UI must work with any `SimKernel` via `paramSchema`, `channelCount`, `channelRanges` and `channelLabels`.

### When you are done

`src/app/` should contain at minimum:

- An entry point wired to `index.html` (or Vite's default).
- The renderer module.
- The controls panel.
- The gallery page.
- The kernel loader.

Running `npm run dev` should open a browser, show the gallery, and on clicking "Gray-Scott" load and run the kernel (once the kernel file exists at `src/sims/gray-scott/kernel.ts`).
