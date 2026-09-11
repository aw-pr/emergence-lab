# Stage card 93-param-groups-to-schema: the kernel schema owns parameter grouping

## Metadata

- **Authored:** 2026-09-12
- **Orchestrator:** Claude Fable 5.1 <claude-fable-5-1@local>
- **Worker:** GPT-6 Astra <gpt-6-astra@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/93-param-groups-to-schema
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Dispatch:** serial
- **Pairing rationale:** this is an Astra-assessment card. The weekend of
  2026-09-12 puts GPT-6 Astra in the worker seat on every code card the fleet
  queues, with a Claude verifier, to get a measured read on the model past
  the n=2 the 87-91 slate left (card 88: five of six deliverables on attempt
  1; card 90: a correct stop on an overturned premise). This card is the
  right shape for that read: a cross-cutting refactor over sixteen kernel
  files and one app table, with an exact parity gate, no browser, no shader.
  The verifier is Opus 5 because the gate is a diff over a derived structure
  and the failure mode to catch is a quiet reorder that reads as parity in
  prose. Cross-family by design; no GUI, so the Codex sandbox is not in the
  way.
- **Type:** Refactor with a byte-exact parity gate on rendered behaviour.
- **Serialises with:** nothing live. The queue is empty at authoring time.

## Surfacing concern

`src/app/simView.ts` carries a hardcoded `PARAM_GROUPS` table (from line 104)
naming the collapsible parameter sections for sixteen sims. `ControlsPanel`
(`src/app/controls.ts`, from line 394) consumes that table first and only then
consults the schema-native `ParamDescriptor.group` field that interface v1.3.0
added (`docs/INTERFACE.md`, item 7). Any key the table claims is removed from
schema grouping, so for every sim in the table the kernel's own `group`
fields are shadowed and inert: boids declares "Flocking rules" on
`alignment`/`cohesion`/`separation` and renders "Steering"; particle-life
declares "Interaction forces" and renders "Forces"; and so on. Stage 39b's
worker found this on 2026-08-15 and it has sat as a deferred upgrade in
`HANDOFF.md` since. Two sources of truth for one rendered structure, with the
schema one silently losing, is the defect.

This card makes the kernel schema the single source of grouping and deletes
the table, while keeping what the operator sees today byte-for-byte
identical. The table is what has rendered for weeks and is the approved
grouping; the schema is what should carry it.

## Inputs (read these in your own context)

- `src/app/simView.ts` lines 96-180: the `PARAM_GROUPS` table and its one
  consumer at line 645 (`paramGroups: PARAM_GROUPS[slug] ?? []`), plus the
  `VIEW_PARAM_KEYS` table just above it, which claims keys before either
  grouping mechanism runs
- `src/app/controls.ts` lines 383-440: the three grouping passes in order
  (view section, table groups, schema-native groups) and the trailing
  ungrouped section that follows them
- `src/app/types.ts` lines 10-20: `ParamDescriptor`, including `group`
- `docs/INTERFACE.md` item 7 (v1.3.0): the semantics of `group`, in
  particular "sections in first-appearance schema order, members in schema
  order"
- `src/sims/<slug>/kernel.ts` `paramSchema` for each of the sixteen sims the
  table names: boids, particle-life, physarum, gray-scott,
  belousov-zhabotinsky, game-of-life, diffusion-limited-aggregation,
  kuramoto-oscillators, lenia, lorenz-attractor, ising-model, mandelbrot,
  julia-set, burning-ship, and any other key of `PARAM_GROUPS` you find
  (the list above is from reading the table; the table is authoritative)
- `src/app/qualityProfiles.test.cjs` and `scripts/run-kernel-tests.cjs`: the
  pattern for an app-level unit test that the `npm test` gate picks up
  (tests under `src/app` require the compiled module from `.test-build/app/`)
