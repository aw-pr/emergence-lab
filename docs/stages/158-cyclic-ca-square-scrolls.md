# Stage card 158-cyclic-ca-square-scrolls: ship "Square scrolls" and check its neighbours

## Metadata

- **Authored:** 2026-11-09
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/158-cyclic-ca-square-scrolls
- **Worker effort:** medium
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** the production diff is one preset entry; the research part is a bounded five-value sweep that reuses the card-147 capture path. A Codex coding-tier worker suffices, alternating family after card 157's Claude worker. The acceptance is partly visual, so the cross-family verifier is a Claude seat driving headless Chromium, the established pairing for preset promotions (cards 68, 69, 75, 151). No frontier seat.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-09 (`docs/UAT/uat.md` note 3): states 23 "looks much better... actually feels like it does something", so the preset ships now; the neighbour check is evidence about robustness, not a gate on the promotion.

## Surfacing concern

Card 147's second pass ranked `147-cyclic-ca-c43` (states 23, threshold 1, Moore) first of 48 at 0.887 against Demons at 0.752 under the same method (`docs/sweeps/data/2026-10-30/147/cyclic-ca.json`, git-ignored, and `docs/sweeps/2026-11-08-operator-rerun.md`, Cyclic CA section). The 2026-11-08 report asked whether to check states 22 and 24 before adding it. The operator looked at it live on 2026-11-09 and said yes. An orchestrator look the same day at the desktop grid showed states 22, 23 and 24 all reading as nested square spirals at 1000 iterations, which suggests a plateau rather than a knife-edge; this card measures that.

## Objective

Ship `square-scrolls` ("Square scrolls": states 23, threshold 1, Moore) as the fourth Cyclic CA preset, after the three incumbents and with Demons still the kernel default. Measure states 21, 22, 23, 24 and 25 at threshold 1, Moore, under the card-147 method against the three current references, with seeds 0, 1 and 2, a 384-grid renderer screenshot per state, and a long-horizon frame at 2000, and write the finding up.

## Visual goal

Operator's words: "yes looks much better at 23 actually feels like it does something thats a good thread to investigate."

- Target at 1000 iterations: the whole field tiled with nested square spirals of about 20 to 60 cells across, every spiral rotating (frames 200 iterations apart differ throughout), bands three to four colours wide.
- Failure: static patches, a field dominated by one spiral, or a preset whose controls do not read 23 / 1 / Moore after a fresh load.

## Inputs (read these in your own context)

