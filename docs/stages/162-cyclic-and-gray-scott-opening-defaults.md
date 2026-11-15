# Stage card 162-cyclic-and-gray-scott-opening-defaults: Cyclic CA opens on Square scrolls, Gray-Scott opens at three steps per frame

## Metadata

- **Authored:** 2026-11-11
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/162-cyclic-and-gray-scott-opening-defaults
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** two one-line default changes, one unit-test update and two regenerated thumbnails. A Claude coding-tier worker suffices, alternating family after card 158's Codex worker and card 161's Claude worker. The cross-family verifier is the Codex coding tier at medium: the checks are the frozen test, a read of a small diff and a short browser session. No frontier seat.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-11, after looking at card 158's preset on a dev server: "square scrolls is good that should be default", and "i've also realised that it looks better at steps per frame 3 can we set that to default", then "gary scott on the steps per frame" when asked which sim. The orchestrator reads "default" literally as what a fresh load opens on: the kernel schema default (the "Kernel default" entry). Gray-Scott's six presets keep Steps per frame 20, the setting the operator judged fine earlier the same day; card 160, which set the presets to 1, was retired on that basis.

## Surfacing concern

A fresh load opens each sim on its kernel schema defaults. For Cyclic CA those are Demons' values (states 14, threshold 1, Moore), set by `DEFAULT_STATES` in `src/sims/cyclic-ca/kernel.ts`; card 158 added Square scrolls (states 23) as a preset at `6353f930b`. For Gray-Scott the kernel default is Waves' F and k at one step per frame (`GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME` in `src/sims/gray-scott/model.ts`), while the six presets carry 20. The constants feed both the schema default and `init`'s fallback, so one edit each moves both.

Gallery thumbnails are static PNGs made by `scripts/generate-thumbnails.mjs` from the kernel defaults, 48 steps unless `STEPS_BY_SLUG` says otherwise (Gray-Scott has 1100). Square scrolls form by about 500 iterations, so at 48 steps the Cyclic CA thumbnail would be noise. The script wipes `public/thumbnails/` and regenerates all 26 files; other thumbnails drift on a rerun (Kuramoto is known to), so only the two named here may change.

## Objective

Make Square scrolls' values the Cyclic CA kernel defaults and three steps per frame the Gray-Scott kernel default, so both sims open that way on a fresh load, with their preset lists unchanged and their gallery thumbnails regenerated to show the new opening look.

## Visual goal

Operator's words: "square scrolls is good that should be default" and "it looks better at steps per frame 3 can we set that to default."

- Target: a fresh load of Cyclic CA reads States 23, Threshold 1, Moore and tiles the field with nested square spirals by about 1000 iterations; the gallery's Cyclic CA card shows square scrolls, not noise. A fresh load of Gray-Scott reads Steps per frame 3 on the Kernel default entry and develops Waves' rings about three times faster than before; choosing any Gray-Scott preset still reads 20.
- Failure: Cyclic CA still opening on 14 states, a noisy Cyclic CA thumbnail, a Gray-Scott preset whose Steps per frame changed, or any other sim's opening values or thumbnail changed.

## Inputs (read these in your own context)

- `docs/stages/158-cyclic-ca-square-scrolls.md`
- `src/sims/cyclic-ca/kernel.ts`
- `src/sims/gray-scott/model.ts`
- `src/sims/gray-scott/kernel.ts`
- `src/sims/gray-scott/kernel.test.cjs`
- `src/app/presets.ts`
- `scripts/generate-thumbnails.mjs`
- `src/app/openingDefaults.contract.test.cjs`
- `src/app/openingDefaults.base.json`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/sims/cyclic-ca/kernel.ts`: `DEFAULT_STATES` from 14 to 23. Threshold, neighbourhood and steps per frame defaults unchanged.
2. `src/sims/gray-scott/model.ts`: `GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME` from 1 to 3.
3. `src/sims/gray-scott/kernel.test.cjs`: the "schema defaults use waves regime at gentler pace" test expects `stepsPerFrame` 3; no other test changes.
4. `scripts/generate-thumbnails.mjs`: a `"cyclic-ca"` entry in `STEPS_BY_SLUG`, at most 1000, chosen so the square scrolls have formed in the thumbnail.
5. `public/thumbnails/cyclic-ca.png` and `public/thumbnails/gray-scott.png`, regenerated with `node scripts/generate-thumbnails.mjs`; then restore every other file in `public/thumbnails/` with `git checkout HEAD -- public/thumbnails` for each path other than these two, so their bytes are unchanged.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`.
- `src/app/presets.ts` is untouched: the Cyclic CA list keeps Demons, Turbulence, Crystal lattice and Square scrolls in that order, and every Gray-Scott preset keeps Steps per frame 20.
- No other kernel, default, quality profile, palette or renderer change. No kernel schema range change.
- Do not edit the frozen block in `src/app/openingDefaults.contract.test.cjs` or its fixture `src/app/openingDefaults.base.json`. The older frozen oracles `src/app/cyclicCaPresets.contract.test.cjs` (card 158, pins states 14 and the old thumbnail), `src/app/grayScottPresets.contract.test.cjs` (retired card 160) and `src/app/shippedPresets.contract.test.cjs` (card 151) will go red under their own flags after this card; that is expected. Do not touch them or their cards.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `c3a932b5f` plus this card's oracle, 2026-11-11: 506 tests, 429 pass, 0 fail, 77 skipped. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `OPENING_DEFAULTS=1 node --test src/app/openingDefaults.contract.test.cjs` passes all 4 tests with no skips. Planning base: 1 pass, 3 fail (Cyclic CA schema default states 14; `init({})` runs the old defaults; the Cyclic CA thumbnail is the old one), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier browser, headless Chromium at 1440x900 with cleared storage, on a Vite server started from the run worktree: open `#/cyclic-ca`; the Kernel preset select (in the View section) reads "Kernel default" and the Rule controls read States 23, Threshold 1, Moore. Run to about 1000 iterations and retain a screenshot: it reads as nested square spirals across the field. Open `#/gray-scott`; Kernel preset reads "Kernel default", Steps per frame reads 3; choose Waves and Mitosis in turn, each reads 20; retain a screenshot of the Kernel default field at about 10 seconds. Open the gallery (`#/`) and retain a screenshot of the Cyclic CA and Gray-Scott cards: the Cyclic CA card shows square scrolls, not noise.
5. Verifier: `npx playwright test e2e/smoke.spec.ts` passes on that server (planning base 43 passed). Afterwards `git checkout HEAD -- e2e/fixtures` if the suite rewrote fixtures.
6. Verifier scope: the diff touches only the six deliverable paths (two kernels' files, one unit test, the thumbnail script, two PNGs). Any other path is a FAIL regardless of other evidence.
7. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL).

