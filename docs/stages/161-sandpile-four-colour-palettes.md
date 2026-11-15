# Stage card 161-sandpile-four-colour-palettes: four-colour sandpile palettes, a glow switch and a Mandala preset

## Metadata

- **Authored:** 2026-11-11
- **Orchestrator:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Worker:** Claude Opus 5.5 <claude-opus-5-5@local>
- **Verifier:** GPT-6.1 Sol <gpt-6-1-sol@local>
- **Base branch:** dev
- **Run branch:** autometta/161-sandpile-four-colour-palettes
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Recovery attempts:** 3
- **Recovery attempt:** 1
- **Dispatch:** serial
- **Pairing rationale:** the change spans the colour model, the WebGL2 shader, the canvas renderer, the View controls and the saved-preset schema, so the worker is the Claude frontier coding seat at high effort. The cross-family verifier is the Codex coding tier at high effort driving headless Chromium: the acceptance is exact pixel colours, a settle time and a mirror-symmetry measure, all of which it can compute, while the aesthetic judgement is the operator's look after landing. Sol verified the 157 and 159 visual cards on 2026-11-10 without trouble; Astra is not needed for a card with no camera or interaction feel.
- **Open decisions:** none
- **Decided:** by the operator on 2026-11-11 in the orchestration chat, after the research summary: "yes card A and B", then four answers: Classic becomes the sandpile default for every sandpile preset and the gallery thumbnail is regenerated; the avalanche glow becomes a separate View switch that works on any palette (accepting the saved-preset field it needs); the Mandala preset is 2^18 grains (about 45 s to settle on this Mac); and the other palettes (Viridis, Magma and so on) are fixed on the sandpile in this card, not left out. Labels, the exact colours and the Mandala's topple budget were set by the orchestrator; the operator may rename or retune at the look.

## Surfacing concern

The operator, 2026-11-11: "on the albanian sandpile its fine but other modekls are much better ... maybe do some research to see if we can make it morre asthetically pleasing", with two reference images and the Nautilus article "The Amazing, Autotuning Sandpile" (images by Wes Pegden). The orchestrator's reading of the code found the model sound and the presentation at fault: the `sand` palette ("Avalanche glow", `src/app/colormap.ts`) draws grain counts 0 to 3 as four shades of one amber ramp on black, with 0 and 1 both near-black; the activity channel washes an orange-cream heat over everything toppling at up to 55%, so a fed pile's centre, where the finest lattice-work is, is always covered; and choosing any other palette in View is no rescue, because a two-channel sim goes through the generic composite `c1 * 0.72 + (1 - c0) * 0.28`, which shows a settled pile using only the bottom 28% of the ramp. The renderers do not know which sim they draw, so the sandpile cannot simply be special-cased by slug.

Measured on this Mac (node, the compiled kernel, an 1100 by 800 grid, no feeding): a single drop settles in about 12 s at 2^17 grains (267 cells across), 47 s at 2^18 with 500 000 topples per step (375 cells, 1562 steps at about 30 ms each), and 166 s at 2^19. Raising the topple budget barely changes the wall time because toppling is CPU-bound; it only lowers the frame rate. Until it settles the picture is speckle.

## Objective

Ship two four-colour sandpile palettes, "Classic sandpile" (the default) and "Sunflower sandpile"; colour the sandpile by grain count across the full ramp of every palette; make the avalanche glow a View switch, off by default, that overlays any palette; rename the amber palette "Amber sand" (with the glow on and today's gamma 0.9 / contrast 1.1 it reproduces today's colours, as `colormap.ts` computes them); add a "Mandala" preset that settles into the classic single-drop picture; and regenerate the sandpile's gallery thumbnail. Every other sim's colours, defaults and thumbnails stay byte-for-byte as they are, and the sandpile kernel is untouched.

## Visual goal

Operator's words: "other models are much better ... see if we can make it more aesthetically pleasing."

