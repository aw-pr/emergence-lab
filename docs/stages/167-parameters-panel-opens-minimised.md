# Stage card 167-parameters-panel-opens-minimised: every sim opens with the parameters panel minimised and a discreet hint

## Metadata

- **Authored:** 2026-11-13
- **Orchestrator:** Claude Fable 5.2 <claude-fable-5-2@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/167-parameters-panel-opens-minimised
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Dispatch:** serial
- **Pairing rationale:** a small UI state change plus a wide test ripple (16 Playwright specs reach into the panel), so a Codex coding-tier worker; acceptance is a browser look across standalone, embedded and tablet, so the Claude seat verifies. Astra is the second verifier choice if the Claude seat is short, per the UI-card convention.
- **Open decisions:** none
- **Decided (operator, 2026-11-13):** "Have the panel minimised by default but have some wording somewhere maybe in the banner that discreetly says click the arrow tab on the left to adjust parameters or similar." Scope: every sim, standalone and embedded, desktop and tablet. The hint shows until the panel has been opened once on that device, then never again. Hint wording "Adjust parameters: arrow tab on the left": in the top bar after the sim title when standalone; as a small pill beside the tab when embedded ("pill beside the tab is fine"). This reverses the 2026-11-08 decision that controls open shown on every view.

## Surfacing concern

`src/app/simView.ts` builds the tab (`sim-view__sidebar-tab`) and calls `showControls(true)` on every view, so the panel covers the stage's left edge on load. The state is the page class `sim-view--controls-hidden`; `src/app/styles.css` already handles the hidden state (panel slid away, a 12 px edge zone that slides it back on hover for a fine pointer, `display: none` on a coarse pointer). Nothing persists today. Phones use their own drawer handle and immersive mode has its own reveal; both already open closed.

## Objective

Every sim view opens with the parameters panel minimised on desktop and tablet, standalone and embedded. A one-line hint tells a first-time visitor where the panel is, and disappears for good once the panel has been opened on that device.

## Visual goal

Operator's words above.

