# Stage card 150-saved-preset-library: Save and revisit simulation presets

## Metadata

- **Authored:** 2026-11-02
- **Orchestrator:** Codex orchestration session
- **Worker:** GPT-6.1 Sol
- **Verifier:** Claude Sonnet 5.5
- **Base branch:** dev
- **Run branch:** autometta/150-saved-preset-library
- **Worker effort:** high
- **Verifier effort:** high
- **Requires GUI:** true
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** coding-tier UI implementation with independent cross-family browser, persistence and visual verification.
- **Open decisions:** none
- **Readiness:** Browser-local scope confirmed 2026-11-02; baseline and cross-family review complete. Strict card lint passed; approved scope ready for one bounded admission.

## Surfacing concern

The operator cannot reasonably type the research candidates into many simulation controls. Emergence currently persists last-used values but has no named preset library. Promo Flow's galaxy tuning panel already saves, loads and deletes named browser-local versions; that is the behaviour reference, not a sufficient public-facing design. Its numeric-only store cannot be copied unchanged: simulation parameters include enums and booleans, variants, rendering settings and separately stored Boids obstacles.

This card adds an emergence page that feels part of Promo Flow. The full emergence rebrand and visual flourish are explicitly deferred until after model-improvement review. No new framework, account system or deployment is assumed.

## Objective

From a running simulation, save its configuration under a name; find it on a dedicated Presets page; launch, rename, duplicate, update or delete it without manually re-entering parameters. A saved preset restores configuration and starts a fresh run, not a checkpoint of the live particle field or camera gesture history.

Agreed lightweight first release: local browser storage with JSON export/import, and ready-to-launch stage-144 trial configurations. The page explains browser-local persistence in plain language. Trial entries remain distinguishable from shipped presets and personal saves; opening a trial does not promote it into production defaults. Later sweep candidates can use the same catalogue after their evidence is checked.

## Inputs (read these in your own context)

- `tsconfig.test.json`
- `scripts/run-kernel-tests.cjs`
- `src/app/gallery.ts`
- `src/app/lib.ts`
- `src/app/element.ts`
- `src/app/router.ts`
- `src/app/mount.ts`
- `src/app/simView.ts`
- `src/app/controls.ts`
- `src/app/persistence.ts`
- `src/app/paramPersistence.ts`
- `src/app/presets.ts`
- `src/app/registry.ts`
- `src/app/chrome.ts`
- `src/app/styles.css`
- `src/app/types.ts`
- `docs/INTERFACE.md`
- `docs/sweeps/data/2026-10-30/144/physarum.app-evidence.json`
- `docs/sweeps/data/2026-10-30/144/particle-life.app-evidence.json`
- `docs/sweeps/data/2026-10-30/144/boids.app-evidence.json`

## Deliverables

1. Dedicated hash-routed Presets page, discoverable from gallery and simulation controls. Search by name and filter by simulation; clear personal/trial provenance, helpful empty state and a prominent Open action. Use human-readable simulation and preset names, not parameter strings as titles.
2. Named configuration capture and validated, versioned persistence integrated with existing control state. Snapshot boundary: simulation slug and optional variant, complete effective kernel params (including supported optional seed), colour options, display options, resolution, playback step rate and auto-cycle setting. Custom Boids obstacle configurations must carry their serialized field using the existing import/export format. Local prebaked model selections are not portable: refuse saving them with a visible explanation and offer returning to the live model; never silently substitute. No silent inheritance of stale settings when opening a saved preset.
3. Save, rename, duplicate, explicit update and delete-with-undo interactions. Unique IDs separate identity from names. Duplicate names must never silently overwrite another entry. Trial entries are read-only sources that can be copied into personal saves. Storage failures must be visible, without false durable-save claims or losing the current in-memory configuration.
4. JSON export/import with validation, version checks, safe merge without silent overwrites, and a useful invalid-file error. Browser-local saves are scoped to the origin; explain that Vite and a deployed site do not share storage.
5. nine stage-144 trial entries, three each for Physarum, Particle Life and Boids, derived exactly from the shipped-population finalist rows in the retained app-evidence JSON. Include fixed params and seed where supported, obstacle-free Boids, and original source identifiers for provenance. Use the current renderer defaults explicitly. Existing shipped presets stay unchanged. Trial labels do not claim promotion or screenshot-exact live trajectories.
6. Responsive public-facing page and dialogs using Promo Flow's visual vocabulary: deep slate background (#020617), near-white text (#e8ecf4), blue primary actions (#0066CC), blue-grey secondary text (#A8B9D1), restrained translucent surfaces and fine borders. Comfortable control sizes, readable hierarchy and visible focus states; do not copy the compact developer tuning panel. Keep broader gallery/simulation branding changes out of this card.
7. Focused store and browser tests plus retained desktop/mobile screenshots and manual live-launch checks. Use the frontend-design skill when available; otherwise follow the recorded design direction in deliverable 6. No continuously running simulation per library tile; launch a single live model on demand through the existing lifecycle.

