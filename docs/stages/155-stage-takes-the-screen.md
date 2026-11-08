# Stage card 155-stage-takes-the-screen: the simulation gets the screen back

## Metadata

- **Authored:** 2026-11-08
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/155-stage-takes-the-screen
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** a layout card whose acceptance is how the screen is used, judged in a real browser in three mounts. Opus 5.5 worker on the first attempt; cross-family Sol verifier, which judged card 154's look, contrast and scope well. The operator chose Sol over the carded Astra on 2026-11-08 to spare the weekly Codex allowance (prolite plan, weekly window only, 55% used, no credits); Astra stays available for a re-check if Sol's judgement of the look is thin.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-08: the embedded mount uses overlay pills (Gallery and About at the stage's top-left in the immersive exit pill's style) and the element exposes `toggleAbout()` beside `toggleImmersive()`; no slim lab bar when the site owns the chrome. After the cold read: the hide tab's state is one device-wide `localStorage` key, not per sim; `e2e/presets-150.config.ts` gains a 1920x1200 screen so criterion 2 runs in the normal layout.
- **Readiness:** card 154 landed and passed the operator's look on 2026-11-08; Open decision 1 settled; oracle frozen; cold read by the Codex family below. See Readiness review.

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
- `src/app/mount.ts`: `presetsEnabled` is false on fixed routes; `LabMountHandle` forwards `toggleImmersive()` to the current view
- `e2e/presets-150.contract.spec.ts` (frozen, never edit) and `e2e/presets-150.spec.ts` (lines 247 and 262 assert the `← Gallery` link in an embedded fixture)
- `e2e/smoke.spec.ts`: lines 134 to 136 and 173 use the drawer handle and `.controls__title`
- `docs/UAT/uat-preset-review.md`, `docs/UAT/2026-11-08-ui-review.md`

## Deliverables

1. `src/app/simView.ts`: remove the header row from `buildLayout`. Standalone, build a slim lab bar (one line, about 44 px) holding the title, the family pill, the `← Gallery` link and an `About` button. When `siteOwnsChrome()`, no bar: the `← Gallery` link and `About` become overlay pills at the stage's top-left per Open decision 1, keeping the link's accessible name `← Gallery` and its existing `href` and `target` rules. `About` opens the narrative (`buildAbout` output, including the KaTeX formulas) in a popover panel anchored under the bar or pill, dismissed by Escape, click-away or the button, with focus returned to the button. The panel never pauses the renderer. The phone disclosure (`sim-view__about-toggle`) is replaced by the same About control.
2. `src/app/simView.ts` and `src/app/controls.ts`: the preset toolbar becomes a `Presets` collapsible section at the top of the sidebar, under the transport row, carrying the same elements with the same accessible names (`Presets` link, `Save preset`, `Update preset`, status `role=status`, error `role=alert`, `Return to live model`). `sim-view__body--presets` and the toolbar's grid row go. Fixed routes (`presetsEnabled` false) show no Presets section.
3. `src/app/simView.ts` and `src/app/styles.css`: a sidebar hide tab in the normal layout, a button named `Hide controls` / `Show controls` with `aria-expanded`, on the sidebar's stage edge. Collapsed, the grid column shrinks to the tab's width and the canvas reflows (the renderer already handles the immersive reflow; reuse that path). State persists in one device-wide `localStorage` key, not per sim: hiding the controls on one sim hides them on every sim. Immersive mode and the phone drawer keep their existing mechanisms untouched.
4. `src/app/controls.ts` and `src/app/styles.css`: the sidebar heading (`.controls__title`, the sim name) is hidden when `siteOwnsChrome()`, since the host bar names the sim; standalone it stays, because `e2e/smoke.spec.ts:173` uses it. The four stacked transport buttons become one row of four.
5. `src/app/element.ts`, `src/app/mount.ts` and `src/app/lib.ts`: expose `toggleAbout()` on the element beside `toggleImmersive()`, forwarded through `LabMountHandle` and `SimViewHandle` the same way `toggleImmersive()` is, with the hand-maintained contract comment updated.
6. `src/app/styles.css`: the header, about-column and formula rules are rewritten for the popover; the 1150 px breakpoint for the about columns goes; the 720 px block loses the header rules and gains the popover's phone sizing (full width, max-height with internal scroll).
7. `e2e/smoke.spec.ts`: adjust only where it referenced the removed header or the toolbar; keep every other assertion.