- Target: a fresh load of any sim shows the stage free of the parameters panel (the About panel still opens as it does today; that is not this card's), the arrow tab at the left edge, and one quiet hint: plain bar text when standalone (bar text weight, no box, no animation, no colour accent), and when embedded a small pill in the existing pill style beside the tab. Clicking the tab opens the panel exactly as today; the hint is gone and stays gone after reloads.
- Failure: the panel open on load; a hint that draws the eye (banner, toast, pulse); a hint that returns after the panel has been opened; a hint that overlaps the About pill, the legend, the Boids or fractal HUD; any change on phones or in immersive mode.

## Inputs (read these in your own context)

- `src/app/simView.ts` (the bar near "Standalone, one slim bar", `showControls`, `sidebarTab`, `edgeZone`)
- `src/app/styles.css` (`.sim-view--controls-hidden` rules, `.sim-view__bar`, `.sim-view__sidebar-tab`)
- `src/app/chrome.ts` (`siteOwnsChrome`)
- `e2e/stage-screen-155.contract.spec.ts` and `docs/stages/155-stage-takes-the-screen.md` (the previous decision and how the layout was tested)
- `e2e/smoke.spec.ts`

## Deliverables

1. `src/app/simView.ts`: views open with `showControls(false)`. A device-wide `localStorage` flag records the first click on the tab that opens the panel. Only that click counts: the hover and focus reveals stay temporary, as today, and do not retire the hint, and neither does the phone's Parameters sheet or the immersive drawer. "Device-wide" means this browser's `localStorage` for the origin, one key for all sims. Read and write are wrapped: with storage blocked the hint still leaves for the rest of that page view once the panel is opened, and returns on the next load. The hint element is created only while the flag is unset: in the bar when standalone, as a pill beside the tab when the site owns the chrome.
2. `src/app/styles.css`: the hint's two placements. Hidden on phones and in immersive mode.
3. A shared Playwright helper (new file under `e2e/harness/`) that opens the panel, and its use in every non-frozen spec that needs it: `e2e/smoke.spec.ts` must pass; for the opt-in specs (those gated behind an environment flag), apply the helper where the spec reaches into the panel and say in the envelope which were updated and which were run. List each spec touched.
4. `HANDOFF.md`: one line recording the reversal of the 2026-11-08 decision.

## Constraints

- No change to phones' drawer, immersive mode, the About panel, the legend or any kernel.
- The tab's `aria-expanded` and `aria-label` stay truthful in both states; the hint is plain text, not the only way to find the panel.
- Do not edit `e2e/panel-minimised-167.contract.spec.ts` or its config. Frozen oracles from earlier cards that assume an open panel (155, 154, 150 and the sweep contracts) are historical and will fail or skip under their own flags; do not edit them.
- No absolute home-directory paths in committed files.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base `946357cbc` plus this card's oracle, 2026-11-13: 516 tests, 433 pass, 0 fail, 83 skipped. Skips are not passes.
2. Worker and verifier: `PANEL_MINIMISED=167 npx playwright test -c e2e/panel-minimised-167.config.ts` passes all 6 tests with no skips (the config starts its own Vite server on port 5192). Planning base: 1 pass (phone unchanged), 5 fail, the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier: `npx playwright test e2e/smoke.spec.ts` passes (43 passed when card 162 landed; the verifier records the count on the run head).
5. Verifier browser, headless Chromium at 1440x900 with a 1920x1200 screen and at iPad emulation (1180x820, touch), cleared storage: retained screenshots of Boids, Gray-Scott and Mandelbrot on load and after opening the panel, standalone and in an embedded fixture as the oracle builds it; judged against the Visual goal, including overlap with the About button, the legend and the Boids and fractal HUDs.
6. Verifier scope: the diff touches only `src/app/simView.ts`, `src/app/styles.css`, the new helper under `e2e/harness/`, `HANDOFF.md` and the non-frozen specs the envelope lists. No frozen block (between `AUTOMETTA-CONTRACT-BEGIN` and `END` in any file) changes.
7. Operator, not judged by either seat: a look standalone and in promo-flow after landing, recorded in `HANDOFF.md`.

## Contract test

- **Test file:** e2e/panel-minimised-167.contract.spec.ts
- **Oracle command:** `PANEL_MINIMISED=167 npx playwright test -c e2e/panel-minimised-167.config.ts` (all 6 skip without the flag)
- **Assertions digest:** sha256:fac2a67e0029cbecf8bf24958882fa9389772213327cfd14c0fcb57072f037ec
- **Oracle proof:** on `946357cbc`, 5 of 6 fail, each first at `sim-view--controls-hidden` missing on load (standalone on three sims, embedded, tablet, blocked storage) or at the hint text not found (the "retires the hint" test); the phone test passes, as a regression guard on the Parameters button and the hidden tab. Without the flag all 6 skip. No reference implementation was run: the change is small and a reference would be most of the worker's job, so the positive side rests on a read of the assertions. The hint is located by its exact text, the state by the page class and the tab's `aria-label` and `aria-expanded`, all of which exist today.

## Out of scope

Remembering the panel's open or closed state between visits (it always opens minimised), the About panel's default, the phone drawer, the hint in any language other than English, and the black-band refit-on-resize question from 2026-11-08.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** card 155 (same files, larger layout change) took a 23-minute worker and a 5-minute verifier; the spec ripple here is the larger part. Plan one median pair, about 6M tokens.

## Risks

- The spec ripple is the main cost: 16 spec files reach into the panel. If the helper cannot cover a spec without touching a frozen block, the worker stops and reports rather than editing it.
- On a coarse pointer the hidden panel is `display: none`, so tablet specs must open it through the tab.

## Dispatch envelope

Return the exact commands and exits, the storage key chosen, the list of specs touched and which of them were run, and the screenshot paths. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, and this card declares Requires GUI. The operator's look server on port 5174 serves the primary checkout; leave it alone. The oracle's config starts its own server on 5192 from the run worktree; check `lsof -nP -iTCP:5192 -sTCP:LISTEN` first and stop only a server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them. A default Playwright context puts the standalone page into immersive mode; the oracle's config sets a screen larger than the viewport to avoid that, and any new check must do the same.

## Readiness review

Baselines on `946357cbc` on 2026-11-13: the frozen oracle 5 of 6 red for the stated reasons, 6 of 6 skipped without the flag; `npm run verify` exit 0. Claims closure: `showControls` and `sim-view--controls-hidden` are used only in `src/app/simView.ts` and `src/app/styles.css`; the only test naming them is card 155's frozen spec (historical); 16 spec files reach into `.sim-view__sidebar` or its controls, which is deliverable 3. On a coarse pointer the hidden panel is `display: none`, so tablet checks open it through the tab. Phones hide the tab and use the "Parameters" button, unchanged. Cold read by Codex (GPT family, read-only) on 2026-11-13, folded in: only a tab click retires the hint; the About panel is excepted from "unobstructed"; the embedded pill may be boxed; blocked storage hides the hint for the page view only.