## Contract test

- **Test file:** src/app/openingDefaults.contract.test.cjs
- **Oracle command:** `npm run build:test && OPENING_DEFAULTS=1 node --test src/app/openingDefaults.contract.test.cjs` (skips without the flag, so `npm test` stays green)
- **Assertions digest:** sha256:381752acfa98b1de49ea47a45e61710a0a018d958e0f08647ba3e2f7d27a0d93
- **Oracle proof:** Fixture `src/app/openingDefaults.base.json` (sha256 `38ad35f7882c76a42633253c8dce4eb8c23fec9b0f938e227ebc816c47a2d512`) holds all 22 kernels' schema defaults and all 26 thumbnail digests from `c3a932b5f`. On that base: 1 pass (both preset lists), 3 fail (Cyclic CA schema default; `init({})` runs the old defaults; Cyclic CA thumbnail unchanged). Without the flag all 4 skip. A scratch reference (the two constants changed and a byte appended to the Cyclic CA PNG) passed 4 of 4. Mutations each failed one test: a schema `default: 23` with the constant left at 14 failed the `init({})` test; Waves' preset at 3 failed the preset-list test; a byte appended to `boids.png` failed the thumbnail test on that file. The reference with deliverable 3's unit-test edit also kept `npm test` at 506 tests, 429 pass, 0 fail. Kernel modules are required by literal path (one entry per kernel) so `scripts/run-kernel-tests.cjs`'s preflight can see them. The test does not judge what the thumbnails look like; criterion 4 does.

## Out of scope

Gray-Scott preset Steps per frame values, any change to Demons or Square scrolls as presets, the Cyclic CA states range, the sandpile (a separate question to the operator), the Presets-section layout (built-in presets live under View as "Kernel preset"; a possible later card), the stale 143/147 baseline re-runs, and orchestration changes.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. Card 158 (a preset of similar size) cost 5.7M for the pair. Plan one median pair, about 5M. Preparation (orchestrator, 2026-11-11): a live look at the sims, the claims grep, the fixture, the oracle with a scratch reference and three mutations, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the `STEPS_BY_SLUG` value chosen and why, the paths of the two regenerated thumbnails, and the list of thumbnail files the generator touched and that were restored. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser: the worker for `scripts/generate-thumbnails.mjs`, the verifier for criteria 4 and 5. Codex roles are sandboxed and this card declares Requires GUI. Check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first; if another checkout's server is listening, stop and report rather than checking the wrong tree. The operator may have a look server on 5174 from the primary checkout; leave it alone. Start Vite from the run worktree, run the checks, stop only the server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them.

## Readiness review

Baselines on `c3a932b5f` on 2026-11-11: the frozen oracle 1 of 4 passing and 3 of 4 red for the stated reasons, 4 of 4 skipped without the flag; `npm run verify` exit 0 with this oracle in place (506 tests, 429 pass, 0 fail, 77 skipped); smoke 43 passed on `cc650b520` the same day, and card 161's verifier ran it green at landing. Claims closure: `DEFAULT_STATES` is read only in `src/sims/cyclic-ca/kernel.ts` (schema and `init`); `GRAY_SCOTT_DEFAULT_STEPS_PER_FRAME` is read by `model.ts` (`readGrayScottConfig`) and `kernel.ts` (schema); the only non-frozen test pinning either value is `src/sims/gray-scott/kernel.test.cjs` ("schema defaults use waves regime at gentler pace"); the gallery reads static PNGs (`src/app/gallery.ts`); no UI text names Demons as the default. No cross-family cold read: the change is two constants, and the cross-family verifier reads the diff.
