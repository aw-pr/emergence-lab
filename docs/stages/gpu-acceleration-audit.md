# Stage card gpu-acceleration-audit: Audit GPU-acceleration opportunities across kernels

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family. This is an audit deliverable (a written report, no kernel changes); Claude verifier confirms the analysis is grounded in the actual code.

## Objective

Produce a written audit of which kernels would benefit from GPU acceleration (WebGL2 fragment-shader compute, or a future WebGPU path), ranked by effort vs payoff. The deliverable is a markdown report — **no kernel code is changed in this stage**. The audit is the input to follow-on per-kernel cards.

For each of the 12 sims, the worker classifies:

- **Current backend:** CPU JS, WASM, or WebGL2 (where the WebGL2 renderer-path scaffolding lands).
- **Per-step compute profile:** dominant cost (PDE stencil, particle update, escape-iteration, Boolean cellular update, etc.) and rough current cost per step at default params.
- **GPU fit:** high / medium / low. High = embarrassingly parallel cell-wise update (Gray-Scott, BZ, Brian's Brain, GoL, ECA, fractals). Medium = needs scatter/gather (DLA, sandpile). Low = serial or branchy (Lorenz, Boids without spatial hashing).
- **Estimated speedup:** order-of-magnitude only.
- **Estimated worker effort:** S / M / L / XL.
- **Contract impact:** does the existing `SimKernel` contract (sync `step()`, `readState()` returning a `Float32Array`) accommodate the move, or would it require an `INTERFACE.md` bump? Reference the relevant section of `docs/INTERFACE.md` for each finding.

End with a prioritised list: which 1–3 kernels are the best next targets, with the recommended path (WebGL2 ping-pong textures vs. WebGPU compute shaders vs. shared-memory worker), and a sketch of what a follow-on stage card per target would deliver.

## Inputs (read these in your own context)

- `docs/INTERFACE.md` (read-only — the sync `step()` contract and Float32Array decision are central)
- `src/app/webglRenderer.ts`, `src/app/canvasRenderer.ts`, `src/app/rendererBackend.ts`, `src/app/renderModes.ts`
- All 12 kernels under `src/sims/**/kernel.ts` (skim, not deep-read)
- `HANDOFF.md`

Do not read anything else.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `docs/audits/gpu-acceleration-audit.md` — the written audit.

## Constraints

- **No code changes outside `docs/audits/`.** No kernel modifications. No renderer modifications. No `package.json` changes.
- No modifications to `docs/INTERFACE.md`.
- No absolute paths in the audit (no `/Users/...`).
- The audit must be grounded — every "current backend" claim must cite the file:line where the worker confirmed it.
- `npm run verify` must still pass after the commit (trivially true since only docs/ is touched, but the verifier checks).
- Atomic commit. Author `Codex GPT-5.3 <codex-gpt-5-3@local>`.

## Acceptance criteria

1. `npm run verify` passes.
2. `docs/audits/gpu-acceleration-audit.md` exists and contains a row per sim (12 rows) with all six classification fields populated.
3. Every "current backend" claim cites a file:line.
4. The prioritised next-targets list at the end identifies 1–3 kernels with explicit reasoning.
5. The audit references `docs/INTERFACE.md` at least once when discussing contract impact.
6. No files outside `docs/audits/` are modified — except this stage card itself.
7. `docs/INTERFACE.md` is unchanged.
8. No file in `src/**` is modified (`git diff --name-only -- src/` is empty).

## Out of scope

- Implementing any GPU path. This card is audit-only.
- Benchmarking with real numbers — order-of-magnitude estimates are sufficient.
- WebGPU vs WebGL2 deep dive — a short comparison per target is enough.
- Recommending an `INTERFACE.md` change (the audit may flag the need; the change itself is Claude's, on a separate card).

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns:

- Path to the report.
- The 1–3 next targets identified.
- Any flagged INTERFACE.md tension (without proposing changes).
- `npm run verify` green.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect.
- Claude verifier: cross-family. This is an audit deliverable; the verifier should spot-check 3 of the 12 rows against the cited file:line to confirm the claims hold.
