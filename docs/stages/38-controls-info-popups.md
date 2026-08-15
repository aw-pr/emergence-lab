# Stage card 38-controls-info-popups: info popups and grouping in the controls panel

## Metadata

- **Authored:** 2026-08-15
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** Well-specified UI infrastructure against a committed
  contract — Sonnet-tier work. The verifier needs a browser because the
  deliverable is an interaction (open, dismiss, keyboard, touch targets) that
  cannot be judged from the diff, and a mispositioned or undismissable popup
  is exactly what a code-only review passes.
- **Verifier transport:** cli.

## Depends on

`docs/INTERFACE.md` **v1.3.0** (committed at `4ad1478`), which adds optional
`info` and `group` fields to `ParamDescriptor`. Read that contract section
first; it is the whole spec for what drives this UI. Do not redefine or
extend the contract — if it is missing something you need, stop and surface
it as a blocker.

## Objective

Render an ⓘ info affordance beside every control whose descriptor carries
`info`, opening a small popup with the text, and render params sharing a
`group` together under the existing collapsible-section component. Stages
39a-c then fill in the actual text and groupings sim by sim; this stage makes
the machinery exist and proves it on one sim.

## Background you need

The controls panel is auto-generated from `paramSchema` with no per-sim
branching (`docs/INTERFACE.md`, decision 2 — this rule is load-bearing and a
regression on it fails the stage). `src/app/controls.ts` already has a
collapsible, headed section component with per-sim persisted open/closed
state (`controls.ts:26-43`); grouping must reuse it, not invent a second
section mechanism.

## Inputs (read these in your own context)

- docs/INTERFACE.md — the v1.3.0 `ParamDescriptor` section and decision 7
- src/app/controls.ts — the whole file; it is the surface being extended
- src/sims/logistic-mandelbrot/kernel.ts — the param schema for the
  demonstration sim
- e2e/smoke.spec.ts — e2e conventions, if you add a case

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. Info affordance in `src/app/controls.ts`: a small ⓘ button beside the
   label of any control whose descriptor has `info`. Click/tap toggles a
   popup showing the text; Escape, clicking elsewhere, or opening another
   popup closes it. Keyboard-reachable (focusable, Enter/Space toggles),
   `aria-expanded` and an `aria-describedby` or equivalent wiring, touch
   target no smaller than the existing control affordances. Controls without
   `info` render exactly as today — no reserved gap, no dead icon.
2. Grouping in the same file: params sharing a `group` render together under
   a collapsible section headed by the group name, sections in first-
   appearance schema order, ungrouped params in the sim's existing default
   section. Reuse the existing section component and its persistence.
3. Demonstration on **logistic-mandelbrot only**: fill `info` for every param
   in its schema and assign sensible `group`s (e.g. the orbit3d camera/
   detail cluster vs the colour cluster). This proves the machinery and
   gives stages 39a-c a worked example to match in tone: one or two plain
   sentences, what changes visually, note a rebuild cost where one exists
   (e.g. Tail refinement and Boundary detail rebuild the cloud; Boundary
   detail's extra points appear only as the camera closes in).
4. An e2e case asserting: a control with `info` shows the affordance, the
   popup opens and closes, and a control without `info` has no affordance.

## Constraints

- No per-sim branching in the renderer. The panel is built from `paramSchema`
  alone; the demonstration lives entirely in the kernel's schema.
- Do not change any param's key, default, min/max/step, or behaviour — this
  stage adds presentation only. Kernel `init`/`step` paths untouched.
- Do not modify `src/sims/**` other than the logistic-mandelbrot
  `paramSchema` literals (`info`/`group` additions only).
- Stage 36's frozen parity block and stage 37's machinery are out of scope
  and must be untouched.
- No new runtime dependencies; no CSS framework — extend the existing styles.
- Popup must not clip at panel edges or trap scroll; verify at the narrowest
  supported panel width.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green; stage 36's parity digest still matches card 36.
2. In the browser: every logistic-mandelbrot control shows a working popup
   with accurate text; open/dismiss works by mouse, keyboard, and Escape;
   only one popup open at a time. Screenshot an open popup.
3. Grouping renders as specified, reuses the existing collapsible sections,
   and open/closed state persists per sim across a reload.
4. A sim with no `info`/`group` anywhere (pick any other sim) renders
   byte-identically to before — no icons, no layout shift. Compare
   screenshots.
5. The e2e case runs and passes against the real page, and fails if the
   affordance is removed (perturb and revert; state what you saw).
6. No regression to control behaviour itself: dragging a slider with a popup
   open still works; the popup does not steal or break input.
7. No per-sim branching introduced in `src/app/**` — confirm by reading the
   diff, not by assumption.

## Contract test

- **Test file:** None; stage 36's frozen harness stands (criterion 1 pins it).
- **Assertions digest:** None

## Out of scope

- Writing `info`/`group` for the other 21 sims — that is stages 39a-c.
- Any change to param semantics, defaults, or kernel behaviour.
- Renderer/simulation code outside the controls panel.
- Any push, publish-branch, or merge work.

## Budget

- **Worker wall-clock:** 75 minutes
- **Verifier wall-clock:** 45 minutes

## Verifier handoff

Worker reports: the popup's DOM/ARIA structure and dismissal model; how
grouping composes with the existing section persistence; the exact
logistic-mandelbrot schema additions; and confirmation that no per-sim
branching entered `src/app/**`.

## Family-specific notes

Claude worker: you have GUI access; exercise your own popup before handing
off, and say what you checked. Environment: run any manual dev server with
`--strictPort` on port 5175 or higher; 5173/5174 may carry foreign worktree
servers, and the operator may have one on 5178 — never reuse any of them.

## Round 2 re-brief (2026-08-15)

Round 1's implementation is committed at **`4c4a175`** on this branch and is
not in question: the info affordance, popup, grouping sections, the
logistic-mandelbrot schema text, and an e2e case are all present, and
`npm run verify` was green at commit time. The round-1 worker ended its turn
while waiting on a Playwright run and never wrote its handoff envelope — the
work was fine; the handoff discipline was not.

Round 2's job: start from `4c4a175`, actually execute the checks — run the
e2e case, exercise the popups and grouping in the browser (headless is fine
for all of it; nothing here needs frame timing), fix anything genuinely
broken that execution reveals, and **write the handoff envelope as your
final action before ending your turn**. Do not wait for anything
asynchronously after kicking it off — run commands to completion, then hand
off. An unwritten envelope stalls the stage regardless of how good the work
is.