## Constraints

- Work from current dev. Preserve existing shipped presets, defaults, kernels, scientific evidence and frozen contracts. No production preset promotion.
- Preserve standalone, site-embedded and fixed-route embedding behaviour. Dispose active simulation/render loops during page transitions; browser back/forward must remain coherent.
- No kernel-to-renderer interface shape change, new UI framework, backend/auth dependency or cross-repo edits.
- Do not touch parked logistic-mandelbrot branches or revive their work. Generic preset support must not change their kernels or defaults.
- No queue/budget/auth changes, deployment, main merge or publication from the worker.
- Do not take over the operator's running Vite server. Browser verification uses an isolated owned port and stops only its own processes.
- Preset names/imports are untrusted data: render names as text, validate model/variant/parameter types, finite numbers and enum options, and prevent prototype-key assignment. Unknown or incompatible data cannot silently change defaults or erase good saves. Reject an invalid import atomically, including unknown models/variants, unknown parameter keys, invalid enum values, nonfinite numbers and unsupported versions. Trial seeds are an explicit supported optional integer parameter for Physarum and Particle Life. Do not quantize a valid exact trial value to a slider step; all nine rows have been checked within descriptor min/max; no range widening is needed for them.

## Acceptance criteria

1. Worker and verifier: `npm run verify` and `npm run build:lib` pass; these cover standalone and embedding entry points. Existing relevant routing/persistence regressions remain green.
2. Verifier browser journey: configure a simulation, save, reload, find it on Presets, launch it and inspect effective values. Repeat with a variant and nonnumeric parameters; stale last-used values must not leak into the restored configuration. Saved configuration is independent of subsequent edits.
3. Verifier browser journey: rename, duplicate, update and delete/undo survive reload correctly. Duplicate-name and cancelled operations preserve existing entries. Trial entries cannot be edited or removed as personal saves.
4. Verifier storage checks: blocked writes and malformed/version-incompatible stored data produce an honest recoverable state. Valid saves remain usable; names render safely. Export/import round-trip preserves configurations; malformed or incompatible input has no partial destructive effect.
5. Trial catalogue check: all nine entries match retained source rows, including fixed parameters and population. Launch one trial from each of the three models in a real browser and compare actual effective parameters; no manual entry is required. Trials remain labelled and shipped defaults remain byte-identical.
6. Verifier desktop/mobile and keyboard review: library, search/filter, dialogs, empty/error states and live launch work without overflow or obscured actions. Keyboard focus, dialog dismissal/return, accessible names and delete undo are usable. Retain screenshots at 1440x900 and 390x844; compare against the recorded Promo Flow design direction. Operator aesthetic sign-off remains distinct from functional acceptance.
7. Verifier lifecycle/embedding check: library navigation, launch, back and forward dispose the previous live renderer, preserve host chrome and do not break fixed-route embeds. No duplicate render loop or console error introduced.
8. Verifier scope check: no changes to protected surfaces (`src/sims/**`, `src/app/presets.ts`, `src/app/types.ts`, `src/app/registry.ts`, renderer/backend, quality-profile and colour-map modules, `docs/INTERFACE.md`, `docs/sweeps/**`, `docs/images/**`, scripts and package dependencies). `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts` and `scripts/check-contract-test-gate.sh --worktree` pass; all six frozen tests must execute without skips; every criterion requires concrete evidence, not just a core storage-test PASS.

