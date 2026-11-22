# Stage card 95-app-test-build-convention: decide how a pure module under src/app becomes testable

## Metadata

- **Authored:** 2026-09-13
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Claude Opus 5 <claude-opus-5@local>
- **Verifier:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Base branch:** dev
- **Run branch:** autometta/95-app-test-build-convention
- **Worker effort:** medium
- **Verifier effort:** medium
- **Verifier panel:** false
- **Gate:** stage-completed: 94-cpu-fallback-refinement-default
- **Path claims:** tsconfig.test.json, docs/audits/2026-09-13-app-test-build-convention.md, docs/INTERFACE.md, src/app/qualityProfiles.test.cjs, src/app/paramGroups.test.cjs, scripts/run-kernel-tests.cjs
- **Dispatch:** serial
- **Pairing rationale:** a convention decision with a small mechanical tail,
  and the evidence is three cards' worth of repo history rather than a
  visual or a measurement. Opus works it because the judgement is the
  deliverable and the wrong call taxes every future card. Fable 5.1
  verifies: the gate is "does the stated rule match what the config and the
  two existing tests actually do", which is a reading task, and Fable has
  not touched any of these files. Cross-model; no GUI, no network.
- **Type:** Convention decision with a config change and a documented rule.
- **Serialises with:** card 94 by gate. 94 adds the third entry to the
  include list and must land first, or this card is deciding against a
  moving target.

## Objective

Decide, once, how a pure module under `src/app` becomes testable, and write
the decision down where the next card will find it. Today the answer is
discovered by a worker getting blocked, which has now happened twice.

## Surfacing concern

`tsconfig.test.json` names its inputs individually:

```json
"include": ["src/sims/**/kernel.ts", "src/app/qualityProfiles.ts"]
```

`npm run build:test` compiles exactly that set into `.test-build/`, and
`scripts/run-kernel-tests.cjs` then auto-discovers every `*.test.cjs` under
`src/sims` and `src/app`. So **discovery is already automatic and
compilation is not.** A new `src/app` module with a test beside it is
discovered, runs, and fails on a missing require — which is a confusing
failure, because the test file is plainly present and plainly being picked
up.

Two cards have now hit this, and they solved it two different ways:

- **Stage 93** wrote `src/app/paramGroups.test.cjs`, which requires
  `scripts/param-groups-snapshot.cjs` — a plain CommonJS script, never
  compiled. No include entry needed. It passes.
- **Stage 94** wrote `src/app/orbitRefinement.test.cjs`, which requires
  `.test-build/app/orbitRefinement.js`, following `qualityProfiles.test.cjs`.
  It failed the stage: the worker correctly refused to edit an unclaimed
  build config, the verifier correctly failed it, and the card needed a
  third attempt for a one-line change.

Neither worker did anything wrong. There is no rule, so each card invents
one, and the cost lands on whichever worker guesses the compiled route.
`src/app` holds 37 modules and 2 tests; the ratio is going the wrong way.

## Inputs (read these in your own context)

- `tsconfig.test.json` in full — it is nine lines
- `package.json` scripts: `build:test`, `test`, `typecheck`, `verify:kernels`,
  `verify`. Note that `typecheck` runs `tsc -p tsconfig.test.json --noEmit`
  over the *same* include list, so the list governs typechecking as well as
  emission
- `scripts/run-kernel-tests.cjs` lines 1-50: the discovery walk over
  `SIMS_DIR`, `APP_DIR` and `HARNESS_DIR`
- `src/app/qualityProfiles.test.cjs` and `src/app/paramGroups.test.cjs`
  lines 1-10 — the two require styles, side by side
- `docs/stages/94-cpu-fallback-refinement-default.md`, the attempt-2 history
  section, for what the failure actually cost
- `src/app/orbitRefinement.ts` as the worked example of the module shape
  under discussion: no DOM, no WebGL, no imports from the renderer

Do not read the renderer. This card is about the build config, not the code
it compiles.

## Deliverables

1. **A decision, stated in one paragraph in the audit**, choosing between at
   least these three and saying why the others lose:
   - **(a) Scoped glob.** Replace the individual `src/app` entry with a
     narrow pattern. The obvious candidate is a naming convention the glob
     can key on. Cheapest for future cards; the risk is what it drags into
     the test build, which you must measure, not assume.
   - **(b) Explicit list, documented.** Keep naming files one by one, but
     write the rule down so a card author knows to claim
     `tsconfig.test.json` in advance. Zero build risk; the tax stays but
     stops being a surprise.
   - **(c) Plain-CJS convention.** Standardise on stage 93's route: a pure
     module that needs testing gets a `.cjs` sibling, and the test requires
     that. No compilation, no include list, but it forfeits TypeScript on
     the tested unit, which is a real loss for something like
     `orbitRefinement.ts`.

   You may propose a fourth. Recommend one and implement it.

