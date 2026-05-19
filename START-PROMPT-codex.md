# START-PROMPT-codex.md

> **Historical / retired.** The Codex kernel role has been retired. The full
> stack (`src/**`) is now owned by Cursor — see `START-PROMPT-cursor.md` and
> `MODELS.md`. This file is kept only as a record of the original kernel brief.

Paste the block below verbatim into a Codex session.

---

## Task: Gray-Scott reaction-diffusion kernel

You are building the first simulation kernel for the `emergence-lab` repository. Your task is strictly scoped: implement the Gray-Scott reaction-diffusion system as a TypeScript module.

### Contract

Read `docs/INTERFACE.md` (FINAL v1.0) before writing any code. It defines the `SimKernel` interface you must implement exactly. Do not deviate from the interface — the renderer depends on it and is built separately. Note in particular: `step()` is synchronous (no promises); `readState()` returns `Float32Array` only (never ImageData); and you must expose `paramSchema`, `channelRanges`, `channelLabels` and `name`, not just the numerics.

### File you may create or edit

```
src/sims/gray-scott/kernel.ts
```

That is the only file. Do not create any other files. Do not touch `src/app/**` or any file outside `src/sims/gray-scott/`.

### What to implement

Implement the Gray-Scott reaction-diffusion model on a 2D grid:

```
dU/dt = Du * laplacian(U) - U*V^2 + F*(1-U)
dV/dt = Dv * laplacian(V) + U*V^2 - (F+k)*V
```

- Use periodic boundary conditions (wrap-around grid).
- Use a fixed internal timestep (suggest 1.0); the `dt` argument to `step()` may be accepted but ignored.
- `channelCount` must be `2` (U in channel 0, V in channel 1), row-major, interleaved: `[U0, V0, U1, V1, ...]`.
- `readState()` must return a stable `Float32Array` reference (pre-allocated; do not allocate inside `readState()`).
- Initial conditions: U=1 everywhere, V=0 everywhere, with a small square patch of V=1 in the centre.
- Default params (all overridable via `SimParams`):
  - `Du`: 0.2097
  - `Dv`: 0.1050
  - `F`: 0.055
  - `k`: 0.062

### Required readonly contract members (v1.0)

Expose these exactly:

- `name = "Gray-Scott"`
- `channelCount = 2`
- `channelLabels = ["U", "V"]`
- `channelRanges = [[0, 1], [0, 1]]` (both fields are bounded to [0, 1])
- `paramSchema`: one `ParamDescriptor` per param, in this display order:
  - `{ key: "Du", label: "Diffusion U", type: "number", default: 0.2097, min: 0, max: 0.5, step: 0.001 }`
  - `{ key: "Dv", label: "Diffusion V", type: "number", default: 0.105, min: 0, max: 0.5, step: 0.001 }`
  - `{ key: "F",  label: "Feed rate",   type: "number", default: 0.055, min: 0, max: 0.1, step: 0.001 }`
  - `{ key: "k",  label: "Kill rate",   type: "number", default: 0.062, min: 0, max: 0.1, step: 0.001 }`

`init()` must apply `paramSchema` defaults for any key missing from `SimParams`.

### Determinism requirement

The kernel must be deterministic: identical `params`, identical `init()` call, identical sequence of `step()` calls must produce bit-identical `readState()` output. No `Math.random()` unless seeded and the seed is a param.

### Self-test

Export a standalone function alongside the class:

```typescript
export function selfTest(): boolean
```

It should: init a small grid (e.g. 32x32), run 100 steps, read state, and assert that at least one cell has U < 0.99 (i.e. the reaction has started). Return `true` if the assertion holds, `false` otherwise. Do not `throw`; return a boolean.

### Forbidden

- Do not import from `src/app/**`.
- Do not create `index.html`, `vite.config.ts`, or any config files.
- Do not install npm packages. Use only the TypeScript standard library and built-ins.
- Do not add a `main()` or top-level side effects.

### When you are done

The file `src/sims/gray-scott/kernel.ts` should export:
1. A class (name it `GrayScottKernel`) that implements `SimKernel`.
2. `export function selfTest(): boolean`.

That is all. No other exports, no other files.