## Constraints

- Work from current `dev` with card 154 landed. Only the paths in Path claims change.
- Accessible names the frozen 150 spec relies on do not change: `Presets` (link), `Save preset`, `Update preset`, `Preset name`, `Save`, `Cancel`, `Open`, `Rename`, `Duplicate`, `Delete`, `Undo`. The `← Gallery` link keeps its name, `href` and `target` behaviour in all three mounts (`e2e/presets-150.spec.ts:247,262`).
- Immersive mode is unchanged: header hidden, body in the top layer, right-edge drawer with the handle, exit pill top-left. Eleven e2e specs click `.sim-view__drawer-handle`; it keeps its class and behaviour.
- The phone layout under 720 px keeps the bottom drawer and the Parameters pill.
- Sidebar stays on the right. The legend (bottom-left) and the immersive exit pill (top-left) stay where they are; in the embedded mount the new overlay pills sit beside the exit pill's position and must not overlap the legend.
- Criterion 2's command also runs `e2e/presets-150.spec.ts`, which rewrites tracked files under `e2e/fixtures/presets-150/`. Restore them with `git checkout -- e2e/fixtures/presets-150` before committing; they are not in Path claims.
- No kernel, renderer or `docs/INTERFACE.md` change; no new dependency; no cross-repo edits (promo-flow wiring of `toggleAbout()` is a later card there); no deployment or `main` merge.

## Acceptance criteria

1. Worker and verifier: `npm run verify` and `npm run build:lib` exit 0. Baseline at `ee7f42462`: 470 tests, 419 pass, 51 skips, 0 fail; both builds exit 0.
2. Worker and verifier: `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts --grep-invert "protected surfaces"` exits 0 with 13 tests executed and none skipped. The excluded test (`e2e/presets-150.contract.spec.ts:71`) pins stage 150's own base commit and fails on every later tree, as card 151 recorded; its protected-surface half is covered here by the scope criterion. Baseline at `ee7f42462`: 13 pass, that one fails. The orchestrator gave `e2e/presets-150.config.ts` a 1920x1200 screen with this card: without it the suite runs in immersive mode, where the sidebar is an off-screen drawer, so once `Save preset` moves into the sidebar 8 of the 13 tests time out on their clicks (proved on the reference). With it, base `49fa7d4b4` and the reference each run 13 of 13 green.
3. Verifier, isolated port, cleared storage, 1440x900, standalone `#/particle-life`: no `.sim-view__header` element; the canvas bounding box top is at most 48 px; a button `About` opens a panel containing the heading `Origin` and the heading `The maths`, Escape closes it and focus returns to the button; while the panel is open the iteration counter in the sidebar keeps advancing.
4. Verifier, same page: the `Save preset` button and the `Presets` link are inside `.sim-view__sidebar`; saving a preset through the sidebar shows the status line inside the sidebar without horizontal overflow; `Hide controls` collapses the sidebar so the canvas bounding box width grows by at least 280 px, `Show controls` restores it, and the state survives a reload.
5. Verifier, embedded fixture (the host-gallery fixture used by `e2e/presets-150.spec.ts:247`): no lab bar; the `← Gallery` link keeps `href` `/host-gallery`; `About` is reachable and works; the sidebar heading is absent; the canvas top is within 8 px of the lab element's top.
6. Verifier, immersive: `Fullscreen` enters immersive, the drawer handle reveals the sidebar on the right, the exit pill exits; the About pills are hidden in immersive. Phone 390x844: Parameters pill and bottom drawer work; About opens full width.
7. Verifier: screenshots at 1440x900 standalone, 1372x879 embedded fixture, 390x844 standalone, retained, judged against the Visual goal in kind. Numbers passing while the frames show a leftover band, a blacked-out sim behind the panel, or overflow in the sidebar is a FAIL.
8. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims.
9. Worker and verifier: the Contract test command exits 0 with 5 tests executed and none skipped.
10. Operator, not judged or recorded by either seat: after a PASS lands the stage on `dev`, the operator looks at it standalone and in promo-flow's dev server, and the orchestrator records the look in `HANDOFF.md` before card 156 is queued.

