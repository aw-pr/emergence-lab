# Stage card 156-sidebar-presets-and-left-side: presets managed beside the running sim, controls on the left

## Metadata

- **Authored:** 2026-11-08
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6 Astra <gpt-6-astra@local>
- **Base branch:** dev
- **Run branch:** autometta/156-sidebar-presets-and-left-side
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** interaction work (an in-sidebar preset list with mutations) plus a reading-order change judged in a browser. Opus 5.5 worker first; Astra as the cross-family UI verifier for the same reason as card 155.
- **Open decisions:**
  1. Does the immersive drawer move to the left with the sidebar? Recommended: yes, so hide and reveal always happen on the same edge; `e2e/cycle-interestingness.sweep.spec.ts:295` asserts the drawer parks at the right edge and is a sweep harness, not a frozen contract, so it is claimed and updated. Alternative: immersive stays right and only the normal layout moves.
- **Readiness:** HELD by the operator on 2026-11-08 while autometta is being updated; gated on card 155's operator look. See Readiness review.

## Surfacing concern

Operator notes 5 and 6 in `docs/UAT/uat-preset-review.md`: "let's switch the side bar with the params to the left" and "I wonder if we can find a way of managing presets from the sidebar, the goal is to not leave the simulation window and be able to work around it."

After card 155 the sidebar carries Save and Update, but every other preset action (open, rename, duplicate, delete, save a copy of a trial) still lives on the `#/presets` page, which replaces the running sim. The page's actions are driven by `savedPresetStore` and the catalogue in `presetLibrary.ts`, so a per-sim list in the sidebar is a second view over the same store, not a second store. The side swap has known collisions: the legend is anchored bottom-left (`styles.css:740`), the immersive exit pill top-left (`styles.css:938`), and card 155 puts the embedded Gallery and About pills top-left; the fractal HUD is top-right and would then collide with a right-anchored legend only on fractal sims. Reading order flips from picture-then-controls to controls-then-picture, which is a taste call and is why this card is gated on the operator's look at 155 first.

## Objective

In the sidebar's Presets section, list this simulation's personal presets with Open, Rename, Duplicate and Delete (with Undo), and this simulation's trials with Open and Save a copy, so the common loop never leaves the stage. Move the sidebar to the left edge in the normal layout, relocating the overlays that assumed it was on the right. One link, `All presets`, still leads to the full page for search across sims, import and export.

## Visual goal

Operator's words: "the goal is to not leave the simulation window and be able to work around it."

- The library page whose per-item actions move: `docs/plans/assets/2026-11-08-ui-review/before-presets-page.png`. In the sidebar the row is one line: name, a modified dot when the live configuration has drifted from the saved one, Open, and a kebab for Rename, Duplicate, Delete. Trials show their `Trial` tag and `Save a copy`.
- Layout after card 155: sidebar on the left, canvas filling the rest, legend bottom-right, exit and About pills at the top of the stage on the side away from the sidebar.
- Failure: a list that pushes the View and Colour sections below the fold at 900 px with five presets (cap the list height and scroll inside it); a legend hidden behind the sidebar; the immersive drawer sliding in from one side while the normal tab is on the other, if Open decision 1 is accepted.

## Inputs (read these in your own context)

- `src/app/simView.ts`: the Presets section as card 155 left it, `buildLayout`, `renderLegend`, the immersive block
- `src/app/controls.ts`: `collapsibleSection`
- `src/app/presetLibrary.ts`: `savedPresetStore`, `presetButton`, `presetNameDialog`, the catalogue (`resolveSavedPreset`) and the page's rename, duplicate, delete and undo handlers to reuse
- `src/app/savedPresets.ts`: the store and snapshot types
- `src/app/trialPresets.ts`: the trial catalogue and its per-slug filter
- `src/app/router.ts`: the `preset` query suffix that Open navigates with
- `src/app/styles.css`: `.sim-view__body` grid, `.sim-view__sidebar`, `.sim-view__legend`, the immersive block (lines 780 to 970), the 720 px block, `.preset-item` and `.preset-dialog`
- `e2e/presets-150.contract.spec.ts` (frozen, never edit): the library page's selectors and names stay valid
- `e2e/cycle-interestingness.sweep.spec.ts:295`: the right-edge drawer assertion (Open decision 1)
- `docs/UAT/uat-preset-review.md`, `docs/UAT/2026-11-08-ui-review.md`

