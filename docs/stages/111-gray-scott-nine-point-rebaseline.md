# Stage card 111-gray-scott-nine-point-rebaseline: re-baseline the Gray-Scott sweep, its pinned scores and the presets on the nine-point stencil the app now ships

## Metadata

- **Authored:** 2026-10-09
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/111-gray-scott-nine-point-rebaseline
- **Worker effort:** xhigh
- **Verifier effort:** xhigh
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** queue-empty
- **Dispatch:** serial
- **Pairing rationale:** a measurement-and-judgement card on the priority kernel: a browser sweep, regenerated pinned literals, and a character check of six presets that only frames can settle. Sol at xhigh takes the worker seat on the Codex subscription (the operator wants this window spent on a frontier-tier brief); `Requires GUI` lets it drive the sweep's browser. Opus 5.5 verifies across the family boundary on the Claude subscription and does the visual adjudication. Astra is not seated: it spends a Codex five-hour window too fast for a run this long.

## Objective

On 2026-09-08 the operator shipped the nine-point Laplacian as the Gray-Scott default (`3390cff76`, overriding card 85's "do not switch"). That commit touched only the kernel, its unit test and the thumbnail. Everything that measures Gray-Scott still describes the five-point simulation:

1. `e2e/harness/sims.ts` `GRAY_SCOTT` (about line 122) sets no stencil, so the sweep now silently measures nine-point, while `e2e/sweep.spec.ts` "non-phase Gray-Scott scores are unchanged" (about line 429) pins Coral's six metrics to five-point literals (score `0.7102674508287455`). The test is expected to fail on `dev` today; confirm it.
2. `docs/sweeps/gray-scott-interestingness.md` holds five-point numbers throughout (the 56-set grid, the reference rows, the 2026-09-02 and 2026-09-03 tables) and says at about line 960 that the kernel defaults to five-point. Its own switch-cost list (about lines 978-999) is this card's checklist.
3. The `GRAY_SCOTT` references still include the retired u-skate preset, and its comment says seven shipped presets; `src/app/presets.ts` ships six.
4. Card 85 checked only Waves and Coral on nine-point. Spots, Worms, Maze and Mitosis were tuned on five-point and have never been checked on nine-point.
5. The stencil's info text (`src/sims/gray-scott/kernel.ts` about line 176) and doc comment (about lines 36-42) still say five-point is what every preset was tuned on.
6. Card 84's sub-unit timestep was measured under five-point only.

This card re-baselines all of it on nine-point. It changes no kernel behaviour, default, preset value or metric. Where a preset no longer reads as its name on nine-point, the audit recommends a retune with candidate F and k from the new grid; the operator decides, and a later card makes the change.

## Inputs (read these in your own context)

- `AGENTS.md`, `docs/INTERFACE.md`
- `git show 3390cff76` (the switch and its reasoning)
- `src/sims/gray-scott/kernel.ts` (params, stencils, step), `src/sims/gray-scott/kernel.test.cjs` (stencil and dt tests)
- `src/app/presets.ts` (about lines 10-48)
- `e2e/harness/sims.ts` (`GRAY_SCOTT` and the metric helpers it uses), `e2e/sweep.spec.ts` (about lines 380-450 and the `sweep gray-scott F/k surface` test, about line 564)
- `docs/sweeps/gray-scott-interestingness.md`: read by range. The run instructions, the reference table, and the card 84 and 85 appendices including "Recommendation: do not switch" and the switch-cost list (about lines 940-1004)
- `scripts/generate-thumbnails.mjs` (how frames are captured from the app)
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `e2e/harness/sims.ts`: `GRAY_SCOTT.baseParams` and every reference set `stencil: "nine-point"` explicitly, so a later default change cannot shift the sweep silently. The u-skate reference is removed and the comment says six shipped presets. Nothing else in the harness changes.

2. `e2e/sweep.spec.ts`: the literals in "non-phase Gray-Scott scores are unchanged" are regenerated from the nine-point run. The test title stays. The frozen block between `AUTOMETTA-CONTRACT-BEGIN card=docs/stages/70-gray-scott-rebaseline.md` and `AUTOMETTA-CONTRACT-END` is not edited. Nothing else in the file changes.

3. `docs/sweeps/gray-scott-interestingness.md`: a new dated section, "Nine-point re-baseline (2026-10, card 111)", appended at the end. It holds the full regenerated 56-set grid; the six reference rows; a five-point against nine-point comparison table for the references, from the existing tables; the top-ranked regimes on each stencil and how the ranking moved; and the card-84 timestep check (deliverable 5). Existing sections are history and are not rewritten. Add only a one-line dated note under the line at about 960 pointing to the new section.

4. **Preset character check**, written into the audit. For each of the six presets (Mitosis, Coral, Worms, Maze, Spots, Waves), capture frames in the app at the default quality tier and canvas, on both stencils (`stencil` set explicitly), at matched step counts, with at least two time points per preset (one early, one settled). For each preset, record whether it still reads as its name on nine-point, and what changed: feature size, density, motion or regime. Where it does not, recommend a retune with candidate F and k taken from the nine-point grid, with the grid cell and score cited. Frames go under git-ignored `e2e/artifacts/gray-scott-rebaseline/`.

5. **Card-84 interaction.** Coral and Waves on nine-point at dt 1, 0.5 and 0.25 (stepsPerFrame scaled so simulated time per frame matches): the six metrics at 128², and whether the regime changes. Record it in the sweep-doc section.

6. `src/sims/gray-scott/kernel.ts`: copy only. The stencil `info` text and the doc comment say that nine-point is the shipped default and that the presets were tuned on five-point and re-checked on nine-point in card 111. No behaviour, default, range or option changes.

7. `docs/audits/111-gray-scott-nine-point-rebaseline.md` (new): the failing-literal confirmation on the unchanged tree (deliverable 1's expected failure, with output); the commands run and their wall-clock; the preset table from deliverable 4 with literal frame paths; the retune recommendations, if any; each criterion's result with literal evidence paths; unresolved limitations.

Supporting changes are allowed only where these deliverables need them: an `e2e/` helper for the frame capture, if `scripts/generate-thumbnails.mjs` cannot be reused as is.

## Constraints

- No kernel behaviour, default, range, preset value, metric, composite score or renderer change. `src/sims/gray-scott/kernel.ts` changes in comments and the `info` string only.
- The frozen block in `e2e/sweep.spec.ts` (card 70's contract) is not edited, and neither are the frozen blocks in `src/app/*.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts`.
- Existing sweep-doc sections are not rewritten; the new numbers are appended.
- `public/thumbnails/gray-scott.png` is not regenerated (`3390cff76` already did).
- No expected value is written into a test before it is measured: the regenerated literals come from a run, and a second run must reproduce them exactly.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless with the repo's GPU flags. Use port 5173.
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The verifier runs every command independently in the run worktree and judges all rows. No required suite may pass with zero collected tests.

1. **Static gates and unit tests.** `npm run verify` passes, including `src/sims/gray-scott/kernel.test.cjs`. `scripts/check-contract-test-gate.sh --worktree` exits 0. `git diff --stat` against the dispatch base lists only the files named in the deliverables (plus an `e2e/` capture helper if one was added).
2. **The pinned scores are nine-point and reproducible.** `npx playwright test e2e/sweep.spec.ts --workers=1` passes every test it collects without `SWEEP=1`, including the card-70 contract test and "non-phase Gray-Scott scores are unchanged". Run it twice; both pass. The audit shows the same test failing on the dispatch base with the old literals.
3. **The harness pins the stencil.** The verifier reads `GRAY_SCOTT` and confirms that `stencil: "nine-point"` is set in `baseParams` and in all six references, and that u-skate is gone.
4. **The grid is regenerated.** `SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "gray-scott" --workers=1` completes. The verifier spot-checks at least three grid cells and all six reference rows in the new sweep-doc section against the run's output, and confirms the section is appended with the old sections intact (a `git diff` of the doc shows additions only, apart from the one-line note).
5. **Preset frames exist and support the audit's verdicts.** For all six presets, frames on both stencils at both time points exist under `e2e/artifacts/gray-scott-rebaseline/`. The verifier opens them and records, preset by preset with literal paths, whether it agrees with the worker's verdict. Disagreement on a preset's verdict fails this criterion. Whether a retune is wanted is the operator's call and is not a criterion.
6. **The timestep check is recorded.** The sweep-doc section has the dt 1, 0.5 and 0.25 table for Coral and Waves on nine-point, with the commands that produced it.
7. **Copy only in the kernel.** `git diff` of `src/sims/gray-scott/kernel.ts` touches only comment lines and the stencil `info` string.

## Contract test

- **Test file:** e2e/sweep.spec.ts
- **Assertions digest:** `sha256:d423a74581557368b535a0be297459def702f2f9357ee38f77e191e8e164d676`

Card 70's frozen block, unchanged: the metric stack rewards Coral's structure over a washout. It survives the stencil switch; this card owns the file and must leave the block byte-identical. It does not cover the regenerated literals, the grid, the frames or the copy; criteria 2 to 7 remain mandatory.

## Authoring verification

On dev at `108cf1676`, 2026-10-09: `src/sims/gray-scott/kernel.ts` defaults `stencil` to nine-point (since `3390cff76`); `e2e/harness/sims.ts` `GRAY_SCOTT.baseParams` is `{ Du: 0.2097, Dv: 0.105, stepsPerFrame: 20 }` with no stencil, and its references include u-skate; `e2e/sweep.spec.ts` pins Coral's score at `0.7102674508287455` (a five-point figure from card 70's era); `scripts/check-contract-test-gate.sh print e2e/sweep.spec.ts` prints the digest above. The sweep doc's switch-cost list (about lines 978-999) names the same five items this card covers. That the pinned-literal test currently fails was inferred from the commit's scope, not run; deliverable 7 confirms it.

## Out of scope

- Changing any preset value or default (a later card, after the operator reads the audit).
- A GPU compute path for Gray-Scott (it changes the kernel-to-renderer contract and needs its own versioned decision first).
- Gliders and U-skate (closed by cards 73, 76 and 84).
- Other simulations, the thumbnail, release or deployment.

## Budget

- **Worker wall-clock:** 300 minutes
- **Verifier wall-clock:** 180 minutes
- Planning evidence: Sol workers on this repo's measurement cards spent 7M to 19M tokens (cards 106, 108, 109); a single-pair sweep drive takes 75-115 ms (sweep doc, about line 281), so the 56-set grid is minutes, not hours. The preset frames are the long pole. Plan 20M for the worker and 8M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/111-gray-scott-nine-point-rebaseline.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all seven.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing. Headless Chromium needs the repo's existing GPU flags (`playwright.config.ts`); `Requires GUI: true` widens the codex worker seat so it can launch the browser. Codex worker: run every command in the foreground and write the envelope as your final action.
