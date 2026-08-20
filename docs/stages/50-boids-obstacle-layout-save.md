# Stage card 50-boids-obstacle-layout-save: save, restore and promote drawn layouts

## Metadata

- **Authored:** 2026-08-20
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Fable 5 <claude-fable-5@local>
- **Verifier panel:** false
- **Pairing rationale:** as stage 49; the Claude verifier owns the
  end-to-end persistence and presentation checks in the browser.

## Objective

The operator wants to sculpt obstacle fields with the stage-49 pointer and
keep the good ones, including turning the best into shipped defaults. Three
pieces:

1. **Reload persistence.** The overlay survives a page reload through the
   app's existing persistence layer (`src/app/persistence.ts`), superseding
   the stage-48 session-only decision.
2. **Named save slots.** The user can save the current overlay under a
   name, list saved layouts, load one (replacing the overlay), and delete a
   slot. UI follows the app's existing chrome patterns (the controls popup
   style); keep it small.
3. **Export and promote.** A saved layout can be copied out as a compact,
   versioned JSON string, and imported by pasting. Document the format in
   `docs/plans/` together with the exact recipe for promoting an exported
   layout into a shipped preset in `src/sims/boids/kernel.ts`, so the
   operator can capture a field in the browser and land it as a default
   with a paste and a name.

## Inputs (read these in your own context)

- `src/sims/boids/kernel.ts`
- `src/sims/boids/kernel.test.cjs`
- `src/app/simView.ts`
- `src/app/persistence.ts`
- `src/app/chrome.ts`
- `docs/stages/49-boids-boulder-drop-pointer.md`
- `state/verifiers/49-boids-boulder-drop-pointer.json`
- `docs/verification.md`

## Deliverables

1. Serialisation of the overlay: a versioned, forward-readable format
   (world-size independent, normalised coordinates) with encode and decode
   in the kernel or a sibling pure module, unit-tested round trip.
2. Reload persistence of the live overlay via `persistence.ts`.
3. Save/load/delete named slots plus export and import UI, styled with the
   existing chrome.
4. `docs/plans/2026-08-2x-boids-layout-promotion.md` - the format spec and
   the promote-to-preset recipe, with a worked example.
5. Tests: round trip, decode of a hand-edited string, rejection of a
   malformed string without crashing, slots isolated from each other.

## Constraints

- Preset layouts, stage-49 gestures, and other sims untouched.
- Storage stays client-side (localStorage through the persistence layer);
  no network, no new dependency.
- A malformed import must fail soft with a visible message, never a crash.
- No git mutations by the worker; stop cleanly on budget exhaustion;
  relative paths; UK English, no em dash.

## Acceptance criteria

1. `npm run verify` is green.
2. Verifier-side: draw a field, reload, the field is back; save it under a
   name, clear, load it back identical.
3. Verifier-side: export produces a string; a fresh session importing that
   string reproduces the field; a corrupted string is refused politely.
4. The promotion recipe works as written: the verifier follows it once and
   gets a working named preset in a scratch copy of the kernel.
5. No console errors; other sims' persistence unchanged.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Shipping any actual new default layout (operator's job with the recipe);
  cloud sync or sharing; thumbnails; other simulations.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

The envelope states: the format (with an example string), where slots
live in storage, the import failure behaviour, the promotion recipe
location, and the files touched.

## Family-specific notes

- **Codex (worker):** sandboxed, no browser; make encode/decode pure so
  your confidence comes from the round-trip tests.