- `docs/stages/39b-param-info-agents-flow.md`: where the finding came from

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. **A snapshot script, `scripts/param-groups-snapshot.cjs`,** that loads
   every registered kernel from `.test-build/` and prints, as stable JSON to
   stdout, the effective rendered parameter grouping per sim: an ordered list
   of `{ label, keys }` sections followed by the ordered list of ungrouped
   keys, derived by replicating `ControlsPanel`'s three passes exactly (view
   keys claimed first, then table groups, then schema-native groups, then the
   remainder). It must read the table from `simView.ts`'s compiled output
   while the table exists, and read nothing but the schema once it is gone,
   so the same script runs on both sides of the change. Keys of the JSON
   sorted, sims sorted by slug, so two runs diff cleanly.
2. **The before snapshot, `docs/audits/2026-09-12-param-groups-before.json`,**
   produced by running deliverable 1 against the unmodified tree, committed
   before any kernel or app change. This is the parity reference.
3. **Schema changes in every kernel the table names**, so that each kernel's
   `paramSchema` carries `group` fields whose first-appearance order, labels
   and membership reproduce the before snapshot for that sim. Where a kernel
   already declares a `group` label that differs from the table's (boids
   "Flocking rules" versus "Steering", particle-life "Interaction forces"
   versus "Forces", physarum, kuramoto, lorenz, diffusion-limited-aggregation
   and any others), the table's label wins, because it is what renders today.
   Reorder `paramSchema` entries where first-appearance order requires it,
   but do not change any descriptor's `default`, `min`, `max`, `step`,
   `options` or `info`.
4. **Deletion of `PARAM_GROUPS`** from `src/app/simView.ts` and of the
   `paramGroups` option and its consumer pass from `src/app/controls.ts`,
   so schema-native grouping is the only grouping mechanism left. The
   comment above the table that explains logistic-mandelbrot's exemption
   goes with it.
5. **The after snapshot** as the same file as deliverable 2, regenerated:
   it must be byte-identical, which is why the reference is committed
   first and the script must not need the table to run. Record the diff
   command and its empty output in the envelope.
6. **A unit test, `src/app/paramGroups.test.cjs`,** that runs the same
   derivation as the script in-process and asserts it equals the committed
   snapshot, so the next kernel edit that drops a `group` field fails the
   `npm test` gate rather than quietly reshuffling the panel.
7. **Kernel test updates** only where an existing `kernel.test.cjs` asserts
   a `group` label or a schema order this card changes. List every such
   assertion changed in the envelope with the old and new value.
8. **Docs:** one paragraph in `docs/INTERFACE.md` item 7 saying the schema
   is now the sole source of grouping for every sim (no app-side table), no
   version bump because the descriptor shape is unchanged; and the two
   `HANDOFF.md` deferred lines about `PARAM_GROUPS` (around line 476)
   marked resolved by this card.

## Constraints

- **Rendered parity is the gate.** Any sim whose section labels, section
  order, member order or ungrouped remainder differ between the before and
  after snapshot fails the stage, including sims not named in the table
  (they must be unaffected).
- Do not change `VIEW_PARAM_KEYS` or the view section; do not change
  `logistic-mandelbrot`, `markus-lyapunov`, `clifford-dejong`,
  `swarmalators`, `cyclic-ca`, `abelian-sandpile`, `brians-brain`,
  `elementary-cellular-automata` or `fractal` beyond what the snapshot
  proves is already schema-driven (they should need no edit).
- Descriptor defaults are frozen. The kernel tests guard many of them; a
  default that moves is a failure whether or not a test catches it.
- Do not touch `src/sims/logistic-mandelbrot/gpu-parity.test.cjs` or any
  frozen `AUTOMETTA-CONTRACT` block.
- No browser, no screenshots. This card is provable from the compiled
  schema alone; a Codex seat cannot open Chromium on this machine and does
  not need to.
- Do not commit anything under `public/baked/`.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the
stage.

1. `npm run verify` green in the run worktree (after `npm ci`).
2. `scripts/check-contract-test-gate.sh --worktree` run and its exit code and
   message reported verbatim in the envelope, with one sentence saying which
   of its three outcomes it was and why that is correct for this card.
3. `grep -n PARAM_GROUPS src/app/simView.ts src/app/controls.ts` returns
   nothing, and `paramGroups` no longer appears in `ControlsPanel`'s options
   type.