## Contract test

- **Test file:** e2e/stage-screen-155.contract.spec.ts
- **Assertions digest:** `sha256:0b7747994fd04d6795504adfd9f3a1f877feabe59a2a3c1b1a445969002388e1`
- **Command:** `STAGE_SCREEN_CONTRACT=155 npx playwright test -c e2e/stage-screen-155.config.ts` (isolated port 5191, fresh storage per test, 1440x900 viewport on a 1920x1200 screen). Without the variable the five tests skip.
- **Oracle proof:** On base `49fa7d4b4` (card 154 landed) the suite ran 5 tests, 5 failed, each at the intended first assertion: test 1 at `.sim-view__header` present, test 2 at `Save preset` outside the sidebar, test 3 at the embedded `.sim-view__header` present, test 4 at no `About` button, test 5 at no `About` button on the phone. With the About lines stripped, tests 4 and 5 passed on base, so the immersive and phone-drawer halves are true regression guards. A throwaway reference (a slim bar with title and an `About` button opening a `popover="auto"` panel standalone, `← Gallery` and `About` pills in the stage when the site owns the chrome, the preset toolbar prepended to the sidebar, a hide tab persisted in `localStorage`, the embedded sidebar title hidden; 56 lines, unstyled beyond layout) passed 5/5 with no skips. Bad fixtures against it each failed exactly one test: no `localStorage` write failed test 2 only, the embedded sidebar title left visible failed test 3 only, the lab bar left visible in immersive failed test 4 only. The reference was never judged against the Visual goal and is not on `dev`. Amended after the cold read (digest `976a04cd` superseded by `0b774799`; assertions added, none removed or loosened): the shown state's canvas width is checked after its reload, the phone drawer's geometry is pinned (left edge, full width, bottom edge, top below 25% of the height), and `element.toggleAbout()` is called to open and close About. Re-proved 2026-11-08: base `49fa7d4b4` 5 of 5 red at the same first assertions; the reference 5 of 5 green with no skips; three further bad fixtures each failed exactly one test at the new assertion: no `toggleAbout` on the element failed test 3 (`el.toggleAbout is not a function`), the phone sheet shifted 40% right failed test 5 at the left-edge check, and a reload that collapses the sidebar whenever the key exists failed test 2 at "shown state survives a reload".

The frozen block covers criterion 3 (no header element, canvas top at most 48 px, `About` opens `Origin` and `The maths` headings in a top-layer panel, `:popover-open` or a modal dialog, the iteration counter advances over 1.5 s while it is open, Escape closes it and focus returns to the button, standalone `.controls__title` still visible), criterion 4 (one `Save preset`, inside the sidebar, with the `Presets` link; a saved preset's status inside the sidebar with no horizontal overflow; `Hide controls` / `Show controls` with `aria-expanded`, canvas wider by at least 280 px when hidden, restored within 4 px, both states surviving a reload), criterion 5 (on a 98 px host band plus a 781 px embed at 1372x879: no header, canvas within 8 px of the element top, `← Gallery` with `href` `/host-gallery`, no Presets section on the fixed route, no visible sidebar heading, the same About checks inside the shadow root), and the criterion 6 regressions (immersive entered by `Fullscreen`, About hidden there, the drawer handle opening the sidebar against the right edge, `Exit fullscreen` leaving; on a 390x844 phone the Parameters pill toggling `sim-view--params-open` with the sidebar in view, and the About panel at least 351 px wide). Not in the block: criteria 1 and 2 (the seats' own commands), the look (criterion 7) and scope (criterion 8).