## Deliverables

1. `src/app/simView.ts` and `src/app/presetLibrary.ts`: a per-sim list in the Presets section. Personal rows filtered to the current slug and variant, each with `data-preset-id`, `data-preset-source="personal"` and `data-preset-slug`, actions `Open`, and a menu button named `More` for `Rename`, `Duplicate`, `Delete`. Trial rows for the slug with `data-preset-source="trial"`, `Open` and `Save a copy`. Rename and duplicate reuse `presetNameDialog`; delete offers `Undo` in the section's status line under the same rules as the page. The active preset's row is marked, with a modified indicator when `capture()` differs from the saved snapshot. An `All presets` link to `#/presets`. The list is capped at about 240 px with internal scroll and an empty state of one line.
2. `src/app/presetLibrary.ts`: extract the page's mutation handlers so the page and the sidebar call the same functions; the page's behaviour and selectors are unchanged.
3. `src/app/styles.css` and `src/app/simView.ts`: the sidebar moves to the left column of `.sim-view__body` in the normal layout; the hide tab from card 155 sits on its right edge; the legend moves to bottom-right; the immersive exit pill and the embedded Gallery and About pills move to top-right, and the fractal HUD moves to top-left so the two never overlap. If Open decision 1 is accepted, the immersive drawer parks at the left edge with the handle on its right edge and the slide direction mirrored.
4. `e2e/cycle-interestingness.sweep.spec.ts`: line 295's right-edge assertion mirrored, only if Open decision 1 is accepted.
5. `e2e/smoke.spec.ts`: adjustments only where it assumed the sidebar side or an overlay position.

## Constraints

- Work from current `dev` with cards 154 and 155 landed. Only the paths in Path claims change.
- The `#/presets` page keeps every accessible name and `data-*` attribute the frozen 150 spec uses; the sidebar list reuses the same names so one vocabulary covers both.
- Preset names are untrusted text: render as text nodes, never HTML. Store semantics (unique IDs, case-insensitive name uniqueness, atomic failures, cross-tab reconciliation) are the store's and are not re-implemented in the sidebar.
- Opening a preset from the sidebar does what the page's Open does today: navigates to the sim route with the `preset` query suffix and starts a fresh run.
- The phone layout under 720 px keeps the bottom drawer; left and right do not apply there, but the overlay moves do.
- No kernel, renderer or `docs/INTERFACE.md` change; no new dependency; no cross-repo edits; no deployment or `main` merge.

## Acceptance criteria

1. Worker and verifier: `npm run verify` and `npm run build:lib` exit 0. Baseline at `ee7f42462`: 470 tests, 419 pass, 51 skips, 0 fail; both builds exit 0.
2. Worker and verifier: `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts --grep-invert "protected surfaces"` exits 0 with 13 tests executed and none skipped. The excluded test (`e2e/presets-150.contract.spec.ts:71`) pins stage 150's own base commit and fails on every later tree, as card 151 recorded; its protected-surface half is covered here by the scope criterion. Baseline at `ee7f42462`: 13 pass, that one fails.
3. Verifier, isolated port, cleared storage, 1440x900, standalone `#/particle-life`: the `.sim-view__sidebar` bounding box has `x` 0; the canvas starts at the sidebar's right edge; the legend's bounding box is in the right third of the stage; no overlay pill intersects the legend or another pill.
4. Verifier, same page: save two presets from the sidebar; both appear as rows inside `.sim-view__sidebar` with `data-preset-source="personal"` and only rows for `particle-life`; a preset saved on `#/boids` does not appear; Rename, Duplicate, Delete and Undo work from the sidebar and the result is visible on `#/presets` after navigation; Open from a trial row starts a fresh run with the trial's parameters (check one `data-param-key` value); `Save a copy` on a trial creates a personal row.
5. Verifier: changing a slider after opening a personal preset shows the modified indicator on its row; Update clears it.
6. Verifier, immersive: drawer and handle work on the side Open decision 1 settled; the exit pill is on the opposite side from the sidebar; `e2e/cycle-interestingness.sweep.spec.ts` still passes its drawer assertions as adjusted. Fractal sim `#/mandelbrot`: HUD and legend do not overlap.
7. Verifier: screenshots at 1440x900 standalone, the embedded fixture at 1372x879, and 390x844, retained, judged against the Visual goal in kind. A list that pushes View below the fold with five presets, or any hidden overlay, is a FAIL whatever the numbers say.
8. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims.
9. Operator: looks at it on `dev` and records the look in `HANDOFF.md`.

