# Stage card 48-boids-custom-obstacles-polish: make obstacle drawing feel like a feature

## Metadata

- **Authored:** 2026-08-19
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** as stage 47; the Claude verifier owns the
  end-to-end interaction and presentation judgement.

## Objective

Second custom-obstacles stage. Stage 47 made drawing work; this stage makes
it discoverable and forgiving. Read stage 47's verifier artefact first: any
flagged rough edges take priority.

1. **Discoverability.** When `"custom"` is selected, a short unobtrusive
   hint appears near the canvas (matching the app's existing chrome style)
   naming the three gestures: click to place, drag for a breakwater, click
   a rock to remove. It disappears after first successful edit or on
   dismiss.
2. **Forgiveness.** A "Clear obstacles" affordance while in `"custom"`
   (place it consistently with existing per-sim controls); a drag shorter
   than a stated threshold places a rock rather than a sliver capsule.
3. **Session persistence.** The drawn field survives param tweaks that
   reset the flock (count, radius changes) within the session, and
   switching away to a preset and back, as stage 47 established; if reload
   persistence is cheap through the app's existing persistence layer
   (`src/app/persistence.ts`), include it; if not, state why in the
   handoff and leave it.

## Inputs (read these in your own context)

- `state/verifiers/47-boids-custom-obstacles.json`
- `docs/stages/47-boids-custom-obstacles.md`
- `src/sims/boids/kernel.ts`
- `src/app/simView.ts`
- `src/app/persistence.ts`
- `src/app/chrome.ts` (existing hint/control styling)
- `src/sims/boids/kernel.test.cjs`
- `docs/verification.md`

## Deliverables

1. App-layer hint, clear affordance, and short-drag threshold per the
   objective, styled with the app's existing chrome patterns.
2. Persistence per point 3, with the decision recorded in the handoff.
3. `src/sims/boids/kernel.test.cjs` plus any app-layer tests the repo's
   patterns support: threshold behaviour, clear, persistence of the drawn
   field across a flock-resetting param change.

## Constraints

- Hint and controls appear only for boids in `"custom"`; no other sim's
  chrome changes.
- Preset layouts, `"none"` byte-identity, and stage-47 gesture semantics
  are untouched.
- No new dependency; no git mutations by the worker; stop cleanly on budget
  exhaustion; relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Verifier-side: fresh session, select `"custom"`: the hint appears,
   names the gestures, and goes away after the first edit; the clear
   affordance empties the field; a tap-length drag makes a rock, not a
   sliver.
3. Verifier-side: drawn field survives a boid-count change and a
   preset-and-back round trip; reload behaviour matches whatever the
   handoff declares.
4. Any stage-47 verifier flags are addressed or explicitly deferred with a
   reason in the handoff.
5. No console errors; other sims' chrome unchanged.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Undo/redo, obstacle export/sharing, presets, thumbnails, other
  simulations.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states: the hint and control placement, the drag threshold,
the persistence decision and why, stage-47 flags addressed, and the files
touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; presentation judgement is
  verifier-side.

## Re-brief (2026-08-20, after verifier FAIL on attempt 1)

Attempt 1 is preserved at commit `58fd7a9` on branch
`wip/48-polish-attempt-1`. Reuse it. All functional behaviour passed; only
two presentation defects remain, both pinpointed by the verifier:

1. The Clear obstacles button inherits `.fractal-hud__button`'s fixed 31px
   glyph-button width (`src/app/styles.css:480-486`), clipping its label to
   overlapping fragments. Give the text button an auto/intrinsic width
   (its own modifier class) instead of the glyph square.
2. The tools HUD is never actually hidden outside custom mode:
   `setCustomMode` sets `root.hidden` (`src/app/simView.ts:919`) but the
   author rule `.fractal-hud { display: grid }`
   (`src/app/styles.css:442-446`) overrides the UA `[hidden]` rule. Hide it
   with an explicit rule (e.g. `.fractal-hud[hidden] { display: none }`) or
   a class toggle, so nothing renders on preset layouts or other sims.