Test-harness notes for both seats. A Playwright context whose screen equals its viewport (the default, and what `page.setViewportSize` produces) trips `updateImmersive`'s window-fills-the-screen rule in `simView.ts`, so the standalone page opens in immersive mode; the oracle config sets a 1920x1200 screen through `contextOptions`, and any normal-layout evidence must do the same. The Parameters pill's accessible name includes its `::before` arrow, so select it by `.sim-view__params-toggle`, not by exact name. Card 154's frozen structure test (`e2e/lab-chrome-154.contract.spec.ts`, "DOM structure unchanged") fails by design once this card moves elements; it is card-local and not a criterion here.

## Path claims

Implementation claims: `src/app/simView.ts`, `src/app/controls.ts`, `src/app/styles.css`, `src/app/element.ts`, `src/app/lib.ts`, `src/app/mount.ts` (the `LabMountHandle.toggleAbout()` forward only), `e2e/smoke.spec.ts` (adjustments only where the header or toolbar was referenced). Evidence, untracked: `e2e/artifacts/155-stage-takes-the-screen/`. Orchestrator-owned and frozen: this card, `e2e/presets-150.contract.spec.ts`, `e2e/presets-150.config.ts`, `e2e/stage-screen-155.contract.spec.ts` and `e2e/stage-screen-155.config.ts`; the worker does not edit them. Read-only: `src/app/chrome.ts`, `src/app/embed.ts`, `src/app/presetLibrary.ts`, `src/app/savedPresets.ts`.

## Out of scope

Sidebar on the left and the per-sim preset list (card 156); promo-flow's bar (a later card in that repo wires `toggleAbout()`); changing what the narrative says; immersive mode's drawer; the fractal HUD; `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** comparable to card 150 (UI, three mounts, Playwright): plan 10M cached-inclusive tokens for the pair, no automatic retry. The Codex account has no credits, so the Sol verifier draws only on the weekly window; if that window reaches 100% the verifier stops and the stage waits for the reset on 2026-11-11.

## Escalation

If the About popover cannot be placed in the top layer inside the shadow root without disturbing the immersive popover (two manual popovers on one body), stop and report; a non-top-layer absolute panel clipped by the host is a FAIL, not a fallback. If the embedded fixture cannot be driven, say so with the error rather than substituting a standalone run for criterion 5.

## Dispatch envelope

Report every command and exit, the canvas top and width measurements before and after in each mount, the screenshot paths, the popover mechanism chosen, the `git diff --name-only` against the base, and anything not done.

## Readiness review

Baseline on `dev` at `ee7f42462`: `npm run verify` exit 0 (470 tests, 419 pass, 51 skips, 0 fail), `npm run build:lib` exit 0. Measurements taken 2026-11-08 in Chrome: embedded 1372x879, canvas top 312 px; standalone 1251x952, canvas top 187 px. Claims closure: `preset-tools` is referenced only in `simView.ts` and `styles.css`; `sim-view__header`, `sim-view__about*` and `sim-view__formula*` only in `simView.ts` and `styles.css`; the `← Gallery` link is asserted by `e2e/presets-150.spec.ts:247,262`; `.controls__title` by `e2e/smoke.spec.ts:173`; `.sim-view__drawer-handle` by eleven specs, all in immersive mode, which this card leaves alone; `toggleImmersive` is read by promo-flow's `LabsRunShell.tsx`, which is not touched. `presetsEnabled` is set only in `mount.ts:64`.

Held on 2026-11-08 at the operator's request; released the same day after card 154 landed (`abc3dc659`) and the operator passed its look and chose overlay pills for Open decision 1.

Cold read 2026-11-08 by GPT-6.1 Sol (read-only, high effort) as both seats; seven items, all folded in. (1, material) `toggleAbout()` needs a forward through `LabMountHandle`, which lived in the read-only `mount.ts`: that file is now claimed for the forward only, and Deliverable 5 names it. (2, minor) hide-state scope was unsettled: the operator chose one device-wide key. (3, material) criterion 2's suite ran in immersive mode, so the toolbar move would make its clicks unreachable: confirmed on the reference (8 of 13 time out) and fixed in `e2e/presets-150.config.ts` with the operator's yes. (4, minor) criterion 10 is outside both seats by design: no change. (5, 6, 7, material) the shown-state reload, the phone drawer's shape and `toggleAbout()` were unchecked: three assertions added to the frozen block and re-proved (see Oracle proof).
