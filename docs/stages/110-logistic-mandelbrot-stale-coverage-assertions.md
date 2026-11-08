# Stage card 110-logistic-mandelbrot-stale-coverage-assertions: pin exposure in the packed-cells and refine-levels measurements, and restate card 106's baseline comparison as a regression rule

## Metadata

- **Authored:** 2026-10-09
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/110-logistic-mandelbrot-stale-coverage-assertions
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** queue-empty
- **Dispatch:** serial
- **Pairing rationale:** a test-only repair to two e2e suites with the cause already diagnosed, so a mid-tier Codex worker on the subscription is enough; `Requires GUI` lets it launch Playwright. Sonnet 5.5 verifies across the family boundary on the Claude subscription and reruns the suites against the served baseline. `queue-empty` keeps it off ports 5173 and 5174 while any other stage's checks are using them.

## Objective

Four assertions in the served-baseline suites fail identically on `dev` and on any tree cut from it (card 109's audit, criterion 1 row; re-brief 2 of card 109). None of them detects a product defect:

1. **Absolute lit-fraction bars measured at an exposure that is no longer the default.** `frozenParams` (`e2e/harness/insideOut.ts` about line 30) pins edge glow and the motion params but not exposure, and both suites' `cloudParams` build on it. Cards 103 to 106 set these bars when the shipped exposure default was 3. Since `94d749753` (3 to 0.5) and `a3e1c198b` (0.5 to 0.6), the same lattice renders about five times dimmer, and the lit fraction over the fixed `LIT_THRESHOLD` fell, for example from at least 0.15 to 0.0198 for the cardioid plane:
   - `e2e/packed-cells.spec.ts` "the cardioid lattice keeps its density at tail refinement 0.6 on both live paths, and on the served baseline" (about line 196, `>= 0.15`)
   - `e2e/packed-cells.spec.ts` "Plotted iterations hides rows in the shader and density leaves the visible count alone" (about lines 289-291, `> 0.05`)
   - `e2e/packed-cells.spec.ts` "a bake stays stacked and draws as before" (about line 470, `> 0.1`)
   - `e2e/refine-levels.spec.ts` "more tail detail where the tails are at 0.3 and 0.6, above the baseline, with the plane unchanged" (its `plane0.fraction >= 0.15`, about line 375)
2. **A comparison that only held against a pre-106 baseline.** The same `refine-levels` test asserts `current6.mean > baseline6.mean` ("0.6 denser than the baseline at 0.6"). Card 106 wrote it when the served baseline lacked card 106's change. Against an unchanged baseline the two trees are identical and strictly-greater cannot hold.

The fix: pin `exposure: 3` in the two spec-local `cloudParams` helpers, so these measurements see the tone they were calibrated against, and restate the card-106 comparison as a regression rule. No bar is lowered, and no product code changes.

If pinning exposure 3 does not bring a bar back on the unchanged baseline, stop and report the measured values. Do not lower the bar, change `LIT_THRESHOLD` or move the measurement rectangle.

## Inputs (read these in your own context)

- `AGENTS.md`
- `e2e/packed-cells.spec.ts` (about lines 80-200, 246-297, 442-476)
- `e2e/refine-levels.spec.ts` (about lines 55-70, 322-378)
- `e2e/harness/insideOut.ts` (`frozenParams`), `e2e/harness/packedCells.ts` (origins, `openPacked`, `cloudStats`)
- `src/sims/logistic-mandelbrot/kernel.ts`: the `exposure` param (default and range)
- `git show 94d749753 a3e1c198b` (the two exposure default changes)
- `docs/audits/107-extreme-pool.md`, "Serving the baseline" (the no-HMR baseline recipe)
- `playwright.config.ts`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `e2e/packed-cells.spec.ts`: `cloudParams` sets `exposure: 3` (before the overrides, so a test can still override it). Nothing else in the file changes.
2. `e2e/refine-levels.spec.ts`: `cloudParams` sets `exposure: 3` the same way. In "more tail detail where the tails are at 0.3 and 0.6, above the baseline, with the plane unchanged", replace the "0.6 denser than the baseline at 0.6" assertion with a regression rule: `current6.mean` is at least `baseline6.mean * 0.98` (no thinner than the served baseline), with the message "0.6 no thinner than the baseline at 0.6". Rename the test only if its title must change to stay true, and record any rename. Every other assertion in the file is unchanged.
3. `docs/audits/110-stale-coverage-assertions.md` (new): the cause of each of the four failures, with the measured values before and after on both trees; each edited line with file, line and why; each criterion's result with literal evidence paths under git-ignored `e2e/artifacts/` (the suites' existing artifact folders).

`frozenParams` and `e2e/harness/*.ts` are not edited: other suites and a frozen contract use them.

## Constraints

