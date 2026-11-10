# Stage card 159-sandpile-sandstorm-preset: promote the operator's Test1 sandpile to "Sandstorm"

## Metadata

- **Authored:** 2026-11-09
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/159-sandpile-sandstorm-preset
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 2
- **Dispatch:** serial
- **Pairing rationale:** the diff is one literal preset entry and a short note, so a Claude coding-tier worker suffices, alternating family after card 158's Codex worker. The acceptance is a live look at a CPU-heavy preset plus a cost measurement, so the cross-family verifier is the Codex coding tier driving headless Chromium. No frontier seat: the operator chose the values themselves. Attempt 2 is a repair (Re-brief 1): the worker restores attempt 1 unchanged and the Sol verifier drops to medium, scoped to the corrected first sentence of criterion 4 and the cheap criteria.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-09 (`docs/UAT/uat.md` note 2: "sandpile seems to be better with higher topple, see the preset test1"). The orchestrator read the saved Test1 values from the operator's browser store and chose the label "Sandstorm" after the look (a thousand grains a step, two million topples); the operator may rename it at the look. The preset is added; the three incumbents stay.

## Surfacing concern

The 2026-11-08 sweep re-run proposed a different sandpile candidate (pile 60 000, threshold 5, 32 grains) and asked for a live look. The operator instead tuned the sim by hand to every slider's maximum and saved it as "Test1": initial pile 15 650 000, topple threshold 12, 1000 grains per step, 2 000 000 topples per step, at the ultra grid with the sand palette. An orchestrator screenshot run on 2026-11-09 at ultra showed a wide, fine-grained terraced disc that keeps growing (radius about a third larger between 300 and 900 iterations) with diamond motifs at its rim, against High threshold's small dense mandala at the same iteration. The cost is real: the sandpile steps on the CPU and Test1 ran at about 13 fps at ultra on this machine against 80 fps for High threshold.

## Objective

Ship `sandstorm` ("Sandstorm": initialPile 15650000, toppleThreshold 12, grainsPerStep 1000, topplesPerStep 2000000) as the fourth Abelian sandpile preset, after the three incumbents, with the kernel defaults unchanged, and record its provenance and measured cost in a short note.

## Visual goal

Operator's words: "sandpile seems to be better with higher topple."

- Target at ultra, 600 iterations: a large circular pile filling roughly half the canvas height, densely textured with fine radial grain and terraces, still expanding at its rim, with the triangular and diamond motifs the sandpile's symmetry produces along the edge.
- Failure: a pile that stops growing, a blank or saturated disc, or a preset whose controls do not read the four values after a fresh load.

## Inputs (read these in your own context)

