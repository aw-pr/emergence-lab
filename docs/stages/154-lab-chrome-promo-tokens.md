# Stage card 154-lab-chrome-promo-tokens: the lab wears promo-flow's skin

## Metadata

- **Authored:** 2026-11-08
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/154-lab-chrome-promo-tokens
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** a token and copy pass with a visual judgement at the end; coding-tier Claude worker, cross-family Codex verifier that opens a WebGL2 browser and compares against the reference frames. Astra is held back for cards 155 and 156, whose verification is the judgement-heavy part of this arc.
- **Open decisions:** none
- **Readiness:** hold lifted by the operator on 2026-11-08 ("start it when the codex run is complete"). Oracle frozen; cold read by the Codex family below. See Readiness review.

## Surfacing concern

The lab is deployed primarily inside promo-flow (`/labs/run`), and the operator's first note in `docs/UAT/uat-preset-review.md` is that it should fit in with the promo-flow feel. The two stylesheets already share a page background (`#020617`), a foreground (`#e8ecf4`) and a secondary text colour (the lab's `--fg-dim` is promo-flow's `--signal`, `#A8B9D1`). The clashes are in the details, and every one is visible in `docs/plans/assets/2026-11-08-ui-review/before-embedded-1440x900.jpg`:

- Two blues. The lab's `--accent` is cyan `#5ac8fa` (section labels, focus rings, immersive drawer handle, stage glow), while the Save preset button is promo-flow's `--primary` `#0066CC`. Promo-flow permits one saturated colour.
- Radius. Lab buttons and cards are 10 px (`--radius`), the preset buttons are pills; promo-flow's controls, including the Fullscreen button one bar above, are near-square with uppercase letterspaced labels.
- Elevated surface. The lab sidebar is `#101a33`; promo-flow's reading surface is `#1E2A44`.
- Font. Promo-flow loads Inter through next/font and sets it on `body`. The lab's stack in `src/app/styles.css` puts `-apple-system` first, so inside the shadow root the lab renders in SF on a Mac while the bar above it is Inter.

Three copy items ride along because they are the same kind of change and would otherwise never earn a card: the sidebar's "Maximise" and promo-flow's "Fullscreen" are two names for one action; the Presets page tells visitors that "Vite and a deployed site do not share storage"; the standalone gallery heading is the repo name "emergence-lab" where everything else says "Emergence Lab".

## Objective

Inside the lab's own stylesheet, adopt promo-flow's tokens so that the embedded lab and its host bar read as one surface: one blue, promo-flow's radius and label treatment on controls, promo-flow's elevated surface, Inter first. Rename the three copy items. No layout change: the header, sidebar position and preset toolbar are cards 155 and 156.

## Visual goal

Operator's words (2026-11-08): "We want the site to fit in with the promo-flow feel as it is deployed primarily there."

- Target feel: `docs/plans/assets/2026-11-08-ui-review/reference-promo-labs-page.jpg`, the promo-flow `/labs` page. Note the single blue on primary actions, the square-cornered secondary buttons with uppercase letterspaced labels, the restrained hairline borders.
- Before, embedded: `docs/plans/assets/2026-11-08-ui-review/before-embedded-1440x900.jpg`. The cyan section labels and the blue pill button are what should disappear.
- Before, standalone: `docs/plans/assets/2026-11-08-ui-review/before-standalone-1440x900.jpg`.
- Failure: a lab that still shows the old cyan beside the new blue, or any second saturated hue, or whose buttons are visibly rounder than the Fullscreen button in the promo-flow bar, fails whatever the computed-style assertions say. Promo-flow's own lighter companions (`#4F95EA`, `#7EB8F7`) used for text on dark are the same blue family and do not count as a second blue.

## Inputs (read these in your own context)

- `src/app/styles.css`: the `:root` token block (lines 13 to 22), `.preset-button` and `.preset-button--primary`, `.control__button`, the `.controls__*` section headings, `.sim-view__about-label`, the immersive drawer and exit rules
- `src/app/controls.ts`: the transport buttons (the `Maximise` button at line 373)
- `src/app/presetLibrary.ts`: the Presets page copy
- `src/app/gallery.ts`: the standalone gallery heading
- `docs/UAT/uat-preset-review.md` and `docs/UAT/2026-11-08-ui-review.md`: the operator's notes and the review they produced
- `docs/stages/150-saved-preset-library.md`: deliverable 6 records the design direction already agreed for the preset surfaces
- The promo-flow tokens are quoted above and in the review; the sibling promo-flow checkout is not an input and must not be modified or depended on.

## Deliverables