## Contract test

- **Test file:** e2e/presets-150.contract.spec.ts
- **Assertions digest:** sha256:a872c92ff3768a5649bff0b5c9122c66bcedeac1d70685ba26c6f7cf25f3bcb6
- **Oracle proof:** On base `8803cd42c`, `PRESET_CONTRACT=150 npx playwright test -c e2e/presets-150.config.ts --timeout=10000` exited 1: one assertion-fixture/protected-surface test passed; five browser journeys failed at missing Presets links/headings or Save preset buttons. Existing model routes and inputs loaded before the missing-action failures. Positive snapshot fixture plus four deliberately broken fixtures validate the snapshot assertion helper. Full UI reference green was not attempted because it would implement the production feature during preparation; exact public UI contract and assertions received orchestrator review, with worker completion and independent verifier execution still mandatory. No missing outcome is waived.

## Observable UI and backup contract

The route is `#/presets`. Entry links are named `Presets`; page heading is `Presets`. Simulation action `Save preset` opens a dialog with textbox `Preset name` and buttons `Save`/`Cancel`; Escape cancels and returns focus. A loaded personal save additionally exposes `Update preset` (explicit update from current configuration). Library fields are labelled `Search presets` and `Simulation` (all option value is empty; model options use slugs). A library item has `data-preset-id`, `data-preset-name`, `data-preset-source` (`personal`, `trial`) and `data-preset-slug`; trial items also have `data-preset-row` equal to the retained row ID. Item actions are `Open`, and for personal entries `Rename`, `Duplicate`, `Delete`; rename/duplicate use the same named textbox with `Save`/`Cancel`. Deletion offers `Undo` through a visible status area until another mutation or navigation; no permanent-delete confirmation is required. Duplicate personal names are rejected with a visible error; duplicate/import collisions receive distinct names/IDs instead of overwriting. Trial items have no mutation controls. Built-in presets remain in the existing simulation dropdown; v1 does not list them on the library page.

`Export presets` downloads only personal saves. A labelled file input `Import presets` imports that format. Stable backup/storage envelope: `{format:"emergence-presets",version:1,presets:[{id,name,snapshot}]}`; optional timestamps are allowed. Store at `el:saved-presets:v1`. Snapshot fields: `{slug,variant?,params,colourOptions,displayOptions,resolution,stepsPerFrame,autoCycle,customObstacles?}`. `params` contains the full effective configuration, not just overrides; `customObstacles` is the existing serialized Boids layout string. Rendering option fields use current ColourMapOptions/DisplayOptions shapes. Numeric import bounds must respect existing kernel/schema semantics, using current descriptor min/max (not step quantization), with explicit seed allowlisting for the two supported models. A current configuration outside that portable range cannot be saved: show a useful error and keep it running unchanged. Do not silently clamp saves or imports. Export reflects durable/in-memory personal entries, never the private research file paths or local machine paths. Saving captures a deep copy. Re-opening a saved snapshot ignores last-used state, while ordinary non-preset route behaviour is preserved. All mutations announce status/errors accessibly. Storage write failure keeps the in-memory save and reports that it lasts only until reload.

The frozen suite checks executable journeys; independent verifier also records actual runtime values/lifecycle and manual keyboard/visual evidence for criteria 2/6/7. No test-only UI or synthetic renderer may substitute for the real app. Accessibility and aesthetic review cannot be reduced to screenshot existence; the final verifier must explicitly judge the manual criteria.

## Path claims

