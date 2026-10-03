# Stage card 102-logistic-mandelbrot-cycle-interestingness-sweep: find the cycling settings that score highest, and show the operator

## Metadata

- **Authored:** 2026-10-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Base branch:** dev
- **Run branch:** autometta/102-logistic-mandelbrot-cycle-interestingness-sweep
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Gate:** stage-completed: 101-logistic-mandelbrot-cycle-interestingness-harness
- **Path claims:** e2e/cycle-interestingness.sweep.spec.ts, docs/sweeps/logistic-mandelbrot-cycle-interestingness.md
- **Dispatch:** serial
- **Pairing rationale:** a mechanical sweep over a fixed scorer goes to the Codex family, alternating the worker family from card 101 so the two cards draw on different provider windows. Opus 5.5 verifies cross-family: the checks are reproduction of a sample of candidates, arithmetic on the robustness table and a reading of whether the shortlist follows from the numbers. The verifier re-renders a sample, hence `Requires GUI` for both seats.
- **Type:** Sweep. No production code change; the recommendation is a shortlist for the operator, not a default change.

## Objective

Using card 101's scorer unchanged, sweep the cycling parameters of Logistic Mandelbrot in both Cycle and Inside-out modes, rank the candidates by `cycleInterestingness`, test whether the ranking survives re-weighting, and hand the operator a shortlist with contact sheets so the choice of default is made by eye from a short list rather than by the metric alone.

## Inputs (read these in your own context)

- `AGENTS.md`
- `docs/sweeps/logistic-mandelbrot-cycle-interestingness.md`: card 101's baseline, sensitivity results and its "What the sweep card may vary" section, which fixes the axes below unless it gives a measured reason to change them
- `e2e/harness/cycleScore.ts`, `e2e/cycle-interestingness.spec.ts`: the scorer and the capture pattern to reuse
- `e2e/harness/frame.ts` (`contactSheet`), `e2e/harness/report.ts`
- `docs/audits/2026-09-20-cycle-palette-sweep-audit.md`: why a single ranking was judged fragile and the ±20% robustness test it used
- `src/sims/logistic-mandelbrot/kernel.ts`: parameter keys, ranges and defaults
- `src/app/colormap.ts`: the shipped palette presets and which are cyclic

## Deliverables

1. `e2e/cycle-interestingness.sweep.spec.ts` (new, opt-in with `CYCLE_SWEEP=1`): the Cartesian sweep below, scored with card 101's scorer at card 101's three poses, each candidate in a fresh context, with per-candidate JSON, a contact sheet per top-ten candidate, and a ranked table under git-ignored `e2e/artifacts/logistic-mandelbrot-cycle-sweep/`. Axes, unless card 101's write-up gives a measured reason to adjust a range:
   - `colourMode`: cycle, inside-out
   - palette: every shipped cyclic preset plus magma, amber and rosewood
   - `cycleBands`: 1.5, 3, 5
   - `cycleSpeed`: 0.06, 0.1, 0.2
   - gamma and contrast: (1.65, 2.4) shipped, (1.2, 1.8), (1.2, 1.4)
   Run a coarse pass over all axes at the default pose first, then score the top twenty at all three poses. Report the total candidate count and wall-clock.
2. **Robustness.** Re-rank the top twenty under ±20% shifts of each weight in `cycleInterestingness` (one weight at a time, the scorer's exported terms, no re-rendering) and report how many of the top five survive each shift. State plainly whether the ranking is robust.
3. `docs/sweeps/logistic-mandelbrot-cycle-interestingness.md`: append a "Sweep" section: method, full ranked table for the top twenty with every component, the robustness table, the shipped default's rank in each mode, and a **shortlist of three per mode** with a contact sheet path each and one sentence on what distinguishes them to the eye. End with "Decision for the operator": the shortlist, no default change.

## Constraints

- The scorer is card 101's and is not edited, re-weighted in place, or bypassed. Re-weighting happens only in the robustness analysis, from the exported terms.
- No change under `src/`, `essays/`, `public/`, or to presets, defaults or any existing spec. The sweep document is appended to, not rewritten.
- Production renderer at the shipped quality, same poses and frame count as card 101. Camera parked, reveal and sweep off.
- Report the measured numbers whatever they say. A sweep whose top candidate is the shipped default is a valid result.
- Run every command in the foreground; never background a command or end a turn with one outstanding. Write the envelope as the final action.
- No new packages, no commits, no queue mutations.

## Acceptance criteria

The Opus 5.5 verifier runs every command independently in the run worktree.

1. **Regression and scope.** `npm run verify` green; only the claimed paths changed; `scripts/check-contract-test-gate.sh --worktree` exits 0.
2. **Sweep ran whole.** `CYCLE_SWEEP=1 npx playwright test e2e/cycle-interestingness.sweep.spec.ts --workers=1` completes with the candidate count the card's axes imply (or the adjusted count the write-up justifies), no skipped candidates, and the ranked table on disk matches the JSON (the verifier recomputes the ranking from the per-candidate JSON).
3. **Reproduction.** The verifier re-renders three candidates of its own choosing from the top twenty, including the top one, and finds `cycleInterestingness` within 0.03 of the sweep's value for each.
4. **Robustness is measured, not asserted.** The robustness table's survival counts follow from the exported terms (the verifier recomputes at least two shifts), and the write-up's robustness statement matches the table.
5. **Shortlist follows from the data.** Each shortlisted candidate is in the top twenty, has a contact sheet at the literal path given, and its one-sentence description matches what the verifier sees in that sheet. The shipped default's rank is stated for each mode.
6. **No default changed.** `git diff dev...HEAD -- src public` is empty.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Changing the default, palette set or scorer. The operator chooses from the shortlist; applying the choice is a direct commit after review.
- Camera choreography, geometry or performance.
- Other simulations.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 60 minutes
- Planning evidence, `state/cost-log.jsonl` read 2026-10-03: card 96, the nearest sweep precedent, cost 2.9M + 2.1M; card 100's browser-heavy pair cost 11.7M + 6.7M. Plan about 12M for the pair, about 30M with one outlier. Serial, gated on card 101.
- If the coarse pass cannot finish inside the timebox, reduce the palette axis to the cyclic presets plus magma, say so, and deliver the rest in full.

## Dispatch envelope

Worker returns changed paths, commands with exit codes, candidate count, wall-clock, the top-five table, the robustness summary and the shortlist in `state/envelopes/102-logistic-mandelbrot-cycle-interestingness-sweep.json`, written as the final action. Verifier writes `state/verifiers/102-logistic-mandelbrot-cycle-interestingness-sweep.json` with one result and literal evidence per criterion.

## Family-specific notes

Codex worker: `Requires GUI: true` widens the sandbox so the worker can launch headless Chromium with the repo's GPU flags; the operator confirmed the codex seat drives the GPU as of 2026-09-20 (card 96). Claude verifier: subscription CLI route; resolve `claude-opus-5-5` through the installed model resolver, no family substitution.
