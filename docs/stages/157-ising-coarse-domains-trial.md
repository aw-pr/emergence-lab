# Stage card 157-ising-coarse-domains-trial: the Ising "Coarse domains" candidate as a research-bench trial with fresh evidence

## Metadata

- **Authored:** 2026-11-09
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/157-ising-coarse-domains-trial
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** the trial catalogue change is small but touches the library's data contract (stage-aware ids, badges and the deep link) and the evidence needs the 146 harness driven correctly; an Opus 5.5 worker lands that in one attempt. Checking the criteria is reading plus one browser session, so the cross-family verifier is the Codex coding tier, as on cards 154 and 155. No frontier seat: the operator gives the final look.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-09 (`docs/UAT/uat.md` note 5 and the follow-up chat): re-run the Ising candidate that scored well on card 146 so it can be seen. The orchestrator chose the trial-preset vehicle so the look is live in the app, and named it "Coarse domains" after its appearance; the operator may rename it at the look.

## Surfacing concern

Card 146's second Ising pass ranked `146-ising-c04` (temperature 2.38, coupling 1.4, random start, field 0, 0.5 updates per frame) third of 48 at 0.565 with temporal flux 0.060: an ordered-phase regime whose domains keep moving, the only plausible lead the 2026-11-08 judge found (`docs/sweeps/2026-11-08-operator-rerun.md`, Ising section). Card 146 failed verification over its sandpile conservation diagnostics, so none of its retained evidence is accepted, and its images live only in git-ignored folders on one machine. The operator asked on 2026-11-09 to re-run it and see it.

An orchestrator look on 2026-11-09 at the desktop default grid (scratch screenshots, not retained in the repo) showed large two-tone domains at 300 iterations that coarsen into smooth, slowly drifting blobs by 1500, visibly coarser and calmer than Critical domains at the same iteration. That is a look, not a measurement.

## Objective

Make the candidate openable in the app as a read-only trial, "Coarse domains", listed in the Presets library's research bench beside the nine stage-144 trials, each trial carrying the stage that produced it, and reachable by the deep link `#/ising-model?preset=trial-157-ising-model-temperature2.38_coupling1.4`. Re-measure it under the card-146 method against the shipped Critical domains preset with fresh, independently replayable evidence, and render both at the app's desktop grid at equal iteration counts. Change no shipped preset.

## Visual goal

Operator's words: "rerun the ising card that scored well id like to see it."

- Target: a two-tone spin field whose domains are several times coarser than Critical domains at the same iteration, with smooth boundaries that still drift between frames 1000 apart. Not a frozen block pattern (Cold quench) and not fine fractal noise (Critical domains).
- Failure: a trial that opens at the kernel defaults, a field that stops moving by 3000 iterations, or a library where the nine stage-144 rows change id, name or badge.

## Inputs (read these in your own context)

