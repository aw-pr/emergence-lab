# Stage card 163-sandpile-opens-on-mandala: the sandpile opens on Mandala at the Balanced grid

## Metadata

- **Authored:** 2026-11-11
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/163-sandpile-opens-on-mandala
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** three default changes (kernel constants, one quality-profile entry), a small pure legend helper wired into one function, and a regenerated thumbnail. A Codex coding-tier worker suffices, alternating family after card 162's Claude worker. The acceptance is partly visual, so the cross-family verifier is a Claude seat driving headless Chromium, as for cards 158 and 161. No frontier seat.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-11. Shown the Mandala preset at Grid quality Balanced next to the noisy fresh-load default, they said "ah that looks better! why dont we make that default?" The orchestrator had offered this as option A: the sandpile opens on Mandala at the Balanced grid. The orchestrator also proposed fixing the legend's "Avalanche activity" entry with the glow off in whichever card followed; it is folded in here.

## Surfacing concern

A fresh load of the sandpile opens on its kernel schema defaults (`src/sims/abelian-sandpile/kernel.ts`): initial pile 450000, threshold 4, 32 grains per step, 120000 topples per step. Grains keep arriving, so the pile never settles and its inside is always mid-avalanche; the operator's 2026-11-11 screenshot of it reads as noise. Card 161 added Mandala (262144, 4, 0, 500000), a single drop that settles in about 45 s into the classic fractal. At the desktop default grid, ultra (1214 x 759 cells in a 1440 x 900 window), Mandala's pile is about 375 cells across and fills about a quarter of the screen width. At Balanced (810 x 506) the same pile fills about three quarters of the height, each cell about 1.8 screen pixels, and the orchestrator's headless look showed it crisp.

`qualityProfileFor` in `src/app/qualityProfiles.ts` puts the sandpile in `ULTRA_DEFAULTS`, with a comment that one-cell terraces would be lost to resampling below canvas resolution; the grid renderer samples nearest, so they are not lost, they are drawn larger. Tablet and phone already cap the sandpile at Balanced, so only the desktop default moves. "Reset to defaults" restores the default grid, so it will restore Balanced. A Grid quality the user chose is remembered per sim and still wins on reload.

The legend (`renderLegend` in `src/app/simView.ts`) lists every kernel channel. Since card 161 the sandpile colours grain counts only and shows activity only when the "Avalanche glow" switch is on, so with the glow off the "Avalanche activity" entry describes nothing on screen.

Gallery thumbnails are static PNGs from `scripts/generate-thumbnails.mjs`, at 48 steps unless `STEPS_BY_SLUG` says otherwise. Mandala needs about 1600 steps at 500000 topples to settle at a 640 x 400 grid (measured on the compiled kernel in node on 2026-11-11 at a larger grid: 1562 frames).

Card 162's frozen oracle (`src/app/openingDefaults.contract.test.cjs`) pins every kernel's defaults and every thumbnail but its own two; card 161's (`src/app/sandpilePalettes.contract.test.cjs`) pins the sandpile kernel file's digest and thumbnail. Both go red under their own flags after this card; that is expected.

## Objective

Make Mandala's values the sandpile kernel defaults and Balanced its desktop default grid, so a fresh load opens on the crisp, settled mandala at a size that fills most of the screen; show "Avalanche activity" in the legend only while the glow is on; regenerate the sandpile thumbnail to show the settled mandala.

## Visual goal

Operator's words: "ah that looks better! why dont we make that default?", about Mandala at Grid quality Balanced.

- Target: at 1440 x 900 with cleared storage, `#/abelian-sandpile` opens with Kernel preset "Kernel default", Grid quality Balanced, palette Classic sandpile; within 90 s the pile has settled into the four-fold mandala, about three quarters of the screen height, sharp single-colour cells, no noisy interior. The legend shows "Stable height" only; turning on Avalanche glow adds "Avalanche activity". The gallery's sandpile card shows the settled mandala.
- Failure: a fresh load that still drops grains continuously, opens at Ultra on desktop, or shows "Avalanche activity" with the glow off; a thumbnail of an unsettled or empty pile; any other sim's defaults, grid or thumbnail changed.

## Inputs (read these in your own context)

