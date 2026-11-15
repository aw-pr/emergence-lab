# Stage card 158-cyclic-ca-square-scrolls: ship "Square scrolls"

## Metadata

- **Authored:** 2026-11-09
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/158-cyclic-ca-square-scrolls
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 2
- **Dispatch:** serial
- **Pairing rationale:** the production diff is one preset entry and a short promotion note. A Codex coding-tier worker suffices. The acceptance is partly visual, so the cross-family verifier is a Claude seat driving headless Chromium, the established pairing for preset promotions (cards 68, 69, 75, 151); at this size medium effort is enough. No frontier seat.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-09 (`docs/UAT/uat.md` note 3): states 23 "looks much better... actually feels like it does something", so the preset ships now. On 2026-11-11 the operator approved dropping the states 21 to 25 neighbour check ("yes to all", answering "Yes to shipping it without the side check?"): attempt 1 found states 25 is above the kernel's maximum of 24, and the orchestrator's 2026-11-09 look had already shown 22, 23 and 24 alike.

## Surfacing concern

Card 147's second pass ranked `147-cyclic-ca-c43` (states 23, threshold 1, Moore) first of 48 at 0.887 against Demons at 0.752 under the same method (`docs/sweeps/data/2026-10-30/147/cyclic-ca.json`, git-ignored, and `docs/sweeps/2026-11-08-operator-rerun.md`, Cyclic CA section). The 2026-11-08 report asked whether to check states 22 and 24 before adding it. The operator looked at it live on 2026-11-09 and said yes. An orchestrator look the same day at the desktop grid showed states 22, 23 and 24 all reading as nested square spirals at 1000 iterations, which suggests a plateau rather than a knife-edge. The planned neighbour sweep was dropped on 2026-11-11 (see Re-brief).

## Objective

Ship `square-scrolls` ("Square scrolls": states 23, threshold 1, Moore) as the fourth Cyclic CA preset, after the three incumbents and with Demons still the kernel default, and record the promotion in the Cyclic CA interestingness write-up.

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
- `src/app/cyclicCaPresets.contract.test.cjs`
- `src/app/shippedPresets.contract.test.cjs`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: a pure insertion after `crystal-lattice` in the `cyclic-ca` block: `{ id: "square-scrolls", label: "Square scrolls", params: { states: 23, threshold: 1, neighbourhood: "moore" } }`, with a comment in the style of the Turbulence entry citing card 147's c43 score (0.887 against Demons 0.752) and the operator's 2026-11-09 look.
2. `docs/sweeps/cyclic-ca-interestingness.md`: a dated `## Promotion: Square scrolls` section, appended after the existing sections, that names `147-cyclic-ca-c43`, gives its 0.887 score against Demons' 0.752 from the "Missed regimes — 2026-10-30 (stage 147)" section, states the preset's values in the words "states 23, threshold 1, Moore", quotes the operator's 2026-11-09 decision, and notes that the states 21 to 25 neighbour check was dropped on 2026-11-11 because the kernel caps states at 24.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`. No kernel, default, quality-profile or thumbnail change: Demons stays the kernel default and `public/thumbnails/cyclic-ca.png` is byte-for-byte unchanged.
- The three incumbent presets are unchanged. `git diff <base>..HEAD -- src/app/presets.ts` is a pure insertion of the new entry and its comment.
- Do not edit the frozen block in `src/app/cyclicCaPresets.contract.test.cjs`. `src/app/shippedPresets.contract.test.cjs` (card 151) and `e2e/presets-150.contract.spec.ts` (card 150) are frozen historical oracles; do not touch them or their cards.
- No sweep, harness or e2e change: `e2e/harness/sims.ts` and `e2e/sweep.spec.ts` are untouched.
- The browser check uses a server on `http://localhost:5173`; see Family-specific notes.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `cc650b520` plus the re-frozen oracle, 2026-11-11: 502 tests, 429 pass, 0 fail, 73 skipped. A stage that lands first may move the counts; 0 fail is the criterion. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `CYCLIC_PRESETS=1 node --test src/app/cyclicCaPresets.contract.test.cjs` passes all 4 tests with no skips. Planning base: 2 pass, 2 fail (three presets where four are expected; no `## Promotion: Square scrolls` section in `docs/sweeps/cyclic-ca-interestingness.md`), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier browser: with cleared storage open `#/cyclic-ca`; the Kernel preset select shows Demons' values (States 14, Threshold 1, Moore). Choose "Square scrolls": the controls read 23, 1 and Moore. Run to 1000 iterations at the desktop default grid and retain a screenshot; it reads as the Visual goal target. Retain a frame at 1200; it differs from the 1000 frame across the field, not only at a few cells. Press Reset and run again: same regime. A frozen or single-spiral field is a FAIL.
5. Verifier scope: the diff touches only the two deliverable paths. Any other path, or a changed line in an incumbent preset, is a FAIL regardless of other evidence.
6. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL); the preset is already shipped by this card on the operator's 2026-11-09 decision, so the look is confirmation and a chance to rename.