1. `src/app/styles.css`: `--accent` becomes `#0066CC` with a lighter companion for text on dark where cyan was used for legibility (promo-flow uses `#4F95EA` and `#7EB8F7` for that); `--radius` and the button radii drop to promo-flow's near-square treatment; `--bg-elev` becomes `#1E2A44` or promo-flow's translucent surface; `Inter` moves to the front of the body font stack; secondary buttons take the uppercase letterspaced label treatment where promo-flow uses it (transport and preset buttons), while form labels and body text stay sentence case. Focus rings and the immersive drawer handle follow the new accent. Every colour in the file that was a literal cyan is re-pointed through the tokens (`var(--accent)` or its companion, directly or through `color-mix()` or relative colour), not replaced by new blue literals outside the `:root, :host` block. The frozen test bans only the cyan spellings; criterion 7 checks the rest from the diff. The primary button's hover background changes too: `#0877e6` under white text is 4.38:1, below AA.
2. `src/app/controls.ts`: the transport button reads `Fullscreen` instead of `Maximise`; its accessible name follows.
3. `src/app/presetLibrary.ts`: the storage explainer loses the Vite sentence. The sentence before it already says presets live in this browser.
4. `src/app/gallery.ts`: the heading reads `Emergence Lab`.
5. `e2e/smoke.spec.ts` only if a button name it uses changed (it does not reference `Maximise` today; confirm before editing).

## Constraints

- Work from current `dev`. Only the paths in Path claims change.
- No DOM structure change: no element moves, is added or is removed. This is a style and copy card so that cards 155 and 156 are judged in the right skin. The frozen structure hash catches added, removed and reparented elements and changes in tag order, but not a swap of two same-tag siblings; criterion 7 covers that from the diff.
- `src/sims/**`, renderer and backend modules, `docs/INTERFACE.md`, `src/app/presets.ts`, `src/app/types.ts` stay untouched.
- The frozen `e2e/presets-150.contract.spec.ts` stays green: it finds `Save preset`, `Presets`, `Update preset`, `Open`, `Rename`, `Duplicate`, `Delete` and `Undo` by accessible name, so those names do not change.
- Contrast: every text and control colour pair meets WCAG AA (4.5:1 for body text, 3:1 for large text and for focus indicators). Hairline button borders follow promo-flow's restrained treatment and are not held to 3:1; the label or fill identifies the control. The cyan was doing legibility work on section labels; replace it with a colour that passes, not with `#0066CC` on `#020617`, which does not.
- No new dependencies, no cross-repo edits, no deployment, no `main` merge.
- Criterion 2's command also runs `e2e/presets-150.spec.ts`, which rewrites tracked files under `e2e/fixtures/presets-150/`. Restore them with `git checkout -- e2e/fixtures/presets-150` before committing; they are not in Path claims and criterion 7 fails if they are committed.

## Acceptance criteria

1. Worker and verifier: `npm run verify` and `npm run build:lib` exit 0. Baseline at `ee7f42462`: 470 tests, 419 pass, 51 opt-in skips, 0 fail; both builds exit 0.
2. Worker and verifier: `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts --grep-invert "protected surfaces"` exits 0 with 13 tests executed and none skipped. The excluded test (`e2e/presets-150.contract.spec.ts:71`) pins stage 150's own base commit and fails on every later tree, as card 151 recorded; its protected-surface half is covered here by the scope criterion. Baseline at `ee7f42462`: 13 pass, that one fails.
3. Verifier, at an isolated port with cleared storage and a 1440x900 viewport, standalone `#/particle-life`: computed `--accent` on the lab root is `#0066CC`; the body font stack resolves to Inter when Inter is available to the page; no `Save preset`, transport or preset button has a `border-radius` above 4 px; no element in the sim view has a computed colour within 8 units of `#5ac8fa` in every channel (red, green and blue each within 8, at non-zero alpha).
4. Verifier: a button named `Fullscreen` exists in the controls and none named `Maximise`; the Presets page contains no occurrence of the word `Vite`; the standalone gallery heading reads `Emergence Lab`.
5. Verifier: contrast of every text colour against the surface it sits on, on the sim view and the Presets page, for the sidebar heading, section labels, body text, form labels, secondary button labels, and the primary button label at rest and on hover, plus the focus ring against the surface behind it at 3:1, reported as a table, all at or above AA. Hover and focus are measured from the computed style with the state forced (Playwright `hover()` and keyboard focus), not inferred from the stylesheet.
6. Verifier: screenshots at 1440x900 standalone and 390x844 standalone, retained, judged against the Visual goal in kind. Numbers passing while the frames still show two blues or round pills is a FAIL.
7. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims; the diffs of `controls.ts`, `presetLibrary.ts` and `gallery.ts` change only the strings named in Deliverables 2 to 4; and `styles.css` adds no blue colour literal outside the `:root, :host` token block.
8. Worker and verifier: the Contract test command exits 0 with 4 tests executed and none skipped.
9. Operator, not judged or recorded by either seat: after a PASS lands the stage on `dev`, the operator looks at it there, and the orchestrator records the look in `HANDOFF.md` before card 155 is queued. This supersedes the review's "before merge" wording: autometta lands a PASS on `dev`, and `main` stays out until the operator says otherwise.

## Contract test