- `docs/stages/161-sandpile-four-colour-palettes.md`
- `src/sims/abelian-sandpile/kernel.ts`
- `src/sims/abelian-sandpile/kernel.test.cjs`
- `src/app/qualityProfiles.ts`
- `src/app/colormap.ts`
- `src/app/simView.ts`
- `src/app/presets.ts`
- `scripts/generate-thumbnails.mjs`
- `src/app/sandpileOpening.contract.test.cjs`
- `src/app/sandpileOpening.base.json`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/abelian-sandpile/kernel.ts`: `DEFAULT_INITIAL_PILE` 262144, `DEFAULT_GRAINS_PER_STEP` 0, `DEFAULT_TOPPLES_PER_STEP` 500000; `DEFAULT_TOPPLE_THRESHOLD` stays 4. No other kernel change.
2. `src/sims/abelian-sandpile/kernel.test.cjs`: the schema test's two pinned defaults (grains per step, initial pile) expect the new values; no other test changes.
3. `src/app/qualityProfiles.ts`: remove `"abelian-sandpile"` and its comment from `ULTRA_DEFAULTS`, so the desktop default is Balanced. Nothing else in the file changes.
4. `src/app/colormap.ts`: export `legendChannelsFor(mapping: ChannelMapping, channelCount: number, options: Pick<ColourMapOptions, "avalancheGlow">): number[]`, returning `[0]` for the height mapping with the glow off and every channel index otherwise.
5. `src/app/simView.ts`: `renderLegend` draws only the channels `legendChannelsFor(channelMappingFor(kernel), kernel.channelCount, colourOptions)` returns, with unchanged labels and dot colours. It already re-renders on every colour change, including the glow switch.
6. `scripts/generate-thumbnails.mjs`: an `"abelian-sandpile"` entry in `STEPS_BY_SLUG`, enough for Mandala to settle at the thumbnail grid (about 1600 to 2000); say in the envelope how you confirmed it settled.
7. `public/thumbnails/abelian-sandpile.png`, regenerated with `node scripts/generate-thumbnails.mjs`; then restore every other file in `public/thumbnails/` from `HEAD` so their bytes are unchanged.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`.
- `src/app/presets.ts` is untouched: the sandpile keeps its five presets (Classic critical, Fast avalanches, High threshold, Sandstorm, Mandala) with their values. The previous kernel default (450000 / 4 / 32 / 120000) is not added as a preset.
- No palette, renderer, shader, colour-default or glow behaviour change beyond the legend. No other sim's defaults or quality profile change; tablet and phone defaults stay Balanced.
- Do not edit the frozen block in `src/app/sandpileOpening.contract.test.cjs` or its fixture `src/app/sandpileOpening.base.json`. The older frozen oracles of cards 159, 161 and 162 (`src/app/sandpilePresets.contract.test.cjs`, `src/app/sandpilePalettes.contract.test.cjs`, `src/app/openingDefaults.contract.test.cjs`) will go red under their own flags after this card; that is expected. Do not touch them or their cards.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `92060d523` plus this card's oracle, 2026-11-11: 512 tests, 429 pass, 0 fail, 83 skipped. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `SANDPILE_OPENING=1 node --test src/app/sandpileOpening.contract.test.cjs` passes all 6 tests with no skips. Planning base: 1 pass, 5 fail (sandpile schema defaults; `init({})` runs the old defaults; desktop default Ultra; no `legendChannelsFor`; thumbnail unchanged), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier browser, headless Chromium at 1440 x 900 with cleared storage, on a Vite server started from the run worktree: open `#/abelian-sandpile`; Kernel preset reads "Kernel default", Grid quality reads Balanced, the Initial pile, Topple threshold, Grains per step and Topples per step controls read 262144, 4, 0 and 500000; the legend shows "Stable height" and not "Avalanche activity". Retain a screenshot at 90 s: a settled four-fold mandala about three quarters of the viewport height, no noisy interior. Turn on Avalanche glow: the legend adds "Avalanche activity"; turn it off: it goes. Choose Sandstorm: Grid quality stays Balanced and the sim runs. Press Reset to defaults: Grid quality reads Balanced and Kernel preset "Kernel default". Open `#/` and retain a screenshot of the sandpile gallery card: it shows the settled mandala.
5. Verifier: `npx playwright test e2e/smoke.spec.ts e2e/sandpile-palettes.spec.ts` passes on that server (planning base: smoke 43 passed; the palettes spec passed at card 161's landing). Afterwards `git checkout HEAD -- e2e/fixtures` if a suite rewrote fixtures.
6. Verifier scope: the diff touches only the seven deliverable paths. Any other path is a FAIL regardless of other evidence.
7. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL).