- `docs/UAT/uat.md`
- `docs/sweeps/2026-11-08-operator-rerun.md`
- `docs/sweeps/ising-model-interestingness.md`
- `src/app/trialPresets.ts`
- `src/app/presetLibrary.ts`
- `src/app/router.ts`
- `src/sims/ising-model/kernel.ts`
- `e2e/harness/sims.ts`
- `e2e/sweep.spec.ts`
- `e2e/presets-150.contract.spec.ts`
- `e2e/trial-157.contract.spec.ts`
- `e2e/trial-157.config.ts`
- `docs/INTERFACE.md`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/trialPresets.ts`: each source row carries its stage; ids become `trial-<stage>-<slug>-<row>` and source ids `<stage>:<slug>:<row>:<origin>`. The nine existing rows keep stage 144 and the origin `shipped`, so their ids and source ids are byte-identical to today. Add one row: slug `ising-model`, name `Coarse domains`, row `temperature2.38_coupling1.4`, stage 157, origin `146-ising-c04`, params `{ temperature: 2.38, coupling: 1.4, externalField: 0, sweepsPerStep: 0.5, initialState: "random" }`.
2. `src/app/presetLibrary.ts`: the trial badge reads `Trial · stage <n>` from the entry, and the research-bench description no longer states a count. Nothing else in the library changes.
3. `e2e/sweep.spec.ts`: an additive `sweepTest("sweep 157 ising-model coarse domains", …)` reusing `gcCapture`, `gcScore` and `rdRender` with the `sweep-146-ising-model` configuration: the candidate and the four `146-current-*` references at 128², captures at 100/300/900, long horizon 3000, sizes 64/256, seeds 7/11/23; app renderer screenshots at the desktop default grid for the candidate and Critical domains at 300, 1500 and 3000 iterations. Output to `docs/sweeps/data/2026-11-10/157/` and `docs/images/sweeps-2026-11-10/` (both git-ignored; evidence stays local, as every sweep's does) and `e2e/artifacts/sweep-157-ising-model/report.md`.
4. `docs/sweeps/2026-11-10-ising-coarse-domains.md`: method, the ranked row for `146-ising-c04` beside the four references, the seed spread, finite-size and long-horizon readings, the image file names, the deep link id `trial-157-ising-model-temperature2.38_coupling1.4`, and a "Decision for the operator" section (promote to a shipped Ising preset, keep as a trial, or drop).
5. `docs/sweeps/ising-model-interestingness.md`: a short dated pointer to deliverable 4 under a new heading.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`. No shipped preset, kernel, default, quality profile or interface change.
- The nine stage-144 trials keep their ids, names, rows, params and source ids. Any change to them is a FAIL.
- `e2e/presets-150.contract.spec.ts` is card 150's frozen oracle and is already stale (its diff guard against `8803cd42c` has been non-empty since `8cda459a4`); do not edit it, its digest or its card. It is not an acceptance gate here.
- Do not edit the frozen block in `e2e/trial-157.contract.spec.ts` or `e2e/trial-157.config.ts`.
- The sweep harness hard-codes `http://localhost:5173` for its in-page registry; see Family-specific notes before starting a server.
- No absolute home-directory paths in any committed file. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `b318892d6`: 480 tests, 429 pass, 0 fail, 51 skipped; typecheck and build green. Skips are not passes.
2. Worker and verifier: `TRIAL_CONTRACT=157 npx playwright test -c e2e/trial-157.config.ts` exits 0 with 3 tests run and none skipped. Planning base: 3 failed (no `ising-model` trial row; the deep link opened the kernel defaults, temperature 2.269; the report is missing), which is the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0 (the frozen block's digest is unchanged).
4. Verifier browser: with cleared storage open the deep link above at the desktop default grid; the Temperature, Coupling, External field, Updates per frame and Initial state controls read 2.38, 1.4, 0, 0.5 and random. Run to 1500 iterations and retain a screenshot; the field reads as the Visual goal target, clearly coarser than a fresh load of Critical domains at 1500 iterations (retain that screenshot too). Take a further frame at 3000; it differs from the 1500 frame. A field that reads like Critical domains, or one that has stopped moving, is a FAIL.
5. Verifier: run `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 157 " --workers=1` yourself; the candidate's ranked metrics and every reference's metrics match the worker's retained `docs/sweeps/data/2026-11-10/157/ising-model.json` within absolute 1e-9, and the seed, finite-size and long-horizon readings are all present and finite. Report any larger deviation as FAIL rather than widening the tolerance.
6. Verifier scope: `git diff --name-only <base>..HEAD` lists only `src/app/trialPresets.ts`, `src/app/presetLibrary.ts`, `e2e/sweep.spec.ts`, `e2e/harness/sims.ts` (only if a config was needed), `docs/sweeps/2026-11-10-ising-coarse-domains.md` and `docs/sweeps/ising-model-interestingness.md`. `git diff <base>..HEAD -- src/app/presets.ts src/sims` is empty.
7. Operator, not judged or recorded by either seat: a separate look after a PASS lands the stage on `dev`; the verifier reports it as not applicable, never as FAIL. Promotion to a shipped preset is a new card, never part of this one.

## Contract test

- **Test file:** e2e/trial-157.contract.spec.ts
- **Oracle command:** `TRIAL_CONTRACT=157 npx playwright test -c e2e/trial-157.config.ts` (the config starts its own server on 127.0.0.1:5187 and refuses an existing one)
- **Assertions digest:** sha256:f2637cab4382d06ba778699447d6f44272657778928a11676074b16d4c9a107e
- **Oracle proof:** On the unchanged base `b318892d6` on 2026-11-09, `TRIAL_CONTRACT=157 npx playwright test -c e2e/trial-157.config.ts` ran 3 tests and all 3 failed: the library has no trial row for `ising-model`, the deep link opened the kernel defaults, and `docs/sweeps/2026-11-10-ising-coarse-domains.md` does not exist. The shipped-preset equality inside the third test passes on the base (the four Ising presets are as frozen). A throwaway green reference was not built: the assertions are literal values and DOM shapes that `e2e/presets-150.contract.spec.ts` already exercises for the stage-144 trials, and the independent verifier runs the real test on the worker's tree.

## Out of scope

Shipped Ising presets, kernel changes, the sandpile and DLA parts of card 146, any re-verification of card 146 itself, the Presets library's personal-preset features (cards 150, 155, 156), and the other 146 Ising finalists c03 and c01 (near-frozen; they risk duplicating Cold quench).

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 60 minutes
- **Spend basis:** last 40 emergence-lab dispatches in `state/cost-log.jsonl`: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. Plan one median pair, about 5.0M; one p95 pair of 18.4M is reserve, not permission. Preparation (orchestrator, 2026-11-09): evidence reading, a scratch live look and the frozen oracle, inside the interactive session, not logged to cost-log.

## Dispatch envelope

Return the exact commands run and their exit codes, the deep link, the ranked row and reference rows with their metrics, the retained data and image paths, the screenshots' paths, and anything that did not reproduce. State PASS, FAIL or partial honestly. Stop at wall-clock or on an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, headless Chromium included. The sweep harness (`e2e/sweep.spec.ts`) hard-codes `http://localhost:5173` for its in-page registry, so a sweep run needs a Vite server for the run worktree on 5173: check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first; if another checkout's server is listening, stop and report rather than running the sweep against the wrong tree. Start Vite from the run worktree, run the checks, and stop only the server you started. The contract config starts its own server on 5187 and refuses an existing one. Codex roles are sandboxed; this card declares Requires GUI so their browser can start.

## Readiness review

Baselines ran on `b318892d6` on 2026-11-09: `npm run verify` (figures above, from the 2026-11-08 run on the same tree), the frozen contract (3 of 3 red for the reasons stated), `npm run build:test` green. The operator's decision is in `docs/UAT/uat.md` note 5 and the 2026-11-09 chat. No cross-family cold read was done before queueing; the next orchestration session may add one and record it here. Serial dispatch: this card shares `e2e/sweep.spec.ts` and `e2e/harness/sims.ts` with cards 158 and 160, and `src/app/trialPresets.ts` with card 160, which is gated on this card.