- **Test file:** e2e/lab-chrome-154.contract.spec.ts
- **Assertions digest:** `sha256:dfaec7cafe4a46e87a10e40742a2903af667d657cd53a5ec407ad95a691ca790`
- **Command:** `LAB_CHROME_CONTRACT=154 npx playwright test -c e2e/lab-chrome-154.config.ts` (isolated port 5187, fresh storage, 1440x900). Without the variable the four tests skip, so the default suite is unaffected.
- **Oracle proof:** On base `ecfd91be4` (a vendor-only commit after `ee7f42462`) the suite ran 4 tests, 4 failed: test 1 at the accent (`rgb(90, 200, 250)`, expected `rgb(0, 102, 204)`), test 2 at the `#5ac8fa` literal, test 3 at the missing `Fullscreen` button, test 4 at the first structure hash, which was a placeholder when this ran; the three literals were then frozen from base and repeated identically across three loads with 1.5, 3.5 and 5.5 s settles. A throwaway detached worktree with the deliverables applied by `sed` (accent `#0066cc`, `--radius` 4px, every `rgba(90, 200, 250, a)` to `rgba(0, 102, 204, a)`, every radius above 4px to 4px, Inter first, the three copy edits) passed 4/4 with no skips. Bad fixtures against that reference each failed exactly one test: a 6px `.control__button` radius failed test 1 only, a cyan `.control__button:hover` background failed test 2 only, an extra `span` in the transport failed test 4 only. The reference was not judged against the Visual goal and is not on `dev`.

The frozen block covers criterion 3 (accent resolved through a probe inside `.sim-view`, Inter first on `body`, `.sim-view` and `.controls`, the Save preset, transport and sim-view preset buttons at or under 4px on every corner, and no computed colour in any colour-bearing property of any element or pseudo-element in the sim view within 8 units of `#5ac8fa` in all three channels at non-zero alpha), deliverable 1's "every literal cyan" as a source check on `src/app/styles.css` (which also covers hover and focus states the computed scan cannot see), criterion 4, the transport names Pause, Reset and Reset to defaults as a regression guard, and the "no DOM structure change" constraint as depth-and-tag hashes of the sim view, Presets page and gallery. Text, classes and attributes may change; elements may not be added, removed or moved. The structure test is card-local: later cards that change layout (155, 156) exclude it by name. Not in the block: criteria 1 and 2 (the seats' own commands), the contrast table (criterion 5), the look (criterion 6) and scope (criterion 7, a verifier `git diff`).

## Path claims

Implementation claims: `src/app/styles.css`, `src/app/controls.ts`, `src/app/presetLibrary.ts`, `src/app/gallery.ts`, `e2e/smoke.spec.ts` (name change only, if needed). Evidence, untracked: `e2e/artifacts/154-lab-chrome-promo-tokens/`. Orchestrator-owned: this card, `e2e/lab-chrome-154.contract.spec.ts` and `e2e/lab-chrome-154.config.ts`; the worker does not edit them.

## Out of scope

Any layout change (card 155), sidebar position and preset management (card 156), the promo-flow repo, logos, the gallery thumbnails, the KaTeX stylesheet, the phone drawer behaviour, `main`, labs and the public mirror.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** style and copy only; plan 5M cached-inclusive tokens for the pair, no automatic retry. Sol verifier on subscription.

## Escalation

If a promo-flow token cannot meet AA contrast where the cyan sits today, stop and report the pair and the candidate replacement rather than keeping a second saturated colour.

## Dispatch envelope

Report every command and exit, the contrast table, the screenshot paths, the token values chosen with their promo-flow source, the `git diff --name-only` against the base, and anything not done.

## Readiness review

Baseline on `dev` at `ee7f42462` (clean tree apart from the UAT notes): `npm run verify` exit 0 (470 tests, 419 pass, 51 skips, 0 fail), `npm run build:lib` exit 0. Promo-flow tokens read from its `src/app/globals.css` and `LabsRunShell.tsx` on 2026-11-08; the lab's from `src/app/styles.css`. Claims closure: `Maximise` appears only in `controls.ts:373` and in card prose; no e2e spec selects it. `.controls__title` is used by `e2e/smoke.spec.ts:173` and is not touched here. The frozen 150 spec selects by accessible name only, none of which change.

Held on 2026-11-08 at the operator's request ("card them up but hold the run"); hold lifted the same day once the Codex cold read is folded in. Claims closure: `src/app/styles.css` is the only file with a cyan literal (`grep -rn -i -E '5ac8fa|90, ?200, ?250' src index.html`), so the computed-colour criterion is reachable inside Path claims.

Cold read by the Codex family (gpt-6.1-sol, read-only, 78k tokens) on 2026-11-08: 7 material, 1 minor, all folded in without touching the frozen block. (1) "Two blues" now names promo-flow's lighter companions as the same family. (2) Criterion 5 now covers the primary button hover and the focus ring on both routes, with states forced; hairline borders are exempt from 3:1 and the primary hover (4.38:1 on base) must change. (3) The verifier's local Vite listeners: `Requires GUI: true` dispatches Codex under danger-full-access, which has loopback, as cards 150 to 153 did; no `Requires network` line is needed. (4, 7) Criterion 9 is the operator's alone, after landing on `dev`, superseding the review's "before merge". (5) Criterion 3 said "any channel" where the test checks all three; the card now says every channel. (6) Same-tag sibling swaps escape the structure hash; criterion 7 now checks the three TypeScript diffs change only the named strings. (8) Replacement blues outside the token block are now a criterion 7 check rather than frozen.