2. **The implementation of whichever you chose.** For (a) that is the
   `tsconfig.test.json` edit plus any test-file renames the convention
   implies. For (b) it is documentation only. For (c) it is the migration
   of `qualityProfiles.ts` and `orbitRefinement.ts`, which is the largest
   of the three and should weigh in the decision.

3. **Evidence that the test build did not silently grow.** Record, before
   and after, the file list emitted under `.test-build/` and the wall-clock
   of `npm run build:test`. If option (a) pulls in a module that drags the
   renderer, the numbers say so and the decision changes. State the numbers
   in the audit even if nothing moved.

4. **`docs/INTERFACE.md`**: a short subsection saying how a pure `src/app`
   module becomes testable under the chosen rule, and that a card adding one
   must claim `tsconfig.test.json` if the rule requires an edit. This is the
   file a card author already reads; the rule has to live where it will be
   found, not only in an audit.

5. **A short audit, `docs/audits/2026-09-13-app-test-build-convention.md`**,
   carrying the decision paragraph, the three options with the reason each
   lost, the before/after build evidence from deliverable 3, and a line
   naming stages 93 and 94 as the two cards that paid for the absence of a
   rule.

## Constraints

- **Kernel tests are frozen.** `src/sims/**/kernel.ts` stays in the include
  list exactly as written. Whatever you change is on the `src/app` side.
- The number of tests `npm test` reports must not fall. Record the count
  before and after; it may rise, it may not drop.
- Do not touch `tsconfig.json` (the app build), `vite.lib.config.ts`, or
  `playwright.config.ts`. This card owns the test build only.
- Do not add a test runner, a test framework, or a new dependency. The repo
  uses `node:test` and will continue to.
- Do not rewrite either existing test's assertions. A rename or a changed
  `require` path is in scope under option (a) or (c); changing what is
  asserted is not.
- No new `src/app` module. This card decides how they are tested, it does
  not add one.

## Acceptance criteria

1. `npm run verify` green in the run worktree (after `npm ci`), with a test
   count at or above the pre-change count. Report both numbers verbatim.
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim, with one sentence on which outcome it was and
   why that is correct here.
3. The audit exists at the named path, names a single chosen option, and
   gives a reason each rejected option lost. A summary that lists options
   without choosing fails this criterion.
4. Deliverable 3's before/after evidence is in the audit as actual figures —
   emitted file list and build wall-clock — not as a claim that nothing
   changed.
5. `docs/INTERFACE.md` carries the rule, and a card author reading only that
   file would know whether to claim `tsconfig.test.json`.
6. `src/sims/**/kernel.ts` is still the first include entry and is unchanged.
7. The verifier re-derives the decision: it reads the two existing test
   files and the config, and says whether the audit's description of current
   behaviour is accurate. An audit that misdescribes what the repo does today
   fails the stage even if the chosen option is reasonable.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- Anything about `e2e/` and Playwright. That is a separate build path with
  separate problems.
- The `HARNESS_DIR` branch of the discovery walk.
- Adding tests for currently untested `src/app` modules. The convention is
  the deliverable; using it is the next card's job.
- Revisiting stage 93's snapshot approach on its merits. It is evidence here,
  not a target.

## Budget

- **Worker wall-clock:** 45 minutes
- **Verifier wall-clock:** 30 minutes
- **Token baseline:** worker 2.5M, verifier 1.0M. Above 4.0M on the worker,
  stop and report what is landed.

## Escalation

If the measurement in deliverable 3 shows the scoped glob pulling in DOM or
WebGL modules such that `tsc -p tsconfig.test.json` fails or the build time
materially rises, do not fight it with `exclude` patterns and do not add
`skipLibCheck` escapes beyond what is already there. Record the numbers,
choose another option, and say in the audit that (a) was measured and
rejected. That is a successful outcome for this card, not a failure.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it
passed and the evidence: the command run and its verbatim exit code and
output, or the committed path. State the chosen option by letter in the
first line.

## Verifier handoff

Read `tsconfig.test.json` and both `src/app/*.test.cjs` files before you read
the audit, and form your own account of how the test build works today.
Then check the audit against it. The failure mode to catch is an audit that
is internally coherent but describes a repo that does not exist — for
instance one claiming the test runner needs an include entry for discovery,
when discovery is a filesystem walk and only compilation needs one.

Then check deliverable 3's figures are real by re-running
`npm run build:test` and listing `.test-build/` yourself.

## Family-specific notes

The run worktree has no `node_modules`; run `npm ci` first or `npm run
verify` exits 127. If the worktree's `node_modules` is a symlink into the
main checkout, `npm ci` exits 255 on `EPERM` unlinking
`.package-lock.json` — replace only the worktree-local symlink with a real
directory and re-run `npm ci --offline`. Do not delete the main checkout's
`node_modules`. No GUI and no network are needed.