## Contract test

- **Test file:** None
- **Oracle plan:** to be authored with `autometta-oracle` when the hold lifts and Open decision 1 is settled, before queueing. Playwright on an isolated port in the pattern of `e2e/presets-150.config.ts`: sidebar `x` 0 and legend side (criterion 3), per-sim rows and the four mutations from the sidebar (4), modified indicator (5), overlay non-intersection on `#/mandelbrot` (6). Red on the base after card 155: sidebar `x` is viewport width minus 320; no `[data-preset-id]` inside the sidebar; no `More` or `Save a copy` buttons. The look (criterion 7) is judged from the frames, not frozen.

## Path claims

Implementation claims: `src/app/simView.ts`, `src/app/presetLibrary.ts`, `src/app/styles.css`, `e2e/smoke.spec.ts` (position assumptions only), `e2e/cycle-interestingness.sweep.spec.ts` (line 295 only, if Open decision 1 is accepted). Evidence, untracked: `e2e/artifacts/156-sidebar-presets-and-left-side/`. Orchestrator-owned and frozen: this card, `e2e/presets-150.contract.spec.ts`, and this card's contract test once written. Read-only: `src/app/savedPresets.ts`, `src/app/trialPresets.ts`, `src/app/router.ts`, `src/app/controls.ts`, `src/app/presets.ts`.

## Out of scope

Import and export from the sidebar (they stay on the page); cross-sim search; new store semantics; the phone drawer's mechanism; the promo-flow repo; `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 180 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** plan 8M cached-inclusive tokens for the pair, no automatic retry. Astra verifier seat as card 155: fresh Codex window, `FIVE_HOUR_STOP=100`, about GBP 8 to 15 on credits, `credits.balance` recorded before and after.

## Escalation

If the per-sim list cannot share the page's mutation handlers without changing a frozen 150 selector, stop and report the conflict rather than duplicating the handlers or touching the frozen spec.

## Dispatch envelope

Report every command and exit, bounding boxes for sidebar, legend, pills and HUD in each mount, the screenshot paths, the `git diff --name-only` against the base, and anything not done.

## Readiness review

Baseline on `dev` at `ee7f42462`: `npm run verify` exit 0 (470 tests, 419 pass, 51 skips, 0 fail), `npm run build:lib` exit 0. Claims closure on 2026-11-08: `.sim-view__legend` is positioned in `styles.css:740` only; the exit pill in `styles.css:938`; the fractal HUD in `styles.css:444`; the right-edge drawer position is asserted once, `e2e/cycle-interestingness.sweep.spec.ts:295`; the other ten drawer-handle uses click the handle and do not assume a side. `savedPresetStore`'s mutations are consumed by `presetLibrary.ts` and `simView.ts` only.

Held on 2026-11-08 at the operator's request. Gated on card 155 landing and its operator look, because the left-side reading order is a taste call the operator should see before the list is built on top of it. Still to do before `add-stage.sh`: settle Open decision 1, the oracle, a cold read by the Codex family, `card-lint.sh --strict` exit 0.