Implementation claims: `tsconfig.test.json` (only add compilation inputs for new unit-test modules); `src/app/router.ts`, `src/app/mount.ts`, `src/app/simView.ts`, `src/app/controls.ts`, `src/app/gallery.ts`, `src/app/styles.css`, `src/app/persistence.ts`; new `src/app/savedPresets.ts`, `src/app/presetLibrary.ts`, `src/app/trialPresets.ts`; focused `src/app/savedPresets.test.cjs`, `e2e/presets-150.spec.ts` and fixture assets under `e2e/fixtures/presets-150/`. Frozen `e2e/presets-150.contract.spec.ts` and `e2e/presets-150.config.ts` are orchestrator-owned. Existing library export build must pass without changing package dependencies. `scripts/run-kernel-tests.cjs` already discovers app tests and checks their emitted inputs; it remains read-only. Preset-session persistence isolation belongs in `controls.ts`, `simView.ts` and `persistence.ts`; leave existing `paramPersistence.ts` migration semantics unchanged. Existing `src/app/presets.ts` remains read-only.

## Implementation decisions from cold review

- Existing kernels already read optional `seed` in their `init` path: Physarum and Particle Life use numeric seed 144 in retained trial rows. Preserve it in params and pass it to the kernel without adding schema controls or changing kernels. For other models accept only descriptor keys. Slider step granularity is presentation, not permission to round saved values; tests compare exact kernel inputs and controls.
- Support saves for all currently available registry models, including their existing variants, through one generic snapshot path. Do not expose shelved models. No local prebaked-source save; no camera gesture/field checkpoint. Scope does not revive parked experiments. New snapshot types live in `savedPresets.ts`, not the reviewed kernel interface `types.ts`.
- Open uses a route-scoped preset ID (query suffix after the simulation/variant hash route), resolved through the catalogue/store on reload. Same-document navigation must work for unsaved-in-storage entries too. Keep preset-session control changes in memory until an explicit Save/Update; do not overwrite ordinary last-used persistence while a preset is active. Missing/deleted IDs show a recoverable error and a Presets link, never silently launch different settings. If the active personal entry is deleted in another tab, Update fails clearly and Save as a new entry remains available. Returning to an ordinary simulation route restores ordinary persistence behaviour.
- Fixed-route embeds retain their current navigation and do not expose the new Presets/Save actions in v1. Hash-routed standalone and site-embedded mounts expose the tools while respecting existing host chrome. `mountLab` owns disposal; no renderer/backend modification is needed. `lib.ts`/`element.ts` are read-only integration inputs; their builds/regressions must pass.
- Trial module contains explicit constants derived from the three shipped-finalist rows per source file (kind=finalist and population starts with shipped). It must not fetch or bundle private docs at runtime. Resolve complete render defaults using the existing factory functions/quality profiles for the slug; `autoCycle=false`, default playback profile, default resolution, default colour/display settings, source params including kernel `stepsPerFrame` where present. Kernel stepsPerFrame and renderer playback step rate are distinct. Boids trial `obstacleLayout=none` must not import a last-used custom field. Store an opaque source ID, not a private path, in runtime catalogue metadata.
- Names: trim, 1–64 characters, case-insensitive uniqueness for personal saves. Duplicate and import auto-suggest/use `Name (copy)`, `Name (copy 2)` etc.; explicit Save/Rename with an existing name fails visibly. Imports always get fresh IDs, never overwrite existing IDs. Limit imports to 1 MiB and total personal entries to 200; over-limit input is an atomic rejection. Envelope/preset unknown metadata may be ignored, but unknown snapshot fields/params and prototype-related keys are rejected; optional created/updated timestamps are accepted metadata. Reuse the Boids layout parser for customObstacles validation and its existing caps. Never assign arbitrary keys to ordinary prototypes.
- Parse stored data atomically. Malformed/incompatible storage stays untouched with an error and recovery actions (download raw data or explicit reset); no silent empty overwrite. Re-read current storage before durable mutations and reconcile cross-tab changes by ID; reject an update if its target disappeared. Delete writes immediately; Undo restores the same entry if no intervening mutation/navigation invalidated the offer. Blocked storage uses an in-memory overlay and honest status until reload; do not clear working memory on hash navigation.
- The six-test frozen suite is direct evidence for its covered portions of criteria 2–6, not a demand for the verifier to repeat identical journeys manually. Additional focused implementation tests must cover malformed enum/unknown key/prototype payloads, limits, custom obstacles, concurrent-tab deletion, stale route IDs, colour/display restoration, supported model variants and embedded lifecycle. Verifier independently runs those tests and checks real runtime inputs, responsive screenshots, focus and lifecycle rather than trusting worker assertions. Browser storage failure injection is allowed; no fake application UI or renderer is allowed.