Open the two reference images before you start and again before you finish. They are not in git (third-party images); from the run worktree's root they are at `../emergence-lab/docs/UAT/references/2026-11-11-sandpile-classic.png` (Pegden's 2^20-grain pile: blue, light blue, yellow, maroon) and `../emergence-lab/docs/UAT/references/2026-11-11-sandpile-sunflower.png` (the operator's second image: white, olive, purple, gold).

- Target, Mandala with Classic sandpile at ultra after it settles: a flat blue field with a centred, four-fold-symmetric disc about half the canvas height, made of crisp single-cell colours: large maroon triangles at the rim, yellow and light-blue lattice-work towards the centre, no blur, no glow, no amber.
- Target, Classic critical (threshold 4) with the glow off: the growing pile in the same four colours, the centre's lattice visible while it churns; with the glow on, toppling regions carry today's orange-cream heat over the four colours.
- High threshold (threshold 8) and Sandstorm (threshold 12) have more grain levels than a four-stop palette has colours, so each level takes its own colour interpolated along the ramp: still one flat colour per cell, never a blend between cells. That is the intended behaviour, not a defect.
- Failure: a gradient or blend between neighbouring cells, amber or heat on a settled pile with the glow off, a palette that uses only part of its ramp on the sandpile, any other sim whose colours changed, or a Mandala still speckled after 90 s.

## Inputs (read these in your own context)

- `src/app/colormap.ts`
- `src/app/webglRenderer.ts` (the `colourFromRaw` shader function, the `u_preset == 13` sand branch, the preset index switch near the end, `buildMapper` use, and the kernel identity helpers such as `isGrayScottState`)
- `src/app/canvasRenderer.ts`
- `src/app/controls.ts` (the colour dashboard: `buildColourDashboard`, `buildColourBooleanControl`)
- `src/app/simView.ts` (factory colour options, `restoreRenderOptions`, `renderLegend`, how a saved preset's colour options are applied)
- `src/app/savedPresets.ts` and `src/app/savedPresets.test.cjs`
- `src/app/presets.ts`
- `src/app/thumbnail.ts` and `scripts/generate-thumbnails.mjs`
- `src/sims/abelian-sandpile/kernel.ts` (read only: `writeState` puts `grains % threshold / (threshold - 1)` in channel 0 and the decaying activity in channel 1)
- `src/app/sandpilePalettes.contract.test.cjs` and `src/app/sandpilePalettes.base-colours.json` (frozen)
- `e2e/smoke.spec.ts` (the "cyclic Magma joins seamlessly and agrees across CPU and GPU mappings" test is the pattern for deliverable 9)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. `src/app/colormap.ts`:
   - `ColourPreset` gains `"sandpile-classic"` and `"sandpile-sunflower"`, both four-stop ramps with stops at 0, 1/3, 2/3 and 1: Classic `[6, 64, 251]`, `[90, 180, 255]`, `[252, 195, 1]`, `[124, 0, 0]`; Sunflower `[255, 255, 255]`, `[140, 138, 46]`, `[142, 79, 160]`, `[254, 213, 1]`. `COLOUR_PRESETS` lists them as "Classic sandpile" and "Sunflower sandpile"; `"sand"`'s label becomes "Amber sand"; every other entry is unchanged.
   - `ColourMapOptions` gains a boolean `avalancheGlow`; `DEFAULT_COLOUR_OPTIONS.avalancheGlow` is `false`.
   - `defaultColourOptionsFor("abelian-sandpile", …)` returns `{ preset: "sandpile-classic", invert: false, gamma: 1, contrast: 1, paletteCycleReverse: false, steps: 0, avalancheGlow: false }`; every other slug returns exactly what it returned before plus `avalancheGlow: false`.
   - Export `type ChannelMapping = "composite" | "height"` and `channelMappingFor(kernel)`, which returns `"height"` for the Abelian sandpile kernel (name "Abelian Sandpile", two channels) and `"composite"` for everything else.
   - `buildMapper(channelCount, channelRanges, options, mapping = "composite")` and `sampleColour(channelIndex, channelCount, options, mapping = "composite")`. The composite mapping is today's behaviour, unchanged, whatever `avalancheGlow` says. Under the height mapping a two-channel cell is coloured from channel 0 alone exactly as `buildMapper(1, [[0, 1]], options)` colours that value, for every preset except `"sand"`; `"sand"` keeps its amber formula with the activity term taken as 0. When `avalancheGlow` is true, the activity channel then overlays today's heat: `mix(colour, mix([255, 92, 12], [255, 246, 184], c1), smoothstep(c1 / 0.85) * 0.55)`, so Amber sand with the glow on reproduces today's CPU sandpile colours exactly and activity 0 changes nothing. `colormap.ts` is the authority: today's shader weights the amber heat with `smoothstep(0.05, 0.85, c1)` where the CPU uses `smoothstep(0, 0.85, c1)`, about 5 levels apart at activity 0.5.
2. `src/app/webglRenderer.ts`: the two new ramps in the shader's ramp function and the preset index switch; a height-mapping uniform set from `channelMappingFor(kernel)` and a glow uniform from the colour options; a shader path that matches deliverable 1's height mapping, using the CPU heat weight `smoothstep(0, 0.85, c1)` for every palette including Amber sand (so the sandpile's GPU amber heat starts at activity 0 rather than 0.05, an accepted change); under the composite mapping the `u_preset == 13` branch and every other branch stay exactly as they are, 0.05 onset included; any `ColourMapOptions` literal gains `avalancheGlow`.
3. `src/app/canvasRenderer.ts`: pass `channelMappingFor(kernel)` to `buildMapper`, so the canvas fallback (and anything else drawn through it) matches the WebGL path.
4. `src/app/controls.ts`: an "Avalanche glow" switch in the colour dashboard, beside "Invert colours", shown only when the sim's mapping is `"height"`, wired through `setColourOptions` so it applies at once and is reset by "Reset to defaults".
5. `src/app/simView.ts`: tell the controls whether to show the switch; draw the legend with the kernel's mapping; when a saved or trial preset's colour options lack `avalancheGlow`, treat it as `false`.
6. `src/app/savedPresets.ts`: the colour-option validator accepts an optional boolean `avalancheGlow`, rejects a non-boolean one, and still rejects any other unknown key. Snapshots saved before this card (no `avalancheGlow`) keep loading; the existing tests in `src/app/savedPresets.test.cjs` stay green unedited.
7. `src/app/presets.ts`: a pure insertion after `sandstorm` in the `abelian-sandpile` block: `{ id: "mandala", label: "Mandala", params: { initialPile: 262144, toppleThreshold: 4, grainsPerStep: 0, topplesPerStep: 500000 } }`, with a comment: 2^18 grains dropped once and never fed, so it settles (about 47 s on the orchestrator's Mac) into the classic single-drop picture; 2^19 took 166 s, so bigger piles wait for GPU toppling.
8. `public/thumbnails/abelian-sandpile.png`: regenerate with `node scripts/generate-thumbnails.mjs` (it wipes and rewrites the whole folder), keep only the new sandpile image, and restore every other thumbnail from `HEAD` byte-for-byte (copy the new file aside, `git checkout HEAD -- public/thumbnails`, remove any file the generator added, copy the new file back). The image stays 640 by 400.
9. `e2e/sandpile-palettes.spec.ts` (new, runs under the existing `playwright.config.ts`): through the real WebGL2 backend with a fixture kernel named "Abelian Sandpile" with two channels labelled "Stable height" and "Avalanche activity", read back the drawn pixel for heights 0 to 3 and activity 0, 0.5 and 1, for Classic sandpile, Sunflower sandpile, Viridis and Amber sand, glow off and on, and compare it with `buildMapper(2, ranges, options, "height")`; every channel within 2 of 255. Skip only when WebGL2 is unavailable, and say so.

## Constraints

- Work from `dev` in the run worktree; never push `main` or `publish`.
- The sandpile kernel is not changed (`src/sims/abelian-sandpile/kernel.ts` byte-for-byte). No other kernel, quality profile or render mode changes.
- No other sim changes colour: the composite (two-channel), single-channel and three-or-more-channel colour paths, every other slug's default colour options and every thumbnail except `abelian-sandpile.png` stay exactly as they are, on the CPU and in the shader. The frozen oracle samples the one- and two-channel paths of all 19 base palettes at default adjustments, every other slug's defaults and every thumbnail digest against `src/app/sandpilePalettes.base-colours.json`; the rest (other adjustments, reverse, steps, three or more channels, the shader's composite branches) is held by the verifier's diff read in criterion 9.
- The four incumbent sandpile presets are unchanged; `git diff <base>..HEAD -- src/app/presets.ts` is a pure insertion of the Mandala entry and its comment.
- Do not edit the frozen block in `src/app/sandpilePalettes.contract.test.cjs` or the fixture `src/app/sandpilePalettes.base-colours.json`. `src/app/sandpilePresets.contract.test.cjs` (card 159) and `src/app/shippedPresets.contract.test.cjs` are frozen historical oracles: leave them untouched; under their own flags they go red after this card (they pin four sandpile presets and the old sandpile thumbnail), which is expected and not a criterion. `e2e/presets-150.contract.spec.ts` is historical too.
- Run everything in the foreground; write the envelope as your final action. Do not background a command and end the turn to wait.
- No absolute home-directory paths in committed files. Author identity via `agent-whoami --model '<your model id>'`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. Worker and verifier: `npm run verify` exits 0. Planning base `f6e6024a5` with the frozen oracle present: 502 tests, 429 pass, 0 fail, 73 skipped. Skips are not passes; the pass count may rise if the worker adds unit tests.
2. Worker and verifier: `npm run build:test && SANDPILE_PALETTES=1 node --test src/app/sandpilePalettes.contract.test.cjs` passes all 10 tests with no skips. Planning base: 1 pass (the unchanged-colours regression guard), 9 fail, the intended red.
3. Worker and verifier: `scripts/check-contract-test-gate.sh --worktree` exits 0.
4. Worker and verifier: with the run worktree's own Vite on 5173 (nothing else listening there), `npx playwright test e2e/sandpile-palettes.spec.ts` passes with no skips, and `npx playwright test e2e/smoke.spec.ts` passes. Afterwards `git checkout HEAD -- e2e/fixtures` if any suite rewrote fixtures.
5. Verifier browser, headless Chromium with `--use-angle=metal --enable-gpu`, cleared storage, 1440 by 900, ultra grid, on a Vite you start from the run worktree on a free port. Open `#/abelian-sandpile`: Palette reads "Classic sandpile" and the "Avalanche glow" switch shows, off. Choose "Mandala": the four controls read 262144, 4, 0 and 500000. Measure over the pile's bounding box (no overlay covers it at 1440 by 900; if one does, exclude that rectangle and say so). Record the seconds from choosing it until two screenshots 5 s apart are identical over that box; that time is at most 90 s. In the settled screenshot: (a) at least 98% of the box's pixels are within 3 per channel of one of the four Classic colours; (b) the box mirrored left to right about the pile's centre column matches itself in at least 95% of its pixels (a speckled, unsettled pile scores far lower); (c) it reads as the Visual goal target. Then, without resetting, switch the palette to "Sunflower sandpile" and repeat (a) with the Sunflower colours, and to "Viridis" and check that height-3 cells read Viridis's top colour and height-0 cells its bottom colour (within 3), not the bottom 28% of the ramp. Speckle at 90 s, a blend between cells or a FAIL on (a) to (c) is a FAIL.
6. Verifier browser, same session: choose "Classic critical", turn the glow on, run 300 iterations and screenshot; turn it off, run 300 more and screenshot. With the glow on, toppling cells near the centre show the orange-cream heat; with it off, at least 98% of the pile's bounding-box pixels are within 3 of a Classic colour. Then choose "Amber sand", set Gamma 0.9 and Contrast 1.1 (choosing a palette keeps the current adjustments), glow on: it reads as today's sandpile (amber terraces with heat).
7. Verifier browser: save a sandpile preset with Sunflower sandpile and the glow on, reload the page, apply it: both come back. Open the gallery at `#/`: the sandpile card shows the regenerated Classic thumbnail. Open `#/gray-scott` and `#/ising-model`: each opens on its usual palette (Ice and Plasma) and shows no "Avalanche glow" switch.
8. Verifier code read: `canvasRenderer.ts`, `webglRenderer.ts` and `simView.ts` each take the mapping from `channelMappingFor(kernel)`, not from a slug literal; if Chromium's `--disable-webgl` brings up the canvas fallback, repeat 5(a) there and record it, otherwise say it could not be forced.
9. Verifier scope: the diff touches only the nine deliverable paths, and in `colormap.ts` and `webglRenderer.ts` it leaves the composite, single-channel and three-or-more-channel paths unchanged apart from the new ramps and the threaded `mapping` argument. Any other path, an edit to a frozen file, or a changed line in an incumbent preset is a FAIL regardless of other evidence. Save the screenshots from 5 to 7 under `e2e/artifacts/sandpile-palettes-161/` (git-ignored) as the operator's look pack and list them in the verdict.
10. Operator, not judged or recorded by either seat: a look after a PASS lands the stage on `dev` (the verifier reports it as not applicable, never as FAIL). The operator may rename the palettes or retune a colour then; that is a follow-up commit, not a repair.

## Contract test

- **Test file:** src/app/sandpilePalettes.contract.test.cjs
- **Oracle command:** `npm run build:test && SANDPILE_PALETTES=1 node --test src/app/sandpilePalettes.contract.test.cjs` (skips without the flag)
- **Assertions digest:** sha256:a8a0fcf0c20f135d87d5216d18e520d8cb9b2d393d60b3c8979216da9699dfb5
- **Oracle proof:** On the unchanged base `f6e6024a5` on 2026-11-11: 1 pass (composite and single-channel outputs of all 19 base palettes, with the glow field either way, equal the fixture), 9 fail for the card's reasons (amber label still "Avalanche glow"; sandpile defaults still `sand` 0.9 / 1.1 with no glow field; `channelMappingFor` missing; the height mapping argument ignored, so Viridis at height 0 drew 59,82,139 not 68,1,84; four presets where five are frozen; a saved snapshot with `avalancheGlow` rejected as an unknown key; the thumbnail digest unchanged). Without the flag all 10 skip. A throwaway reference in a scratch worktree (colour model, saved-preset key, Mandala entry and a stand-in thumbnail edit; about 120 lines, not in git) passed 10 of 10, and four mutations of it each failed exactly the intended test: a Classic colour off by one (Classic colours test), the glow always on (Classic colours and glow tests), the composite weight 0.72 changed (unchanged-colours guard), and Gray-Scott given the height mapping (mapping test). The fixture's own digest is frozen inside the block. The shader, canvas, controls and legend paths are outside the oracle's seam: deliverable 9's parity spec and criteria 5 to 8 cover them.

## Out of scope

Any sandpile kernel change, GPU toppling and piles above 2^18 (option C from the 2026-11-11 research), other lattices, the sandpile-group identity and multiple drop points (option D), retuning or renaming the four incumbent presets, the About text, the 2026-11-08 "Dense mandala" candidate, and every other sim's palettes and thumbnails.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 75 minutes
- **Spend basis:** card 160 attempt 1 (2026-11-10, Opus 5.5 high worker and Sol high verifier on a renderer-adjacent card) cost 15.3M cached-inclusive tokens; plan about 16M for this card, which touches more files but has a frozen numeric oracle. Preparation (orchestrator, 2026-11-11, in the interactive session): the research, the settle-time runs, the oracle with its fixture and throwaway reference, and a cross-family cold read, about 1.5M by estimate.

## Dispatch envelope

Return the exact commands and exits, the thumbnail regeneration steps, the parity spec's result, the screenshot paths, and the diff summary. State PASS, FAIL or partial honestly. Stop at wall-clock or an unresolved evidence failure; preserve the work and ask for an operator decision rather than requeueing.

## Family-specific notes

Both roles need WebGL2: headless Chromium with `--use-angle=metal --enable-gpu` on this machine (`playwright.config.ts` passes them). `playwright.config.ts` serves on 5173 and reuses whatever is listening there, so run the e2e suites only with the run worktree's own Vite on 5173; the orchestrator stops the operator's look server before dispatch. For the manual browser checks start a second Vite from the run worktree on a free port. This card declares Requires GUI, which runs the Codex verifier as `danger-full-access` (autometta `scripts/models.sh`), so it can start Vite, reach localhost and use the GPU; Requires network is not needed on top.

## Readiness review

Baselines on `f6e6024a5` on 2026-11-11: `npm run verify` exit 0 (502 tests, 429 pass, 0 fail, 73 skipped, the frozen oracle's 10 skips included); the frozen oracle 9 of 10 red for the stated reasons and 10 of 10 skipped without the flag; the settle times in the Surfacing concern from the compiled kernel in node. The e2e smoke baseline is run just before queueing, once the operator's 5173 look server is stopped, and recorded below. Claims closure: `ColourMapOptions` literals exist in `webglRenderer.ts` and `colormap.ts` among the typechecked files (e2e files are not typechecked and their literal options stay valid because the field is optional to the validator); `buildMapper` is called from `canvasRenderer.ts` and `webglRenderer.ts`, `sampleColour` from `simView.ts`, `defaultColourOptionsFor` from `simView.ts`, `thumbnail.ts` and `trialPresets.ts` (the last two need no edit); the per-sim render-options store restores only `steps`, so a fresh load opens on the factory palette. Serial dispatch: shares `src/app/presets.ts` with card 158 (re-briefed to the preset only on 2026-11-11, its oracle checks only the Cyclic CA presets); card 160 was retired the same day.

Smoke baseline on `cc650b520` on 2026-11-11, after the operator's look server was stopped: `npx playwright test e2e/smoke.spec.ts` 43 passed (1.8 min), exit 0. `npm run verify` on the same tree: exit 0, 502 tests, 429 pass, 0 fail, 73 skipped.

Cross-family cold read (GPT-6.1 Sol, read-only, medium effort, 2026-11-11, about 0.1M tokens) on the card and the frozen test. Folded in: (1) today's CPU and GPU amber heat weights differ (`smoothstep(c1 / 0.85)` against `smoothstep(0.05, 0.85, c1)`), so `colormap.ts` is named the authority and the sandpile's shader path adopts the CPU weight, with the composite branches untouched; (2) criterion 6 now sets Gamma 0.9 and Contrast 1.1 before judging Amber sand, since choosing a palette keeps the adjustments; (3) the Visual goal now says thresholds above 4 take interpolated colours, one per level; (4) the Constraints no longer claim the oracle checks every colour path, and criterion 9 reads the rest. Its network question is answered in Family-specific notes (Requires GUI runs the seat unsandboxed). It found no impossible frozen assertion and no unnamed file.
