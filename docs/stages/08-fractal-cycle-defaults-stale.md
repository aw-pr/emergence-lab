# Stage card 08-fractal-cycle-defaults-stale: Drop stale fractal cycleSpeed overrides in simView and presets

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family per `memory/project-cross-family-verification-validated.md`. Touches `src/app/simView.ts` and `src/app/presets.ts`; Claude verifier confirms the user-visible cycling behaviour at default settings and across all three fractal presets.

## Objective

After stages `5fd49f4` (kernel default bumps) and `07` (CPU/WebGL units unification), `cycleSpeed` means **cycles per second** in both render paths, and the fractal kernels expose:

| Kernel        | Default `cycleSpeed` | Schema range |
|---------------|----------------------|--------------|
| mandelbrot    | 0.25                 | [0, 5]       |
| julia-set     | 0.30                 | [0, 5]       |
| burning-ship  | 0.20                 | [0, 5]       |

But `src/app/simView.ts` still carries the pre-bump per-frame numbers and overrides the kernel on top:

- `defaultParamOverridesFor` (line ~343–346) forces `{ cycleSpeed: 0.0008 }` for all three fractal slugs.
- `paramSchemaForControls` (line ~367–374) clamps the slider to `min: 0, max: 0.02, step: 0.0001` and relabels it `"Base cycle speed"`.

The "Colour cycle multiplier" (`stepsPerFrame`, range 0.05–2 — see `speedProfileFor` line ~298–303) multiplies into this. With base = 0.0008 and max multiplier = 2, peak rate is one cycle every ~10 minutes — visually static. The slider is wired correctly but cannot reach any visible regime.

`src/app/presets.ts` carries the same stale values for all nine fractal presets (cycleSpeed 0.0007–0.0018).

Restore visible-by-default cycling and a meaningful multiplier range by deleting the stale overrides and rescaling the preset values into the new units.

## Inputs (read these in your own context)

- `src/app/simView.ts`
- `src/app/presets.ts`
- `src/sims/mandelbrot/kernel.ts` (read-only — confirms `DEFAULT_CYCLE_SPEED = 0.25` and schema `[0, 5]`)
- `src/sims/julia-set/kernel.ts` (read-only — `DEFAULT_CYCLE_SPEED = 0.3`)
- `src/sims/burning-ship/kernel.ts` (read-only — `DEFAULT_CYCLE_SPEED = 0.2`)
- `src/app/webglRenderer.ts` (read-only — confirms `palettePhase = elapsedTime * speed * speedScale`)
- `src/app/renderer.ts` (read-only — confirms `speedScale = stepsPerFrame`)

Do not read anything else.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `src/app/simView.ts` — remove the `cycleSpeed` clauses from `defaultParamOverridesFor` (the three `case "mandelbrot": case "julia-set": case "burning-ship": return { cycleSpeed: 0.0008 };` line) and from `paramSchemaForControls` (the `if (fractal && descriptor.key === "cycleSpeed" ...)` block). Let the kernel-supplied default and schema flow through unmodified. The fractal block in `defaultParamOverridesFor` should be removed entirely if `cycleSpeed` was its only content; the surrounding `switch` must still compile and behave as before for the other slugs.

2. `src/app/presets.ts` — rescale `cycleSpeed` in every fractal preset (mandelbrot × 3, julia-set × 3, burning-ship × 3) into the new units. Use these values (chosen to land near the kernel defaults and stay inside `[0, 5]`):

   | Preset                                     | Old      | New   |
   |--------------------------------------------|----------|-------|
   | `mandelbrot` / `whole-set`                 | 0.0008   | 0.25  |
   | `mandelbrot` / `seahorse-valley`           | 0.0012   | 0.35  |
   | `mandelbrot` / `spiral-hub`                | 0.0018   | 0.55  |
   | `julia-set` / `kernel-dendrite`            | 0.001    | 0.30  |
   | `julia-set` / `douady-rabbit`              | 0.0013   | 0.40  |
   | `julia-set` / `filled-spiral`              | 0.0017   | 0.55  |
   | `burning-ship` / `harbour`                 | 0.0007   | 0.20  |
   | `burning-ship` / `mast`                    | 0.0011   | 0.35  |
   | `burning-ship` / `ridge-deep`              | 0.0016   | 0.50  |

3. Adjust `speedProfileFor`'s `fractal` block if needed so the "Colour cycle multiplier" still makes sense as a multiplier on the new base. The current range `min: 0.05, max: 2, step: 0.05, initial: 0.5` is fine — keep it unless a test fails.

## Constraints

- Do **not** touch any kernel files under `src/sims/`. Kernel defaults and schemas are authoritative.
- Do **not** change `docs/INTERFACE.md`.
- Do **not** edit `src/app/webglRenderer.ts`, `src/app/renderer.ts`, or `src/app/fractalCanvas.ts` (zoom work lives in a separate stage card).
- Do **not** introduce new params, new schema keys, or new control widgets.
- `npm run verify` must pass. Atomic commit. Author identity tracks the worker (e.g. `Codex GPT-5.3 <codex-gpt-5-3@local>`).
- Do NOT run `git commit` from the worker. The orchestrator will commit on verifier-pass.
- No absolute paths in committed content.
- Report the bundle-size delta in the verifier-handoff section.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes (typecheck + kernel tests + production build).
2. `src/app/simView.ts` no longer references `cycleSpeed` inside `defaultParamOverridesFor` or `paramSchemaForControls`. Greppable: `grep -n "cycleSpeed" src/app/simView.ts` returns zero matches.
3. `src/app/presets.ts` `cycleSpeed` values match the table in deliverable 2 exactly. Greppable: `grep -n "cycleSpeed" src/app/presets.ts` returns the nine new values and nothing else.
4. No kernel files under `src/sims/` are modified.
5. `src/app/renderer.ts`, `src/app/webglRenderer.ts`, `src/app/fractalCanvas.ts` are unchanged.
6. `docs/INTERFACE.md` is unchanged.
7. Production build gzip-size delta is reported in the verifier handoff.
8. No files outside the deliverables set are modified — except this stage card itself, which is exempt per `autometta/memory/feedback-acceptance-criterion-stage-card-exemption.md`.

## Out of scope

- Changing the "Colour cycle multiplier" label, range, or initial value (unless removing it is required to make verify pass).
- Adjusting any non-fractal preset or non-fractal default.
- Improving the zoom UX (stage card 09).
- Per-kernel re-tuning of `cycleSpeed` defaults — those were set in `5fd49f4`.

## Budget

- **Worker wall-clock:** 20 minutes
- **Verifier wall-clock:** 10 minutes

## Verifier handoff

Worker returns:

- List of modified files.
- Bundle-size delta (gzipped production build).
- Confirmation that `npm run verify` is green.
- A one-line confirmation that no `git commit` was invoked from the worker phase.
- Confirmation that opening each fractal sim and each fractal preset produces visible colour cycling at default multiplier.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect; **do not run `git commit`** in your phase. Leave changes uncommitted.
- Claude verifier: cross-family per the validated pairing memory. Spot-check the running app in addition to the static greps — the user-facing symptom is that cycling is invisible, so visual confirmation is required.