- `docs/UAT/uat.md`
- `docs/sweeps/2026-11-08-operator-rerun.md`
- `docs/sweeps/cyclic-ca-interestingness.md`
- `src/app/presets.ts`
- `src/sims/cyclic-ca/kernel.ts`
- `e2e/harness/sims.ts`
- `e2e/sweep.spec.ts`
- `src/app/cyclicCaPresets.contract.test.cjs`
- `src/app/shippedPresets.contract.test.cjs`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: a pure insertion after `crystal-lattice` in the `cyclic-ca` block: `{ id: "square-scrolls", label: "Square scrolls", params: { states: 23, threshold: 1, neighbourhood: "moore" } }`, with a comment in the style of the Turbulence entry citing card 147's c43 score and this card's neighbour check.
2. `e2e/harness/sims.ts`: an additive `sweep-158-cyclic-ca` configuration (states {21, 22, 23, 24, 25}, threshold {1}, neighbourhood {moore}, `stepsPerFrame` 1, seed 0, 128², captures 200/500/1000, the three `147-current-*` references), leaving every existing config byte-equivalent as a serialized value.
3. `e2e/sweep.spec.ts`: an additive `sweepTest("sweep 158 cyclic-ca square scrolls neighbours", …)` reusing `cellularCapture`, `cellularSummary` and `rdRender`: rank the five states, replay each once (tolerance 1e-9), repeat each at seeds 1 and 2, capture a long-horizon frame at 2000 and a 384-grid renderer screenshot at 1000 for each state and reference. Output to `docs/sweeps/data/2026-11-10/158/`, `docs/images/sweeps-2026-11-10/` (git-ignored, local) and `e2e/artifacts/sweep-158-cyclic-ca/report.md`.
4. `docs/sweeps/2026-11-10-cyclic-ca-square-scrolls.md`: method, the ranked table for states 21 to 25 with seed spread beside Demons, Turbulence and Crystal lattice, the c43 row from card 147 for comparison, image file names, the promotion record, and a one-paragraph reading of whether the regime is a plateau.
5. `docs/sweeps/cyclic-ca-interestingness.md`: a dated "Promotion: Square scrolls" section pointing to deliverable 4.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`. No kernel, default, quality-profile or thumbnail change: Demons stays the kernel default and `public/thumbnails/cyclic-ca.png` is byte-for-byte unchanged.
- The three incumbent presets are unchanged. `git diff <base>..HEAD -- src/app/presets.ts` is a pure insertion of the new entry and its comment.
- Do not edit the frozen block in `src/app/cyclicCaPresets.contract.test.cjs`. `src/app/shippedPresets.contract.test.cjs` (card 151) and `e2e/presets-150.contract.spec.ts` (card 150) are frozen historical oracles; do not touch them or their cards.
- Historical sweep configs and data stay reproducible; new artifact ids only.
- The harness hard-codes `http://localhost:5173`; see Family-specific notes.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `b318892d6`: 480 tests, 429 pass, 0 fail, 51 skipped. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `CYCLIC_PRESETS=1 node --test src/app/cyclicCaPresets.contract.test.cjs` passes all 4 tests with no skips. Planning base: 2 pass, 2 fail (three presets where four are expected; the report is missing), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier browser: with cleared storage open `#/cyclic-ca`; the Kernel preset select shows Demons' values (States 14, Threshold 1, Moore). Choose "Square scrolls": the controls read 23, 1 and Moore. Run to 1000 iterations at the desktop default grid and retain a screenshot; it reads as the Visual goal target. Retain a frame at 1200; it differs from the 1000 frame across the field, not only at a few cells. Press Reset and run again: same regime. A frozen or single-spiral field is a FAIL.
5. Verifier: run `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 158 " --workers=1` yourself; candidate ordering is identical to the worker's `docs/sweeps/data/2026-11-10/158/cyclic-ca.json` and every metric matches within absolute 1e-9; all three seeds are present for each state. Report a larger deviation as FAIL rather than widening the tolerance. View the five renderer screenshots and say in the verdict which states read as square scrolls and which do not; the report's plateau paragraph must agree with the images.
6. Verifier scope: the diff touches only the five deliverable paths. Any other path, or a changed line in an incumbent preset, is a FAIL regardless of other evidence.
7. Operator: look after landing; the preset is already shipped by this card on the operator's 2026-11-09 decision, so the look is confirmation and a chance to rename.

## Contract test

- **Test file:** src/app/cyclicCaPresets.contract.test.cjs
- **Oracle command:** `npm run build:test && CYCLIC_PRESETS=1 node --test src/app/cyclicCaPresets.contract.test.cjs` (skips without the flag, so `npm test` stays green)
- **Assertions digest:** sha256:dadde805f1d85059d2c0b38dfb01a4f015b743891c18b16a0d83a5f91406dfbd
- **Oracle proof:** On the unchanged base `b318892d6` on 2026-11-09: 2 pass (incumbents, ranges and kernel defaults unchanged; thumbnail hash matches), 2 fail (`presetsFor("cyclic-ca")` has 3 entries, 4 expected; `docs/sweeps/2026-11-10-cyclic-ca-square-scrolls.md` missing). Without the flag all 4 skip. A throwaway green reference was not built: the preset assertion is a literal object and the kernel-range assertion passes today for the same values.

## Out of scope

Thresholds other than 1, von Neumann neighbourhoods, Brian's Brain and Game of Life (card 147's other kernels), any change to Demons, Turbulence or Crystal lattice, thumbnails, the stale 143/147 baseline re-runs (operator runbook in `HANDOFF.md`), and orchestration changes.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. Plan one median pair, about 5.0M. Preparation (orchestrator, 2026-11-09): a scratch live look at states 22, 23 and 24 and the frozen oracle, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the ranked table with seed spreads, the retained data and image paths, the browser screenshots' paths, and the plateau reading. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, headless Chromium included; Codex roles are sandboxed and this card declares Requires GUI. The sweep harness hard-codes `http://localhost:5173` for its in-page registry: check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first and, if another checkout's server is listening, stop and report rather than sweeping the wrong tree. Start Vite from the run worktree, run the checks, stop only the server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them.

## Readiness review

Baselines ran on `b318892d6` on 2026-11-09: `npm run build:test` green, the frozen oracle 2 of 4 red for the stated reasons, 4 of 4 skipped without the flag; verify figures carried from the 2026-11-08 run on the same tree. The operator's decision is `docs/UAT/uat.md` note 3. No cross-family cold read before queueing; the next orchestration session may add one here. Serial dispatch: shares `src/app/presets.ts`, `e2e/sweep.spec.ts` and `e2e/harness/sims.ts` with cards 157, 159 and 160.
