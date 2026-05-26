# Stage card 10-julia-default-dense-spiral: Make Julia kernel defaults land on the Dense-spiral preset

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Pure defaults change in one kernel + one test + one preset entry; Claude verifier confirms test-suite drift and visual default landing.

## Objective

The Julia kernel currently defaults to a dendrite seed (`cRe = -0.8, cIm = 0.156, zoom = 1, maxIterations = 128, palettePhase = 0`). The "Dense spiral" preset in `presets.ts` (`filled-spiral`) is the more visually striking and "fractal-looking" entry point that users should see on first load. Make the kernel defaults match that preset, and rotate the now-redundant `filled-spiral` preset off the list (replacing it with a meaningfully different one is **out of scope** — just remove it).

Target Julia kernel defaults (post-stage):

| Constant                  | Old    | New    |
|---------------------------|--------|--------|
| `DEFAULT_C_RE`            | -0.8   | -0.4   |
| `DEFAULT_C_IM`            |  0.156 |  0.6   |
| `DEFAULT_CENTER_X`        |  0     |  0     |
| `DEFAULT_CENTER_Y`        |  0     |  0     |
| `DEFAULT_ZOOM`            |  1     |  1.45  |
| `DEFAULT_MAX_ITERATIONS`  |  128   |  180   |
| `DEFAULT_PALETTE_PHASE`   |  0     |  0.38  |
| `DEFAULT_CYCLE_SPEED`     |  0.3   |  0.55  |

Schema bounds (`min`, `max`, `step`) are **unchanged**. Only the kernel `DEFAULT_*` constants and the matching `paramSchema` defaults are touched.

## Inputs (read these in your own context)

- `src/sims/julia-set/kernel.ts`
- `src/sims/julia-set/kernel.test.cjs`
- `src/app/presets.ts`

Do not read anything else.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/sims/julia-set/kernel.ts` — update the eight `DEFAULT_*` constants per the table above. The `paramSchema` `default:` values must update in lockstep (they read from these constants today; preserve that wiring).

2. `src/sims/julia-set/kernel.test.cjs` — update the `expected` object in the metadata-matches-the-renderer-contract test (around line 53–62) so the `default:` value for each of `cRe`, `cIm`, `zoom`, `maxIterations`, `palettePhase`, `cycleSpeed` matches the new table. `centerX` and `centerY` defaults remain `0`. Schema `min`, `max`, `step` are unchanged.

3. `src/app/presets.ts` — remove the entire `filled-spiral` / "Dense spiral" preset entry from the `"julia-set"` preset list (it would now duplicate the kernel defaults). Leave the other two Julia presets (`kernel-dendrite`, `douady-rabbit`) untouched. Do not renumber, re-order, or relabel them.

## Constraints

- Do not change kernel logic, escape radius, view-height constant, channel count, or any non-default behaviour.
- Do not change `centerX` / `centerY` defaults — they stay at `0` for both old and new preset.
- Do not edit other Julia kernel tests beyond the metadata test's `expected` object. The cRe/cIm/zoom-affect-state test, determinism test, cycling test, clamp test, and destroy test must continue to pass without modification.
- Do not touch mandelbrot or burning-ship kernels, tests, or presets.
- Do not touch `src/app/simView.ts`, `src/app/renderer.ts`, `src/app/webglRenderer.ts`, `src/app/fractalCanvas.ts`, `docs/INTERFACE.md`.
- `npm run verify` must pass. Atomic commit. Author identity tracks the worker.
- Do NOT run `git commit` from the worker. The orchestrator will commit on verifier-pass.
- No absolute paths in committed content.
- Report the bundle-size delta in the verifier-handoff section.

## Acceptance criteria

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. `src/sims/julia-set/kernel.ts` declares `DEFAULT_C_RE = -0.4`, `DEFAULT_C_IM = 0.6`, `DEFAULT_ZOOM = 1.45`, `DEFAULT_MAX_ITERATIONS = 180`, `DEFAULT_PALETTE_PHASE = 0.38`, `DEFAULT_CYCLE_SPEED = 0.55`. Greppable: each constant appears exactly once with the new value.
3. `src/sims/julia-set/kernel.test.cjs` `expected` object reflects the new defaults; the metadata-matches test passes.
4. `src/app/presets.ts` no longer contains a preset with `id: "filled-spiral"` or `label: "Dense spiral"` under `"julia-set"`. The remaining two Julia presets (`kernel-dendrite`, `douady-rabbit`) are byte-identical to their previous form.
5. No mandelbrot or burning-ship kernel, test, or preset file is modified.
6. No `src/app/*.ts` file other than `presets.ts` is modified.
7. `docs/INTERFACE.md` is unchanged.
8. Production build gzip-size delta is reported in the verifier handoff.
9. No files outside the deliverables set are modified — except this stage card itself.

## Out of scope

- Adding a replacement preset for the removed `filled-spiral` slot.
- Adjusting the dendrite or Douady-rabbit preset values.
- Per-preset palette assignment.
- Changing Julia schema bounds.

## Budget

- **Worker wall-clock:** 15 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

Worker returns:

- List of modified files (should be exactly the three deliverables).
- Bundle-size delta (gzipped production build).
- Confirmation that `npm run verify` is green.
- One-line confirmation that no `git commit` was invoked.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect; **do not run `git commit`**.
- Claude verifier: cross-family per the validated pairing memory. Confirm both the test-`expected` table and the preset removal with greppable evidence.
