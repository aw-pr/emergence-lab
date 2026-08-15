# Stage card 39a-param-info-ca-lattice: info text and grouping, CA and lattice sims

## Metadata

- **Authored:** 2026-08-15
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** Content authoring against working machinery —
  Sonnet on both sides. The verifier still needs a browser because the only
  honest check of an info text is reading it next to the control it
  describes while dragging that control.
- **Verifier transport:** cli.

## Depends on

Stage 38 completed (the ⓘ popup and grouping machinery, plus the
logistic-mandelbrot worked example — match its tone and depth). Interface
contract v1.3.0 (`docs/INTERFACE.md`, decision 7) defines the two fields;
do not extend it.

## Objective

Fill `info` for every param and assign `group`s where they help, for these
seven sims: **abelian-sandpile, brians-brain, cyclic-ca,
elementary-cellular-automata, game-of-life, ising-model, lenia.**
While there, audit each slider for relevance and ordering.

## Deliverables

1. `info` on every `ParamDescriptor` in the seven kernels' `paramSchema`:
   one or two plain sentences — what the control does, what visibly changes,
   and any rebuild/reset cost. Write for a curious visitor, not a
   simulationist; name the visible effect before the mechanism.
2. `group` assignments where three or more params form a natural cluster
   (e.g. rule/dynamics vs appearance vs performance); schema reordered so
   related params are adjacent. Sims with few params may legitimately stay
   ungrouped — do not force it.
3. **Relevance audit, reported not enacted:** for each sim, list in your
   handoff any control that does nothing observable, duplicates another, or
   has a range where most of the travel is dead. Do not delete or change any
   param's behaviour, key, default, or range — flag only.

## Constraints

- Schema literals only: `info`, `group`, and ordering within `paramSchema`.
  No changes to kernel logic, defaults, ranges, keys, or `src/app/**`.
- Reordering must not change behaviour: params are looked up by key.
  Confirm each sim still initialises and runs identically.
- British English, no em dashes, no filler ("simply", "just", "powerful").

## Acceptance criteria

1. `npm run verify` green.
2. In the browser, every control in all seven sims shows a popup whose text
   is accurate — spot-verify at least two claims per sim by dragging the
   control and watching the described effect happen.
3. Grouping renders correctly and reads sensibly; no sim lost or gained a
   control.
4. Each sim's diff touches only `paramSchema` literals — confirm by reading
   the diff.
5. The relevance audit in the handoff covers all seven sims, even if the
   finding is "all relevant".

## Contract test

- **Test file:** None; stage 36's frozen harness stands.
- **Assertions digest:** None

## Out of scope

- The other fifteen sims (stages 38, 39b, 39c). Kernel behaviour. Deleting
  or altering params. Any push or merge work.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 40 minutes

## Verifier handoff

Worker reports: per-sim summary of groups chosen (or why none), the
relevance-audit findings, and which two claims per sim it verified by eye.

## Family-specific notes

Claude worker and verifier: GUI available; use it. Dev servers on 5175+ with
`--strictPort`; never reuse 5173/5174/5178.

## Round 2 re-brief (2026-08-15)

Round 1's schema work is complete and committed at **`c5c1c94`** — all seven
sims, verify green, diffs confirmed schema-only. The worker correctly noted
it had no browser tooling and marked its envelope "partial", which the loop
reads as failure. Clarification of roles: the worker's obligation on
criterion 2 is the code-trace cross-check round 1 already performed; the
browser spot-check belongs to the verifier, who has GUI. Round 2: start from
`c5c1c94`, re-confirm verify is green, and write a **status "pass"** envelope
noting the browser check is delegated to the verifier per this re-brief. Do
not redo the schema work.