- `docs/UAT/uat.md`
- `docs/sweeps/2026-11-08-operator-rerun.md`
- `docs/sweeps/abelian-sandpile-interestingness.md`
- `src/app/presets.ts`
- `src/sims/abelian-sandpile/kernel.ts`
- `src/app/sandpilePresets.contract.test.cjs`
- `src/app/shippedPresets.contract.test.cjs`

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/presets.ts`: a pure insertion after `high-threshold` in the `abelian-sandpile` block: `{ id: "sandstorm", label: "Sandstorm", params: { initialPile: 15650000, toppleThreshold: 12, grainsPerStep: 1000, topplesPerStep: 2000000 } }`, with a comment recording that the operator tuned it by hand on 2026-11-09 (saved as Test1) and that it is CPU-heavy at ultra.
2. `docs/sweeps/2026-11-10-sandpile-sandstorm.md`: provenance (Test1, `docs/UAT/uat.md` note 2), the exact values, the measured frames per second at the ultra and high grids on the worker's machine at 300 and 600 iterations (record the machine's frame cap), two screenshot file names under `e2e/artifacts/sandpile-sandstorm-2026-11-10/` (git-ignored), a comparison line against High threshold, and a note that the 2026-11-08 "Dense mandala" candidate (60000 / 5 / 32) remains an open operator decision, not superseded by this card.
3. `docs/sweeps/abelian-sandpile-interestingness.md`: a dated "Promotion: Sandstorm" pointer section to deliverable 2.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`. No kernel, default, quality-profile or thumbnail change: `public/thumbnails/abelian-sandpile.png` is byte-for-byte unchanged and the kernel defaults (450000 / 4 / 32 / 120000) are unchanged.
- The three incumbent presets are unchanged. `git diff <base>..HEAD -- src/app/presets.ts` is a pure insertion of the new entry and its comment.
- Do not edit the frozen block in `src/app/sandpilePresets.contract.test.cjs`; `src/app/shippedPresets.contract.test.cjs` and `e2e/presets-150.contract.spec.ts` are frozen historical oracles, untouched.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base at `b318892d6`: 480 tests, 429 pass, 0 fail, 51 skipped. Skips are not passes.
2. Worker and verifier: after `npm run build:test`, `SANDPILE_PRESETS=1 node --test src/app/sandpilePresets.contract.test.cjs` passes all 4 tests with no skips. Planning base: 2 pass, 2 fail (three presets where four are expected; the note is missing), the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Verifier browser: with cleared storage open `#/abelian-sandpile`; the preset selector reads Kernel default and the four controls read the kernel defaults (450000 / 4 / 32 / 120000), the values the frozen oracle pins. Set Grid quality to ultra, choose "Sandstorm": the four controls read 15650000, 12, 1000 and 2000000. Run to 300 and then 600 iterations, retaining a screenshot at each; the 600 frame reads as the Visual goal target and the pile's radius is larger at 600 than at 300. Record the frames per second shown at both points; the note's figures must be within a factor of two of yours. A pile that has stopped growing is a FAIL.
5. Verifier scope: the diff touches only the three deliverable paths. Any other path, or a changed line in an incumbent preset, is a FAIL regardless of other evidence.
6. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL); the values are the operator's own, so the look is confirmation and a chance to rename.

## Contract test

- **Test file:** src/app/sandpilePresets.contract.test.cjs
- **Oracle command:** `npm run build:test && SANDPILE_PRESETS=1 node --test src/app/sandpilePresets.contract.test.cjs` (skips without the flag)
- **Assertions digest:** sha256:a11f70165f96691112d4d6bbad81a4facf7b72642ab0efbec019a188c5110ca8
- **Oracle proof:** On the unchanged base `b318892d6` on 2026-11-09: 2 pass (incumbents and kernel defaults unchanged, the four values sit inside the descriptor ranges, the thumbnail hash matches), 2 fail (`presetsFor("abelian-sandpile")` has 3 entries, 4 expected; `docs/sweeps/2026-11-10-sandpile-sandstorm.md` missing). Without the flag all 4 skip. No throwaway reference: the assertions are literal values.

## Out of scope

The "Dense mandala" candidate from the 2026-11-08 report (a separate operator decision), any change to the three incumbent presets or the kernel default, performance work on the sandpile kernel (the 13 fps is accepted by the operator for this preset), thumbnails, and the 146 sandpile evidence.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 45 minutes
- **Spend basis:** last 40 emergence-lab dispatches: worker median 3.20M, verifier median 1.75M cached-inclusive tokens. Plan below one median pair, about 3.5M, since the diff is literal. Preparation (orchestrator, 2026-11-09): reading the saved preset store and one scratch screenshot run, inside the interactive session.

## Dispatch envelope

Return the exact commands and exits, the measured frames per second at ultra and high, the screenshot paths, and the diff summary. State PASS, FAIL or partial honestly. Stop at wall-clock; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

The verifier needs a browser, headless Chromium included; Codex roles are sandboxed and this card declares Requires GUI. Start Vite from the run worktree on a free port (the shared 5173 may be in use by another checkout) and open the app there; no harness run is needed. Headless Chromium needs `--use-angle=metal --enable-gpu` for WebGL2 on this machine.

## Readiness review