## Out of scope

Full emergence rebrand, new logos, site-wide animation polish, backend/account sync, live-state snapshots, public sharing service, changing research rankings, additional sweeps, stage-145 recovery, automatic promotion and deployment.

## Budget

- **Worker wall-clock:** 240 minutes
- **Verifier wall-clock:** 90 minutes
- **Spend basis:** 8–15M cached-inclusive tokens per worker/verifier pair; 15-minute initial preparation checkpoint. No automatic retry or runtime cap increase. Estimate and gates presented to operator before admission; existing cap remains binding.

## Dispatch envelope

Report commands/exits, persistence and browser journeys, screenshot paths, actual saved/restored parameter comparisons, limitations and scope diff. Missing evidence is incomplete, not PASS. Stop at a concrete conflict; do not weaken the frozen oracle.

## Readiness review

Reference inspected by orchestrator in the sibling Promo Flow checkout: `src/components/tuning/TuningPresets.tsx`, `src/components/tuning/tuning-presets.ts`, `src/components/tuning/tuning-styles.ts`, `src/app/globals.css`. Do not add a runtime dependency on that checkout or modify it.

Current baseline: clean dev at `8803cd42c`, stage 144 completed and merged. Inspected Promo Flow local-save reference and emergence routing, mounting, existing scalar/enum/boolean persistence and preset consumers. Existing fixed-route embeds bypass hash routing, so the page must preserve their host contract. Operator chose browser saves without accounts. Trial presets and import/export follow the recommended lightweight scope. Snapshot boundary and consumers are recorded above. Baseline `npm run verify` exit 0: 397 passed, 38 existing opt-in skips, zero failures; production build passed. `npm run build:lib` exit 0. Frozen browser baseline and positive assertion fixtures are recorded in Contract test. The first baseline run was interrupted waiting for the absent link; it is not counted as a completed run. The final bounded baseline ran all six tests in 43.2 seconds. Existing test config uses port 5173; new isolated config owns 5186 and carries the same platform GPU flags. Operator Vite process on 5173 remains untouched. The frozen suite stays opt-in for normal discovery.

Claude Sonnet 5.5 independently cold-read the card twice using subscription CLI with tools disabled. The first read identified seed, persistence/reload, import and embedding ambiguity; Implementation decisions closes those. Final read accepted one bounded coding-tier attempt, subject to test-compilation claims, range proof, protected-path list and fallback design guidance. Those are resolved: tsconfig.test.json claimed, test runner inspected/read-only; isolation assigned to existing persistence call sites; all nine rows independently checked against compiled current kernel schemas (75 descriptor fields, all in range; seed 144 already consumed by Physarum/Particle Life); protected surfaces explicitly listed; design tokens in deliverable 6 are sufficient if the skill is unavailable. UI snapshot types stay outside the kernel interface.

Remaining execution risk is route-scoped state/lifecycle and visual polish, not an unresolved scope decision. Worker has 240 minutes and verifier 90. Supplemental worker tests under `e2e/presets-150.spec.ts` execute with the same isolated config; their baseline is not claimed green before they exist. The verifier must supply concrete evidence for all manual and supplemental checks before PASS. No production implementation or full mock app was authored during preparation.