## Contract test

- **Test file:** src/app/cyclicCaPresets.contract.test.cjs
- **Oracle command:** `npm run build:test && CYCLIC_PRESETS=1 node --test src/app/cyclicCaPresets.contract.test.cjs` (skips without the flag, so `npm test` stays green)
- **Assertions digest:** sha256:7f4265e93998489e1ebe8ecb571a4a2104cae0ad7810401a5d9080d55d44b8a6
- **Oracle proof:** Re-frozen 2026-11-11 on the operator's approval to drop the neighbour check (old digest `sha256:dadde805f1d85059d2c0b38dfb01a4f015b743891c18b16a0d83a5f91406dfbd`, whose fourth test required a report covering "states 21" to "states 25"). The first three tests are unchanged; the fourth now requires a `## Promotion: Square scrolls` section in `docs/sweeps/cyclic-ca-interestingness.md` naming `147-cyclic-ca-c43`, "0.887", "states 23" and "Demons". On base `cc650b520`: 2 pass (ranges and kernel defaults; thumbnail hash), 2 fail (3 presets where 4 are expected; section missing). Without the flag all 4 skip. A scratch reference (the preset entry plus a minimal section) passed 4 of 4; the preset at states 24 failed the preset test, a section without "0.887" failed on that needle, and the needles outside a `## Promotion: Square scrolls` heading failed on the heading.

## Out of scope

The states 21 to 25 neighbour sweep (dropped 2026-11-11), any kernel range change, thresholds other than 1, von Neumann neighbourhoods, Brian's Brain and Game of Life (card 147's other kernels), any change to Demons, Turbulence or Crystal lattice, thumbnails, the stale 143/147 baseline re-runs (operator runbook in `HANDOFF.md`), and orchestration changes.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, p95 13.39M; verifier median 1.75M, p95 5.02M cached-inclusive tokens. At this size plan below one median pair, about 3M. Attempt 1 used 0.22M. Preparation (orchestrator, 2026-11-09 and 2026-11-11): a scratch live look at states 22, 23 and 24, the frozen oracle and its re-freeze, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the browser screenshots' paths, and the promotion section's text. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need a browser, headless Chromium included; Codex roles are sandboxed and this card declares Requires GUI. Check `lsof -nP -iTCP:5173 -sTCP:LISTEN` first and, if another checkout's server is listening, stop and report rather than checking the wrong tree. Start Vite from the run worktree, run the checks, stop only the server you started. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine; the Playwright config already passes them.

## Readiness review

Baselines ran on `b318892d6` on 2026-11-09: `npm run build:test` green, the frozen oracle 2 of 4 red for the stated reasons, 4 of 4 skipped without the flag; verify figures carried from the 2026-11-08 run on the same tree. The operator's decision is `docs/UAT/uat.md` note 3. No cross-family cold read before queueing; the next orchestration session may add one here. Serial dispatch: shares `src/app/presets.ts`, `e2e/sweep.spec.ts` and `e2e/harness/sims.ts` with cards 157, 159 and 160.

Re-checked 2026-11-11 on `cc650b520` for attempt 2: `npm run verify` exit 0 (502 tests, 429 pass, 0 fail, 73 skipped); the re-frozen oracle 2 of 4 red for the stated reasons and 4 of 4 skipped without the flag; `npx playwright test e2e/smoke.spec.ts` 43 passed. No cold read for the re-brief: it only removes scope. Serial dispatch: shares `src/app/presets.ts` with card 161, whose oracle checks only the sandpile presets.

## Re-brief (2026-11-11, attempt 2)

Attempt 1 (GPT-6.1 Sol) stopped before implementation and changed nothing: the card asked for states 21 to 25, and `src/sims/cyclic-ca/kernel.ts` caps states at 24 (`init` clamps 25 to 24), so the sweep could not be measured honestly. The worker was right to stop. The operator approved dropping the neighbour check entirely rather than shifting it to 20 to 24. This attempt ships the preset and a short promotion note only: the sweep config, sweep spec and standalone report deliverables are gone, the oracle's report test is replaced by a promotion-section test, and the sweep criterion is removed. Criteria 1 to 4 and the operator look are otherwise as before.

## Recovery log

- **Attempt 1:** dispatched 2026-11-10T22:20:45Z on base `0994cba13`. Worker FAIL before implementation (0.22M tokens), no diff, nothing to preserve. Diagnosis: card defect (states 25 above the kernel maximum of 24). Repair: scope cut and oracle re-freeze on 2026-11-11, operator-approved. Next: attempt 2.
