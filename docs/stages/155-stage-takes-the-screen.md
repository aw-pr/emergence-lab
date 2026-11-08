# Stage card 155-stage-takes-the-screen: the simulation gets the screen back

## Metadata

- **Authored:** 2026-11-08
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6 Astra <gpt-6-astra@local>
- **Base branch:** dev
- **Run branch:** autometta/155-stage-takes-the-screen
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** a layout card whose acceptance is how the screen is used, judged in a real browser in both mounts. Opus 5.5 worker on the first attempt (Astra second, not first, per the operator's 2026-10-10 steer); Astra as the UI verifier, the seat the operator has seen do well on interaction and UI judgement, cross-family.
- **Open decisions:** none. Settled by the operator on 2026-11-08: the embedded mount uses overlay pills (Gallery and About at the stage's top-left in the immersive exit pill's style) and the element exposes `toggleAbout()` beside `toggleImmersive()`; no slim lab bar when the site owns the chrome.
- **Readiness:** HELD by the operator on 2026-11-08 while autometta is being updated; gated on card 154's operator look. See Readiness review.

## Surfacing concern

On the embedded build at a laptop height (1372x879), the simulation starts 312 px down the page, under four stacked bands: the site nav (68 px, promo-flow), the lab bar (30 px, promo-flow), the lab's Origin and Maths header with its Gallery link (110 px), and the Presets / Save preset bar (55 px). That is 35% of the viewport before the first row of the sim, and the 320 px sidebar takes another 23% of the width. Standalone the stack is 187 px, 20% of 952. The operator's notes 2, 3, 4 and the hide-button half of note 5 in `docs/UAT/uat-preset-review.md` are all this one problem: "We want to maximise space for the model display but still have the information" and "We waste a load of space on the title."

Facts from the code that shape the fix. In the embedded mount `siteOwnsChrome()` already hides the title block, so the 110 px header holds only the Gallery link and two prose columns. The preset toolbar in `simView.ts` (the `preset-tools` section) is self-contained: library link, Save, Update when a personal preset is loaded, a status line, an error line and the Return to live model recovery button. The sidebar already has `collapsibleSection` with per-sim open-state persistence and an unused `controls__presets` style hook. The sidebar can only be collapsed today in immersive mode (right-edge hover drawer with a tap handle) and on phones under 720 px (bottom drawer behind a Parameters pill); the normal desktop layout has no toggle at all. Immersive mode already promotes the body into the top layer through the Popover API, so a popover inside the shadow root is proven.

## Objective

Give the stage the viewport. Drop the header row in both mounts; the narrative moves behind an About control that opens a bordered panel over the stage with the sim still running behind it; the preset toolbar moves into a Presets section at the top of the sidebar; the sidebar gets a hide tab in the normal layout. Standalone, a slim lab bar carries the title, the family pill, the Gallery link and the About control. The sidebar stays on the right in this card.

Target on the embedded build at 1372x879: the canvas top edge within 110 px of the viewport top (the two promo-flow bands), down from 312 px. Standalone at 1440x900: within 48 px.

## Visual goal

Operator's words (2026-11-08): "We could maybe have a pop out in a nice border so you can read it but also see the sim." and "the goal is to not leave the simulation window and be able to work around it."

- Before, embedded: `docs/plans/assets/2026-11-08-ui-review/before-embedded-1440x900.jpg` and the operator's strip `docs/plans/assets/2026-11-08-ui-review/before-embedded-header-strip.png`. Everything between the promo-flow bar and the black canvas goes.
- Before, standalone: `docs/plans/assets/2026-11-08-ui-review/before-standalone-1440x900.jpg`.
- The preset bar that moves: `docs/plans/assets/2026-11-08-ui-review/before-preset-bar.png`; the sidebar top it moves into: `docs/plans/assets/2026-11-08-ui-review/before-sidebar-top.png`.
- Skin: card 154's tokens, as landed. The About panel is a bordered card in promo-flow's reading surface, hairline border, the sim visibly running behind and around it.
- Failure: a header that is merely shorter; an About panel that stops the sim or blacks it out; a sidebar hide tab that leaves a blank column; the preset status or error lines overflowing the sidebar.

## Inputs (read these in your own context)

- `src/app/simView.ts`: `buildLayout` (around line 1296), `buildAbout`, the preset toolbar block (around lines 667 to 733), `enterTopLayer` and `exitTopLayer` (around line 276), `renderLegend`, the immersive toggle and the `SimViewHandle` interface
- `src/app/controls.ts`: the header, transport and `collapsibleSection` (lines 35 and 330 to 400)
- `src/app/styles.css`: `.sim-view__header` through `.sim-view__formula`, `.sim-view__body`, `.sim-view__sidebar`, the immersive block (lines 780 to 970), the 720 px block (from line 1290), `.preset-tools` and `.sim-view__body--presets` (around lines 1541 to 1580)
- `src/app/chrome.ts` and `src/app/embed.ts`: `siteOwnsChrome()`, `isFramedBySite()`, `showBackToSiteLink()`
- `src/app/element.ts` and `src/app/lib.ts`: the web component surface that promo-flow calls
- `src/app/mount.ts`: `presetsEnabled` is false on fixed routes
- `e2e/presets-150.contract.spec.ts` (frozen, never edit) and `e2e/presets-150.spec.ts` (lines 247 and 262 assert the `← Gallery` link in an embedded fixture)
- `e2e/smoke.spec.ts`: lines 134 to 136 and 173 use the drawer handle and `.controls__title`
- `docs/UAT/uat-preset-review.md`, `docs/UAT/2026-11-08-ui-review.md`

## Deliverables

1. `src/app/simView.ts`: remove the header row from `buildLayout`. Standalone, build a slim lab bar (one line, about 44 px) holding the title, the family pill, the `← Gallery` link and an `About` button. When `siteOwnsChrome()`, no bar: the `← Gallery` link and `About` become overlay pills at the stage's top-left per Open decision 1, keeping the link's accessible name `← Gallery` and its existing `href` and `target` rules. `About` opens the narrative (`buildAbout` output, including the KaTeX formulas) in a popover panel anchored under the bar or pill, dismissed by Escape, click-away or the button, with focus returned to the button. The panel never pauses the renderer. The phone disclosure (`sim-view__about-toggle`) is replaced by the same About control.
2. `src/app/simView.ts` and `src/app/controls.ts`: the preset toolbar becomes a `Presets` collapsible section at the top of the sidebar, under the transport row, carrying the same elements with the same accessible names (`Presets` link, `Save preset`, `Update preset`, status `role=status`, error `role=alert`, `Return to live model`). `sim-view__body--presets` and the toolbar's grid row go. Fixed routes (`presetsEnabled` false) show no Presets section.
3. `src/app/simView.ts` and `src/app/styles.css`: a sidebar hide tab in the normal layout, a button named `Hide controls` / `Show controls` with `aria-expanded`, on the sidebar's stage edge. Collapsed, the grid column shrinks to the tab's width and the canvas reflows (the renderer already handles the immersive reflow; reuse that path). State persists per device in `localStorage` like the section open states. Immersive mode and the phone drawer keep their existing mechanisms untouched.
4. `src/app/controls.ts` and `src/app/styles.css`: the sidebar heading (`.controls__title`, the sim name) is hidden when `siteOwnsChrome()`, since the host bar names the sim; standalone it stays, because `e2e/smoke.spec.ts:173` uses it. The four stacked transport buttons become one row of four.
5. `src/app/element.ts` and `src/app/lib.ts`: expose `toggleAbout()` on the element beside `toggleImmersive()`, with the hand-maintained contract comment updated.
6. `src/app/styles.css`: the header, about-column and formula rules are rewritten for the popover; the 1150 px breakpoint for the about columns goes; the 720 px block loses the header rules and gains the popover's phone sizing (full width, max-height with internal scroll).
7. `e2e/smoke.spec.ts`: adjust only where it referenced the removed header or the toolbar; keep every other assertion.

## Constraints

- Work from current `dev` with card 154 landed. Only the paths in Path claims change.
- Accessible names the frozen 150 spec relies on do not change: `Presets` (link), `Save preset`, `Update preset`, `Preset name`, `Save`, `Cancel`, `Open`, `Rename`, `Duplicate`, `Delete`, `Undo`. The `← Gallery` link keeps its name, `href` and `target` behaviour in all three mounts (`e2e/presets-150.spec.ts:247,262`).
- Immersive mode is unchanged: header hidden, body in the top layer, right-edge drawer with the handle, exit pill top-left. Eleven e2e specs click `.sim-view__drawer-handle`; it keeps its class and behaviour.
- The phone layout under 720 px keeps the bottom drawer and the Parameters pill.
- Sidebar stays on the right. The legend (bottom-left) and the immersive exit pill (top-left) stay where they are; in the embedded mount the new overlay pills sit beside the exit pill's position and must not overlap the legend.
- No kernel, renderer or `docs/INTERFACE.md` change; no new dependency; no cross-repo edits (promo-flow wiring of `toggleAbout()` is a later card there); no deployment or `main` merge.

## Acceptance criteria

1. Worker and verifier: `npm run verify` and `npm run build:lib` exit 0. Baseline at `ee7f42462`: 470 tests, 419 pass, 51 skips, 0 fail; both builds exit 0.
2. Worker and verifier: `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts --grep-invert "protected surfaces"` exits 0 with 13 tests executed and none skipped. The excluded test (`e2e/presets-150.contract.spec.ts:71`) pins stage 150's own base commit and fails on every later tree, as card 151 recorded; its protected-surface half is covered here by the scope criterion. Baseline at `ee7f42462`: 13 pass, that one fails.
3. Verifier, isolated port, cleared storage, 1440x900, standalone `#/particle-life`: no `.sim-view__header` element; the canvas bounding box top is at most 48 px; a button `About` opens a panel containing the heading `Origin` and the heading `The maths`, Escape closes it and focus returns to the button; while the panel is open the iteration counter in the sidebar keeps advancing.
4. Verifier, same page: the `Save preset` button and the `Presets` link are inside `.sim-view__sidebar`; saving a preset through the sidebar shows the status line inside the sidebar without horizontal overflow; `Hide controls` collapses the sidebar so the canvas bounding box width grows by at least 280 px, `Show controls` restores it, and the state survives a reload.
5. Verifier, embedded fixture (the host-gallery fixture used by `e2e/presets-150.spec.ts:247`): no lab bar; the `← Gallery` link keeps `href` `/host-gallery`; `About` is reachable and works; the sidebar heading is absent; the canvas top is within 8 px of the lab element's top.
6. Verifier, immersive: `Fullscreen` enters immersive, the drawer handle reveals the sidebar on the right, the exit pill exits; the About pills are hidden in immersive. Phone 390x844: Parameters pill and bottom drawer work; About opens full width.
7. Verifier: screenshots at 1440x900 standalone, 1372x879 embedded fixture, 390x844 standalone, retained, judged against the Visual goal in kind. Numbers passing while the frames show a leftover band, a blacked-out sim behind the panel, or overflow in the sidebar is a FAIL.
8. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims.
9. Operator: looks at it on `dev`, standalone and in promo-flow's dev server, and records the look in `HANDOFF.md` before card 156 is queued.

## Contract test

- **Test file:** None
- **Oracle plan:** to be authored with `autometta-oracle` when the hold lifts and Open decision 1 is settled, before queueing. Playwright on an isolated port in the pattern of `e2e/presets-150.config.ts`: header absence and canvas top (criterion 3), About panel open, close and running counter (3), Save preset inside the sidebar and the hide tab reflow (4), embedded fixture link and heading (5). Red on the base: the header exists and the canvas top is 187 px; no `About` button; `Save preset` sits outside the sidebar; no `Hide controls` button. The look (criterion 7) is judged from the frames, not frozen.

## Path claims

Implementation claims: `src/app/simView.ts`, `src/app/controls.ts`, `src/app/styles.css`, `src/app/element.ts`, `src/app/lib.ts`, `e2e/smoke.spec.ts` (adjustments only where the header or toolbar was referenced). Evidence, untracked: `e2e/artifacts/155-stage-takes-the-screen/`. Orchestrator-owned and frozen: this card, `e2e/presets-150.contract.spec.ts`, and this card's contract test once written. Read-only: `src/app/chrome.ts`, `src/app/embed.ts`, `src/app/mount.ts`, `src/app/presetLibrary.ts`, `src/app/savedPresets.ts`.

## Out of scope

Sidebar on the left and the per-sim preset list (card 156); promo-flow's bar (a later card in that repo wires `toggleAbout()`); changing what the narrative says; immersive mode's drawer; the fractal HUD; `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** comparable to card 150 (UI, three mounts, Playwright): plan 10M cached-inclusive tokens for the pair, no automatic retry. Astra verifier seat by the 2026-10-10 measure: about GBP 8 to 15 on credits beyond the free window minutes; start it at a fresh Codex window and run the overage guard with `FIVE_HOUR_STOP=100` for that seat. Record `credits.balance` before and after.

## Escalation

If the About popover cannot be placed in the top layer inside the shadow root without disturbing the immersive popover (two manual popovers on one body), stop and report; a non-top-layer absolute panel clipped by the host is a FAIL, not a fallback. If the embedded fixture cannot be driven, say so with the error rather than substituting a standalone run for criterion 5.

## Dispatch envelope

Report every command and exit, the canvas top and width measurements before and after in each mount, the screenshot paths, the popover mechanism chosen, the `git diff --name-only` against the base, and anything not done.

## Readiness review

Baseline on `dev` at `ee7f42462`: `npm run verify` exit 0 (470 tests, 419 pass, 51 skips, 0 fail), `npm run build:lib` exit 0. Measurements taken 2026-11-08 in Chrome: embedded 1372x879, canvas top 312 px; standalone 1251x952, canvas top 187 px. Claims closure: `preset-tools` is referenced only in `simView.ts` and `styles.css`; `sim-view__header`, `sim-view__about*` and `sim-view__formula*` only in `simView.ts` and `styles.css`; the `← Gallery` link is asserted by `e2e/presets-150.spec.ts:247,262`; `.controls__title` by `e2e/smoke.spec.ts:173`; `.sim-view__drawer-handle` by eleven specs, all in immersive mode, which this card leaves alone; `toggleImmersive` is read by promo-flow's `LabsRunShell.tsx`, which is not touched. `presetsEnabled` is set only in `mount.ts:64`.

Held on 2026-11-08 at the operator's request. Gated on card 154 landing and its operator look. Still to do before `add-stage.sh`: settle Open decision 1, the oracle, a cold read by the Codex family, `card-lint.sh --strict` exit 0.
