# Stage card 152-boids-clump-sweep: faster flocks in several clumps going different ways

## Metadata

- **Authored:** 2026-11-03
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** Claude Sonnet 5.5 <claude-sonnet-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/152-boids-clump-sweep
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** worker families alternate (card 151 has a Sol worker). The work is Playwright harness code plus a pure numeric module, which the Sonnet seat has delivered on cards 138, 140 and 142; the Sol verifier re-runs finalists in the same harness and judges frames across the family boundary. No frontier seat: the ranking rule is frozen, and the operator makes the aesthetic call on the imported shortlist.
- **Open decisions:** none
- **Readiness:** see Readiness review.

## Surfacing concern

The operator reviewed the three Boids trials from stage 144 on 2026-11-03 (`docs/UAT/uat-preset-review.md`) and rejected all three: "too slow to form a flock, too busy, may be better if they went faster in other directions", and the summary "maybe faster with multiple clumps going in different directions is the best effect". Stage 144 could not have found that regime: its grid pinned `maxSpeed` at 16 (the Balanced flock preset's value; the kernel default is 36) and every finalist had `cohesion` 0, so nothing could gather; its composite score rewards even coverage and penalises concentration, which is the opposite of clumping; and its 2500-boid, 200² evidence did not predict the app's look. The operator chose, on 2026-11-03, a new clump instrument, a 27-set grid over speed, cohesion and flock count, app-renderer evidence at the shipped population only, and delivery as an importable presets file.

## Objective

Search 27 parameter sets on the real renderer at the shipped 17777 boids, rank them by a frozen clump-regime rule (several distinct clumps, heading in different directions, moving fast, and still true at 1200 steps), and hand the operator a shortlist of three to nine candidates as an `emergence-presets` JSON file that loads through the Presets page's Import action. No production preset, default or kernel changes. Promotion, if any, is a later card after the operator's look.

## Visual goal

The operator's words: "faster with multiple clumps going in different directions". Judge frames in kind against:

- Shape reference: `docs/images/sweeps-2026-10-30/144-app-boids-144-current-balanced-flock-shipped-17777-t880-app.png`, the shipped Balanced flock at 880 steps: three or four dense, elongated, coherent bands with clear hulls. The target keeps that clumping but with the bands moving faster and in visibly different directions, not one shared heading.
- Failure reference: `docs/images/sweeps-2026-10-30/144-app-boids-144-boids-alignment0.25_cohesion0_initialFlocks12-shipped-17777-t880-app.png`, the rejected cohesion-zero trial at the shipped population: a near-uniform speckle with faint swells. Anything that reads like this fails the goal whatever it scores.

## Inputs (read these in your own context)

- `docs/UAT/uat-preset-review.md` — the operator verdicts (items 8 to 10 and the Boids summary)
- `docs/sweeps/boids-interestingness.md` — the stage-144 section and its app-renderer supplement; the 2026-11-03 section is appended after them
- `docs/sweeps/data/2026-10-30/144/boids.app-evidence.json` — the retained row and sample shape to mirror
- `e2e/harness/sims.ts` — `SimSweepConfig`, `expandSweep`, `BOIDS`, `SWEEP_144_BOIDS`, the `SWEEP_CONFIGS` map
- `e2e/sweep.spec.ts` — the `S144_*` constants, `s144Snapshot`, `s144MeasuredStateSha` and the `sweep 144 app evidence` describe block: the fixed-step, renderer-paused capture method to reuse
- `e2e/harness/metrics.ts` — `Field`, `gaussianBlur`, `velocityCoherence` (the existing velocity reading, kept as a column)
- `e2e/harness/report.ts` — `encodeGrayscalePng` and the report helpers
- `src/sims/boids/kernel.ts` — `readState` layout (channels Density, Speed, Velocity X, Velocity Y), `wrap` (torus), the parameter ranges; there is no seed input
- `src/app/trialPresets.ts` — how a complete `PresetSnapshot` is built from the registry, quality profile, speed profile and colour and display defaults
- `src/app/savedPresets.ts` — `PresetValidator` and the `emergence-presets` envelope the file must satisfy
- `e2e/sweep-152.contract.spec.ts` — the frozen oracle (read, never edit): config shape, metric fixtures, evidence seam, presets file
- `docs/stages/144-particle-trail-missed-regimes.md` — "Family-specific notes" (port 5173 ownership) and its re-briefs (viewport provenance, fixed-step clock, population assertions)

## Deliverables

1. `e2e/harness/clumps.ts` — a pure module with two exports. `clumpRegime(field, options)` takes `{ width, height, density, speed, vx, vy }` (the four Boids channels as `ArrayLike<number>` of `width*height`) and `{ blurRadius: 6, threshold: 0.25, minMassFraction: 0.03 }`, and returns `{ clumps, headingSpread, meanSpeed, masses, headings }`: blur the density with a Gaussian of the given radius that wraps on the torus (reuse `gaussianBlur` only if it wraps; otherwise write a wrapping blur); threshold at `threshold` times the blurred maximum; label 4-connected components with wrap on both axes; keep components whose raw-density mass is at least `minMassFraction` of the total raw mass; each kept component's heading is `atan2` of its density-weighted velocity sum; `headingSpread` is 1 minus the length of the mass-weighted resultant of the kept components' unit heading vectors divided by their total mass (0 for zero or one clump, 1 for balanced opposition); `meanSpeed` is the density-weighted mean of the Speed channel over occupied cells, in that channel's own units: the kernel writes speed as a fraction of the row's `maxSpeed` (`clamp(speed / maxSpeed, 0, 1)` in `rasterise`), so the module returns a fraction in [0, 1] and the harness multiplies it by the row's `maxSpeed` before scoring. The Density channel counts boids per cell, so mass is boid count, which is intended. A component whose velocity sum is zero gets heading 0, contributes nothing to the resultant and its full mass to the denominator. An empty field returns zeros, never NaN. `clumpScore(samples)` is the ranking rule: for each sample `clumpTerm = clamp((clumps − 1) / 4, 0, 1)`, `speedTerm = clamp(meanSpeed / 40, 0, 1)` where `meanSpeed` is absolute (fraction × `maxSpeed`; 40 is the slider's ceiling), sample score `clumpTerm × headingSpread × speedTerm`; the row score is the minimum over its samples, so a regime that decays by 1200 steps scores by its worst moment. The frozen fixtures pin these numbers; in the retained JSON every sample carries both `speedFraction` (the module's reading) and `meanSpeed` (scaled), and the frozen test checks the product.
2. `e2e/harness/clumps.test.cjs` — unit tests discovered by `scripts/run-kernel-tests.cjs` (it requires `.ts` directly under type stripping, as `metrics.test.cjs` does): at least the frozen fixtures' cases plus a mass-fraction cut and a heading-spread case at 90 degrees.
3. `e2e/harness/sims.ts` — additive `SWEEP_152_BOIDS`, registered as `"sweep-152-boids"`, spread from `BOIDS` so the point-cloud opt-in carries over: `baseParams { boidCount: 17777, visualRadius: 36, separationRadius: 6, separation: 0.2, alignment: 0.15, obstacleLayout: "none" }`, axes `maxSpeed [24, 32, 40]`, `cohesion [0.01, 0.02, 0.035]`, `initialFlocks [3, 6, 12]` (27 sets; no `pointSize`, no `seed`), references `152-current-balanced-flock`, `152-current-tight-flock`, `152-current-scatter` with the shipped preset values plus `initialFlocks: 6` and `obstacleLayout: "none"` exactly as the frozen test lists them. `boids` and `sweep-144-boids` stay byte-identical (their hashes are frozen).
4. `e2e/sweep.spec.ts` — an additive `sweep 152 boids clump regimes` test, `SWEEP=1` gated, selectable with `-g "sweep 152 boids"`. For each of the 27 sets and the 3 references: capture at 300, 600 and 1200 steps using the stage-144 method (fresh kernel per capture, exactly `steps` calls of `step(1)` inside `init`, real WebGL2 `Renderer` paused at `stepsPerFrame` 0 on a 960×600 CSS canvas, effective population asserted equal to 17777, actual `page.viewportSize()` recorded per sample, `stateSha256` of the state drawn). The Boids kernel reads an optional integer `seed` (0 when absent, which makes init a pure function of grid and count, as stage 144's equal-hash repeats showed). Main captures pass `seed: 0` exactly as `s144Snapshot` does and record `seed` on every sample; the config's sets carry no seed key. Compute the clump metrics in the page from that same `readState` by importing `e2e/harness/clumps.ts` through the Vite origin, so no second kernel is needed; keep `velocityCoherence` as an extra column (the stage-144 composite is not recomputed). Reference frames at all three steps go to `docs/images/sweeps-2026-11-03/` under `image`; candidate frames go to `e2e/artifacts/152-boids-clump-sweep/` (git-ignored) recorded under `artifact`, with `image` null; after ranking, the top three ranked candidates are the finalists: copy their three frames into `docs/images/sweeps-2026-11-03/` (set `image`) and run three further captures each at 600 steps with seeds 1, 2 and 3 (distinct from each other and from 0, so the runs are independent and their `stateSha256` values differ) with retained frames. Write `docs/sweeps/data/2026-11-03/152/boids.json` with `manifest` (slug, `methodVersion` `boids-clump-regime-v1`, `command`, `canvasCss`, `steps`, `metricOptions`, `candidates` in expanded-config order, `priorCoverage` naming `e2e/harness/sims.ts`, the 144 report and its data file), `ranked` (descending `metrics.score`, each row with `effectivePopulation`, three `samples` carrying `steps`, `seed`, `kernelCalls`, `viewport`, `clumps`, `headingSpread`, `speedFraction`, `meanSpeed`, `stateSha256`, `image` or `artifact`), `references` (same shape, images required) and `finalists` (exactly the top three ranked ids, each with `repeats` at 600 steps carrying the same sample fields plus their distinct seeds). Write the manifest before measuring. Up to four pages may run rows concurrently, as stage 144 did.
5. `docs/sweeps/data/2026-11-03/152/boids.presets.json` — an `emergence-presets` version 1 envelope with three to nine entries: all three finalists (the frozen test checks they are present), plus any other ranked candidate the worker's own viewing of the frames judges worth the operator's eye (say which and why in the report). Each entry: `id` `boids-152-<candidate id>`, a human-readable `name` of at most 64 characters (for example `Boids 152 · speed 32, cohesion 0.02, 6 flocks`), and a complete snapshot built in the page the way `src/app/trialPresets.ts` builds one: schema defaults merged with the candidate's params (`obstacleLayout` `none`, no custom field), default colour options, default display options, the quality profile's default resolution, the speed profile's initial step rate, `autoCycle` false. The file must pass the real `PresetValidator`; the frozen test runs it.
6. `docs/sweeps/boids-interestingness.md` — a `## 2026-11-03 — clump sweep (stage 152)` section after the stage-144 supplement: method and instrument, searched and not-searched axes, the ranking table (top 10 with clumps, heading spread, mean speed at each step), the three references, finalists with their repeats, an interpretation that says what the instrument can and cannot see, the reproduction command, links to `152/boids.json`, `152/boids.presets.json` and the images, and a closing line that no promotion is proposed and the shortlist awaits the operator's import and look.

## Constraints

- Work from current `dev`. No change under `src/`: the frozen test requires the `src` tree at `HEAD` to equal the branch point on `dev`. The kernel's existing `seed` parameter is used only at capture time (0 for main captures, 1 to 3 for repeats); it is never added to the config's sets or to the presets file, whose validator rejects a seed on Boids.
- Historical sweep configs and data stay untouched; new config and artifact IDs are unique. `docs/sweeps/data/2026-10-30/**` is read-only.
- Fixed-step clock only. The interactive iteration counter and wall-clock `dt` are not evidence.
- Port 5173 is the sweep's own, per card 144's Family-specific notes: check no listener exists before starting, start Vite from the run worktree, stop only that process. `CI=1` makes Playwright start its own server and refuse a reused one.
- Run the sweep with `--global-timeout=14400000` and keep the test's own timeout above the expected 2 to 3 hours; record wall-clock per row. If the worker allowance runs out, finish the rows in flight, write the partial JSON honestly (manifest intact, `ranked` shorter than `candidates`) and report partial; do not narrow the grid.
- Scores shortlist; the operator's eye decides. No candidate is promoted, no default moves, no preset file is added to the app.
- Keep "session limit", "usage limit", "rate limit" and "429" out of any envelope prose.

## Acceptance criteria

1. Worker and verifier: `npm run verify` exits 0, now including `e2e/harness/clumps.test.cjs`.
2. Worker and verifier: after `npm run build:test`, `SWEEP_CONTRACT=152 npx playwright test e2e/sweep-152.contract.spec.ts` passes all five tests with no skips (baseline on `c61a9ea0c`: four fail at the missing config, module, results and presets file; the fifth, the validator's own controls, passes), and `scripts/check-contract-test-gate.sh --worktree` exits 0.
3. Worker: `CI=1 SWEEP=1 npx playwright test e2e/sweep.spec.ts -g "sweep 152 boids" --global-timeout=14400000` exits 0 with every one of the 27 sets and 3 references measured at all three steps, no skips, population asserted, and the runtime recorded in the report. (Baseline: `npx playwright test e2e/sweep.spec.ts -g "sweep 152 " --list` finds zero tests on `c61a9ea0c`; zero matches is not a pass.)
4. Verifier: re-run the three finalists and the three references independently in the same harness (the worker provides an opt-in replay selector, for example `SWEEP_152_REPLAY=1`, documented in the report) and compare clump readings to the retained rows. Boids has no seed, so identical numbers are not expected: report every reading, and treat a finalist as confirmed when its clump count is within 2 and its heading spread within 0.25 of the retained 600-step median across the retained repeats; report anything wider as not confirmed rather than widening the band. View the retained finalist and reference frames and judge each finalist against the Visual goal in kind from the stills (several distinct clumps, different headings); judge "faster" from the retained `meanSpeed` readings against `152-current-balanced-flock`'s, since stills cannot show motion. Say which finalists meet it. A finalist that is not confirmed or does not meet the goal is a reported finding, not a card failure: the card passes on complete, honest evidence, and the operator decides what to import.
5. Verifier: on your own Vite at an isolated port with cleared storage, open `#/presets`, use `Import presets` with `docs/sweeps/data/2026-11-03/152/boids.presets.json`; every entry appears as a personal preset; open at least two, read the Boids controls from the DOM and confirm they equal the ranked candidate's params; no console errors. Retain a screenshot of the library after import.
6. Verifier scope: `git diff --name-only <base>..HEAD` lists only the paths in Path claims; `src` unchanged; `docs/sweeps/data/2026-10-30/**` unchanged; the two frozen Boids config hashes still match (the frozen test checks them).
7. Operator: import the shortlist and look. Promotion is a separate card; a PASS here accepts research evidence on `dev` only.

## Contract test

- **Test file:** e2e/sweep-152.contract.spec.ts
- **Assertions digest:** `sha256:83d8fdc8beb62514cabde5009cc642038ec66ae8517123c3d23a3376000df691`
- **Oracle proof:** On base `c61a9ea0c`, `SWEEP_CONTRACT=152 CI=1 npx playwright test e2e/sweep-152.contract.spec.ts` ran 5 tests: 4 failed, 1 passed. Test 1 at `missing sweep-152-boids config`, test 2 at `Cannot find module e2e/harness/clumps.ts`, test 3 at `missing retained results`, test 4 at `missing presets file`; test 5, the validator's positive fixture and its twenty-one negative mutations plus an invalid PNG, passes on the base as the control it is meant to be. Before the cold read, with a throwaway `e2e/harness/clumps.ts` written to the specification (wrapping blur, torus flood fill, mass-weighted headings, the scoring rule) placed in the tree for one run, test 2 passed as well, so the metric fixtures are satisfiable by an implementation of the stated rule; the fixture values did not change in the later amendment (seeds, speed scaling, artifact paths and top-three finalists are evidence-seam checks). Two fixture defects of my own were found and fixed along the way (non-hex state hashes; speeds exceeding `maxSpeed`). The scratch module was deleted and is not on `dev`; the worker writes its own. No sweep was run during preparation.

The frozen block covers the config grid and references, the metric's behaviour on synthetic fields and the scoring rule's literals, the retained evidence shape (fixed-step samples, population, descending scores that follow the rule, finalist repeats with distinct states and retained images, report links), the presets file (shape, ids, names, params traceable to ranked rows, acceptance by the real validator), and the untouched `src` tree and historical Boids configs. It does not run the sweep, judge any frame, or import the file in a browser: criteria 3 to 5 and 7 are the seats' own work.

## Path claims

Implementation claims: new `e2e/harness/clumps.ts` and `e2e/harness/clumps.test.cjs`; additive edits to `e2e/harness/sims.ts` and `e2e/sweep.spec.ts`; `docs/sweeps/boids-interestingness.md`; new `docs/sweeps/data/2026-11-03/152/boids.json`, `docs/sweeps/data/2026-11-03/152/boids.presets.json` and `docs/images/sweeps-2026-11-03/*.png`. Evidence, untracked: `e2e/artifacts/152-boids-clump-sweep/`. Orchestrator-owned and already on the base: `e2e/sweep-152.contract.spec.ts` (frozen). Read-only: `src/**`, `e2e/harness/metrics.ts`, `e2e/harness/report.ts`, `e2e/harness/driver.ts`, `docs/sweeps/data/2026-10-30/**`, every other `e2e/sweep-*.contract.spec.ts`, `playwright.config.ts`, `package.json`.

## Operator decisions (2026-11-03, orchestration chat)

Put as numbered questions with a recommended answer and accepted:

1. Instrument: rank by a measured clump count and heading spread with persistence to 1200 steps; the stage-144 composite is not recomputed (its flux term needs frame pairs), and the existing `velocityCoherence` reading is kept as a column. Accepted.
2. Axes: `maxSpeed` {24, 32, 40} × `cohesion` {0.01, 0.02, 0.035} × `initialFlocks` {3, 6, 12}, alignment pinned 0.15, visual radius 36, separation 0.2, 17777 boids. Accepted (27 sets).
3. Scale: app renderer at the shipped population only, 960×600, three time samples; no small-grid stage. Accepted.
4. Delivery: an importable `emergence-presets` file rather than a second trial group in the library, which would have needed an amendment to stage 150's frozen oracle. Accepted.

## Out of scope

Promotion of any candidate; changes to shipped Boids presets, the kernel default or the kernel; a seed input for Boids; obstacles (`obstacleLayout` is pinned to `none`); the trial catalogue and library UI; re-scoring stage 144; `main`, labs and the public mirror; stage 145.

## Budget

- **Worker wall-clock:** 300 minutes
- **Verifier wall-clock:** 150 minutes
- **Spend basis:** the 137 to 147 sweep cards ran 0.8M to 8M worker tokens (card 143's 86M was a three-kernel reaction-diffusion run and is not comparable) and 0.8M to 2.8M verifier tokens; plan 10M cached-inclusive tokens for the pair, no automatic retry. Runtime estimate from card 144's Boids supplement (nine rows in one hour at two populations with replay and repeat captures): about 4 minutes per row here without the replay, 30 rows plus 9 repeat captures, two to three hours with four pages. Preparation: about 45 minutes of orchestrator time, recorded in Readiness review.

## Escalation

If the WebGL2 renderer cannot be created, the port is occupied, or the harness import of `clumps.ts` through Vite fails, record the error and stop. If fewer than three candidates reach a score above 0 at 1200 steps, that is a finding, not a failure: rank what exists, make the best three the finalists, and say plainly that the grid did not reach the regime; do not add sets. If the worker allowance ends mid-sweep, write the partial JSON and stop.

## Dispatch envelope

Report every command and exit, rows completed of 30, per-row wall-clock, the finalist ids with their three-step readings and repeat readings, the presets file entry count, image counts, the `git diff --name-only` against the base, and anything not done. Partial is partial, never PASS. Never edit the frozen block.

## Family-specific notes

Both roles need headless Chromium with `--use-angle=metal --enable-gpu` (already in `playwright.config.ts`). The sweep uses port 5173 and must own it; the verifier's import check (criterion 5) uses a separate isolated port and its own Vite started from the run worktree. Do not reuse or stop any other preview.

## Verifier handoff

Re-run criteria 1 and 2, replay the six rows for criterion 4, read the frames yourself against the Visual goal, do the import journey for criterion 5 from the DOM, and run the scope checks. Report every reading; the band in criterion 4 is a reporting threshold, not something to widen. The operator's look follows your verdict.

## Readiness review

Baseline at `c61a9ea0c` (clean `dev`; card 151 queued separately and serial): `npm run verify` evidence reused from the stage-150 verifier at `35a730ba3` plus today's 28-test kernel re-run; `src` and `e2e/harness` unchanged since. `npx playwright test e2e/sweep.spec.ts -g "sweep 152 " --list` finds zero tests. The two Boids config hashes in the frozen test were computed from `e2e/harness/sims.ts` at this head. Facts checked: the Boids `readState` exposes density, speed and both velocity components, so the clump metric needs no kernel change; positions wrap on a torus, so the metric wraps too; the kernel reads an optional `seed` (0 when absent, deterministic), hence repeats use explicit distinct seeds and the frozen test requires distinct seeds and hashes; the speed channel is a fraction of `maxSpeed`, hence the `speedFraction` field and the scaled `meanSpeed`; `PresetValidator` requires every schema key present and in range, `obstacleLayout` from its option list, and rejects a custom field without its layout string, all satisfied by building snapshots the way `trialPresets.ts` does; the stage-150 frozen suite pins nine trials, which is why delivery is a file and not a library entry; `playwright.config.ts` reuses an existing 5173 server unless `CI` is set, hence the port rule.

Cold read: GPT-6.1 Sol via `codex exec --sandbox read-only` on 2026-11-03 (about 78k tokens). Material findings and how they were folded in: the kernel does take a seed, so "fresh runs differ" was false (repeats now use seeds 1 to 3, main captures seed 0, both frozen); the Speed channel is already normalised by `maxSpeed`, so dividing it by 40 again would have crushed the speed term (now `speedFraction` × row `maxSpeed`, frozen as a product check); candidate artifact paths would have failed the image check (now an `artifact` field, `image` null); the card said top three finalists while the oracle allowed one to three (now exactly the top three, and all three must be in the presets file); the AC2 baseline count described the scratch-module run (corrected); "visibly faster" from stills (now judged from the speed readings); zero-resultant heading, occupied-cell mass and the composite column are now stated. No material finding remains unassigned.

Preparation spend: about 45 minutes of orchestrator time including the four-question interview, the oracle with its scratch metric reference, and the cold read; over the 15-minute checkpoint, justified by the metric fixtures being the one part of this card a worker could not safely guess.