## Contract test

- **Test file:** src/app/sandpileOpening.contract.test.cjs
- **Oracle command:** `npm run build:test && SANDPILE_OPENING=1 node --test src/app/sandpileOpening.contract.test.cjs` (skips without the flag, so `npm test` stays green)
- **Assertions digest:** sha256:93c27bb6ef2e14efc1093c46af79c5873b48661f11fdf011ade76dd0c21555c6
- **Oracle proof:** Fixture `src/app/sandpileOpening.base.json` (sha256 `d48fff7f7a8d471ba424646ae08228cb08a3f0af158c893c9b7939738848c8a8`) holds all 22 kernels' schema defaults, `qualityProfileFor` for every slug at the three device tiers and six render modes, and all 26 thumbnail digests, from `92060d523`. On that base: 1 pass (the preset list), 5 fail for the reasons in criterion 2. Without the flag all 6 skip. A scratch reference (the three constants, the `ULTRA_DEFAULTS` removal, a `legendChannelsFor` as specified, the two unit-test values, and a byte appended to the sandpile PNG) passed 6 of 6, kept `npm test` at 512 tests / 429 pass / 0 fail, and typechecked. Mutations: the legend returning every channel failed the legend test; the sandpile left in `ULTRA_DEFAULTS` failed the quality test at `desktop/grid`; Mandala's preset pile changed to 524288 failed the preset-list test. The test does not judge the thumbnail's picture or the live look; criterion 4 does.

## Out of scope

A GPU sandpile kernel and larger piles (option B, offered to the operator 2026-11-11), a legend of the four grain-count colours, any palette or glow change, Sandstorm's or any other preset's values, the Cyclic CA and Gray-Scott defaults (card 162), the Presets-section layout, the stale 143/147 baseline re-runs, and orchestration changes.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. Cards 158 and 162, similar in size, cost about 5.7M per pair. Plan one median pair, about 5M. Preparation (orchestrator, 2026-11-11): headless looks at the default, Mandala at Ultra, High and Balanced, the claims grep, the fixture, the oracle with a scratch reference and three mutations, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the `STEPS_BY_SLUG` value and how settling was confirmed, the paths of the regenerated thumbnail and the browser screenshots, and the list of thumbnail files the generator touched and that were restored. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser: the worker for `scripts/generate-thumbnails.mjs`, the verifier for criteria 4 and 5. Codex roles are sandboxed and this card declares Requires GUI. Check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first; if another checkout's server is listening, stop and report rather than checking the wrong tree. The operator may have a look server on 5174 from the primary checkout; leave it alone. Start Vite from the run worktree, run the checks, stop only the server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them. The sandpile kernel steps on the CPU, so a settle in headless Chromium can take longer than in a desktop browser; allow up to 120 s before calling it unsettled.

## Readiness review

Baselines on `92060d523` on 2026-11-11: the frozen oracle 1 of 6 passing and 5 of 6 red for the stated reasons, 6 of 6 skipped without the flag; `npm run verify` with the oracle in place is recorded in criterion 1; smoke 43 passed at card 162's landing the same hour. Claims closure: the sandpile default constants are read only in `kernel.ts` (schema and `init`); the only non-frozen test pinning them is `src/sims/abelian-sandpile/kernel.test.cjs`'s schema test; `ULTRA_DEFAULTS` is read only by `qualityProfileFor`; `renderLegend` is the only legend writer and runs on load and in `onColourChange`; the smoke test's "reset restores the kernel preset select: abelian-sandpile" sets the select to `__default__` by reset, not by matching params, so a default equal to Mandala's values does not break it; `e2e/sandpile-palettes.spec.ts` builds its own two-channel state and does not depend on the kernel defaults; the gallery reads static PNGs. No cross-family cold read: the change is small and mechanical, and the cross-family verifier reads the diff and the live page.
