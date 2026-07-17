# Stage card 22-logistic-mandelbrot-clipping: Logistic Mandelbrot — fix 3D clipping of the set

## Metadata

- **Authored:** 2026-07-17
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 4.8 <claude-opus-4-8@local>
- **Verifier panel:** false
- **Pairing rationale:** Renderer geometry/frustum debugging is precise implementation work suited to the Codex tier; Opus cross-family-verifies the fix against the reported symptoms and the unchanged stage 17-21 behaviour.

## Objective

A real-GPU session (first human eyeball of the sim, 2026-07-17 evening)
shows parts of the 3D object cut off. Observed symptoms from the
operator's screenshot, taken from an orbited three-quarter view:

1. The point cloud ends at a hard straight boundary on one side — sheet
   structure visibly truncated mid-feature, dots stopping along a clean
   line rather than fading at the set's natural edge.
2. The large period-3-region bulb cloud appears severed from the main
   body by the same kind of hard edge.
3. The ground plane does not extend under the entire cloud: the object
   spills past the plane's edge, so the plane reads as a partial
   rectangle rather than the full c-domain.

Diagnose the root cause(s) and fix so the full object survives any
camera orbit/dolly within the interaction limits. Candidate causes to
check (not exhaustive): camera near/far clip planes too tight for the
dollied-out view; the plane mesh sized to a different rectangle than
the sampler's c-grid; view-frustum or scissor culling of the point
buffer; the c-grid rectangle itself tighter than the full [-2, 1] x
[-1, 1] domain after some stage 18-21 change.

## Inputs (read these in your own context)

- `src/app/orbit3d.ts` (camera matrices, plane mesh, point pipeline)
- `src/app/renderer.ts` (orbit3d animation/camera plumbing from stages 19-20)
- `src/sims/logistic-mandelbrot/model.ts` (authoritative c-grid extents)
- `src/app/webglRenderer.ts` (orbit3d dispatch only — do not read the whole file)
- `docs/verification.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Root-cause note in the handoff envelope: which of the candidate
   causes (or what else) produced each of the three symptoms.
2. The fix, confined to orbit3d camera/geometry code.
3. A regression guard where one is expressible headlessly (e.g. an
   assertion that plane extents equal the sampler grid extents, or that
   near/far planes bound the object's bounding sphere at the dolly
   limits).

## Constraints

- No changes to the stage-17 sampler maths or kernel tests.
- No changes to other sims or shared mode branches beyond orbit3d.
- Do not change the interaction feel (orbit/dolly speeds, limits) except
  as strictly needed to keep the object un-clipped at the limits.
- Do not run `git commit` from the worker phase.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` passes; stages 17-21 tests stay green.
2. Root cause for each of the three symptoms is identified and the fix
   addresses it mechanically (verifier confirms the causal chain in
   code, not just that pixels changed).
3. Plane extents provably match the sampler c-grid extents.
4. The object's bounding volume fits inside the near/far planes across
   the full dolly range (verifiable from the code's constants).
5. No regression to marker picking, cascade, sweep, or real-slice mode.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Colour work (stage 23).
- New camera features or interaction changes.

## Budget

- **Worker wall-clock:** 40 minutes
- **Verifier wall-clock:** 20 minutes

## Verifier handoff

Worker returns: root-cause note per symptom, files changed, `npm run
verify` output, and the code-level evidence for criteria 3-4. Verifier
returns `overall: PASS|FAIL` with per-criterion results.

## Family-specific notes

- Codex worker: the operator's screenshot is not available in your
  sandbox; work from the symptom descriptions above.
- Claude/Opus verifier: criteria 3-4 are checkable from constants and
  geometry code without a browser.