- No product code changes: nothing under `src/` changes, and no kernel default changes.
- No bar is lowered and no threshold, rectangle, pose or measurement helper changes. The only edits are the exposure pin in the two `cloudParams` helpers and the one restated comparison.
- The frozen blocks in `src/app/*.contract.test.cjs` and `e2e/inside-out-cycling.contract.spec.ts` are not edited.
- Run every command in the foreground and wait for it to exit. Never use `run_in_background`, `&`, `nohup` or a monitor, and never end a turn while a command is outstanding; the baseline server runs in a detached tmux session as the audit 107 recipe shows. Keep context lean: read large files by range and do not dump full logs. Write the dispatch envelope as the final action; a partial result with an envelope is better than none.
- Browser checks run headless with the repo's GPU flags. Port 5173 serves the tree under test and 5174 the baseline (`--strictPort`).
- No new packages, no commits by the worker, no queue mutations, no deployment.

## Acceptance criteria

The verifier runs every command independently in the run worktree and judges all rows. No required suite may pass with zero collected tests. The served baseline is the dispatch base (`dev` as cut) on port 5174 by the audit 107 recipe; a missing baseline fails the criterion that needs it.

1. **Static gates.** `npm run verify` passes. `scripts/check-contract-test-gate.sh --worktree` exits 0, or exits 2 reporting no relevant files to inspect (this card declares no contract test). `git diff --stat` against the dispatch base lists only `e2e/packed-cells.spec.ts`, `e2e/refine-levels.spec.ts` and `docs/audits/110-stale-coverage-assertions.md`.
2. **packed-cells passes.** Bake the fixture first: `npm run build:test && node scripts/bake-orbit3d.mjs --points 2e5 --warmup 2000 --samples 8 --out public/baked/lm-tiny.elpc`. With the baseline served: `npx playwright test e2e/packed-cells.spec.ts --workers=1` passes every test. The three lit-fraction values named in the Objective are recorded for both trees from `plane-coverage.json`, `plotted.json` and `prebaked.json`.
3. **refine-levels passes.** With the baseline served: `npx playwright test e2e/refine-levels.spec.ts --workers=1` passes every test. `tail-density.json` records `current6.mean`, `baseline6.mean` and `plane0.fraction`, and the ratio `current6.mean / baseline6.mean` is reported.
4. **The edits are the ones permitted.** The verifier reads the diff and confirms: `exposure: 3` is added only in the two `cloudParams` helpers; the only changed assertion is the card-106 comparison, now at least `baseline6.mean * 0.98`; no threshold, bar, rectangle, pose or helper changed.
5. **Neighbouring suites still pass.** With the baseline served: `npx playwright test e2e/tail-default.spec.ts --workers=1` and `npx playwright test e2e/inside-out-cycling.spec.ts --grep 'spread|chaotic|controls and cache|hierarchy' --workers=1` pass, and `INSIDE_OUT_CYCLING=1 npx playwright test e2e/inside-out-cycling.contract.spec.ts --workers=1` passes (4 tests).

## Contract test

None. This card repairs e2e assertions and declares no contract test; criterion 1's gate wording covers the gate's exit 2.

## Authoring verification

On dev at `79094934d`, 2026-10-09: `frozenParams` in `e2e/harness/insideOut.ts` pins `edgeGlow: 0` but not `exposure`; `cloudParams` in both specs is `frozenParams({ boundaryDetail: 0, tailRefinement: 0, ...overrides })`. The kernel's exposure default moved from 3 to 0.5 at `94d749753` and to 0.6 at `a3e1c198b`, after cards 103 (`b6a4f9c6d`) to 106 (`5d8bd5b09`) set the bars. Card 109's worker measured both trees (current = baseline at boundary detail 0) at plane coverage 0.01976 against `>= 0.15`, plotted cardioid 0.04516 against `> 0.05` and prebaked plotted-1 0.09906 against `> 0.1` (card 109 audit, criterion 1 row). That exposure 3 restores each bar is inferred from the calibration history, not measured; the Objective's stop condition covers it.

## Out of scope

- Any change under `src/`, any default, any other e2e suite, `frozenParams`, the harness.
- Lowering, re-deriving or removing any bar.
- Release or deployment.

## Budget

- **Worker wall-clock:** 150 minutes
- **Verifier wall-clock:** 120 minutes
- Planning evidence: the two suites take about 6 and 3 minutes per run on this machine (card 109's worker log); a test-only card of this size has run under 5M worker tokens. Plan 5M for the worker and 3M for the verifier. Serial.
- Stop with an explicit partial result if the remaining checks cannot be covered. A retry needs a re-brief.

## Verification

Verifier writes the schema-valid `state/verifiers/110-logistic-mandelbrot-stale-coverage-assertions.json` with one result and literal evidence paths per numbered criterion. Overall PASS requires all five.

## Family-specific notes

Both roles use the repo's subscription CLI routes; do not change auth routing. Headless Chromium needs the repo's existing GPU flags for WebGL2 (`playwright.config.ts`); `Requires GUI: true` widens the codex worker seat so it can launch the browser. Codex worker: run every command in the foreground and write the envelope as your final action.