4. The verifier regenerates the before snapshot independently: check out
   `dev` (the base) into a scratch worktree, copy in only
   `scripts/param-groups-snapshot.cjs`, run `npm run build:test` and the
   script, and diff its output against the committed
   `docs/audits/2026-09-12-param-groups-before.json`. Empty diff. Then run
   the script in the run worktree and diff against the same file. Empty
   diff. Both commands and outputs in the verdict.
5. Every sim registered in `src/app/registry.ts` appears in the snapshot,
   and for every sim named in the deleted table the snapshot shows at least
   one section (so the derivation did not silently collapse a sim to
   "ungrouped only").
6. No `ParamDescriptor` in any kernel changed `default`, `min`, `max`,
   `step`, `options` or `info`: the verifier checks with a diff of the
   compiled schemas restricted to those fields, or by reading the kernel
   diffs, and says which.
7. `src/app/paramGroups.test.cjs` exists, is picked up by `npm test`, and
   fails when the verifier temporarily removes one `group` field from any
   kernel in the run worktree (then restores it).
8. The envelope carries the Astra scorecard block described under Dispatch
   envelope.

## Contract test

- **Test file:** None
- **Assertions digest:** None

The committed before snapshot plus criterion 4's independent regeneration is
the frozen reference for this card. A digest-gated block would freeze the
test's derivation code, and the derivation is the thing the worker writes.

## Out of scope

- Any change to what renders. If the operator wants the schema's original
  labels ("Flocking rules") back, that is a follow-on card with a visual
  review; this card preserves today's panel exactly.
- New groups for sims the table never covered.
- The trailing "Parameters" section's label or placement.
- `docs/INTERFACE.md` version bump.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 60 minutes
- **Token baseline:** worker 6.0M, verifier 3.0M. Sixteen kernel files is
  wide but each edit is mechanical once the snapshot exists. Above 10.0M on
  the worker, stop and report what is landed with the snapshot diff as it
  stands.

## Escalation

If the schema's "first-appearance order" rule cannot reproduce some sim's
table order without reordering descriptors in a way a kernel test forbids,
stop on that sim: leave it out of the change, keep its table-free rendering
different, and say so in the envelope with the exact conflict. A partial
consolidation honestly reported is a pass on the audit and a fail on
criterion 4, and the operator wants to see which sim it was.

## Dispatch envelope

Return an envelope recording, for each acceptance criterion, whether it
passed and the evidence: the command run and its verbatim exit code and
output, or the committed path. Include the list of kernel test assertions
changed (deliverable 7) and the diff command for criterion 4 with its empty
output.

Then an **Astra scorecard** block, which the operator reads separately from
the verdict:

- deliverables landed on this attempt, numbered against the list above
- tokens used, worker total
- anything the card asked for that the Codex sandbox prevented (file it
  could not write, command it could not run), or "none"
- one sentence on where the card's brief was wrong or under-specified, if
  anywhere

## Verifier handoff

Regenerate the before snapshot yourself (criterion 4) before reading the
worker's audit or envelope; the committed reference is the worker's claim
until you have reproduced it from `dev`.

Two failures to catch.

The first is a snapshot script that is not actually table-independent: one
that, on the after side, quietly falls back to a copy of the old table kept
somewhere (a fixture, a constant in the test). Read the script and the test
for any literal section label; the only labels should be in kernel files.

The second is order parity by coincidence. Schema-native grouping orders
sections by the first descriptor that carries each label. A worker that adds
`group` fields without reordering descriptors will match the table for sims
whose schema order happened to agree, and silently reorder the others. The
JSON diff catches this only if the snapshot preserves section order as an
array; confirm it does before trusting an empty diff.

## Family-specific notes

Codex family: the run worktree has no `node_modules`; run `npm ci` first or
`npm run verify` exits 127. `npm run build:test` compiles the sources to
`.test-build/`, which is where both the snapshot script and the new test
must require kernels from, following `src/app/qualityProfiles.test.cjs`. No
network and no GUI are needed; do not attempt a browser.