Baselines ran on `b318892d6` on 2026-11-09: `npm run build:test` green, the frozen oracle 2 of 4 red for the stated reasons, 4 of 4 skipped without the flag; verify figures carried from the 2026-11-08 run on the same tree. The values were read from the operator's saved-preset store (`el:saved-presets:v1`, preset "Test1") and confirmed live at ultra by screenshot. No cross-family cold read before queueing. Serial dispatch: shares `src/app/presets.ts` with cards 158 and 160.

## Re-brief 1 (2026-11-10, attempt 2)

Attempt 1 is preserved at `7b7882064964098ffc4ae557c946519ab25ec774` on
`wip/159-sandpile-sandstorm-preset-attempt-1` (base `17d6fce57`), including the
four git-ignored screenshots. Its Sol verifier passed criteria 1, 2, 3 and 5 and
every part of criterion 4 except its first sentence: Sandstorm sets exactly
15650000 / 12 / 1000 / 2000000 at ultra, the pile grows from 300 to 600 with
terraces and rim motifs, and the displayed 12 and 13 fps agree with the note.
The failed sentence was a card error: it said a fresh load shows Classic
critical's values (100000 / 4 / 1 / 50000), but the page opens on Kernel
default (450000 / 4 / 32 / 120000) on the base commit too, which is exactly
what this card's frozen oracle pins as `DEFAULTS`. The sentence, the Objective
and the constraint now name the kernel defaults; what counts as success
(defaults untouched) is unchanged.

The deliverables stand; do not edit, re-measure or re-screenshot anything.

Attempt 2 instructions, replacing the Deliverables steps above:

1. Restore the three deliverables as a patch, so a newer `dev` cannot be
   reverted: `git diff 17d6fce57ddac76fe705a9f14cde55d37ccf6f12
   7b7882064964098ffc4ae557c946519ab25ec774 -- src/app/presets.ts
   docs/sweeps/abelian-sandpile-interestingness.md
   docs/sweeps/2026-11-10-sandpile-sandstorm.md | git apply`.
2. Restore the git-ignored screenshots without staging them: `git archive
   7b7882064964098ffc4ae557c946519ab25ec774
   e2e/artifacts/sandpile-sandstorm-2026-11-10 | tar -x`.
3. Show the restore is exact: for each of the three paths, `git show
   7b7882064964098ffc4ae557c946519ab25ec774:<path> | cmp - <path>` exits 0. If
   `src/app/presets.ts` differs only because `dev` moved outside the
   `abelian-sandpile` block, say so and show `git diff` is the same 11-line
   insertion.
4. Run criteria 1, 2, 3 and 5 and record each exit code. If any fails, stop and
   report partial with the output; do not edit any frozen file.

Verifier for attempt 2: run criteria 1, 2, 3 and 5 yourself, confirm step 3
yourself, and in a fresh headless browser with cleared storage open
`#/abelian-sandpile` and check the corrected first sentence of criterion 4
(Kernel default, 450000 / 4 / 32 / 120000), then choose Sandstorm and confirm
its four values. The rest of criterion 4 stands from attempt 1's verdict
(`state/uat/159-sandpile-sandstorm-preset/attempt-1/verifier.json`) only if the
three deliverables are identical to the preserved commit; otherwise run
criterion 4 in full. Criterion 6 is not applicable.

### Recovery log

| Attempt | Dispatched (base) | Seats | Outcome | Evidence | Diagnosis | Repair |
|---|---|---|---|---|---|---|
| 1 | 2026-11-10 22:31Z (`17d6fce57`) | Sonnet 5.5 medium / Sol high | worker pass, verifier FAIL on criterion 4 sentence 1 only; 2.3M tokens | `7b7882064` on `wip/159-...-attempt-1`; `state/uat/159-sandpile-sandstorm-preset/attempt-1/` | card: expected fresh-load values were Classic critical's, not the kernel defaults the app and oracle use | this re-brief |
| 2 | 2026-11-10 22:48Z (`e1a19a360`) | Sonnet 5.5 medium / Sol medium | worker pass, verifier PASS, 6 not applicable; landed `380121efd` 22:59Z | `state/verifiers/159-sandpile-sandstorm-preset.json` | restore identical to `7b7882064` | none needed |
