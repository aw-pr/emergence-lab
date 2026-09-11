# Stage card 84-gray-scott-sub-unit-timestep: the last discretisation route to the glider regime

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Luna <codex-gpt-5-6-luna@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/84-gray-scott-sub-unit-timestep
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Path claims:** src/sims/gray-scott/kernel.ts, src/sims/gray-scott/kernel.test.cjs, docs/sweeps/gray-scott-interestingness.md
- **Pairing rationale:** cross-family. A kernel change to a shipped simulation
  with six presets that must reproduce exactly — the verifier's job is to prove
  nothing moved, which is arithmetic on recorded scores, and to judge whether a
  negative result was reached honestly or by not looking hard enough.
- **Type:** Kernel capability, gated on reproduction. Possibly a negative result.
- **Serialises with:** card 85. Both claim
  `docs/sweeps/gray-scott-interestingness.md` and the Gray-Scott kernel; run 84
  first, 85 against its landed result.

## Surfacing concern

Stage 76 tested whether a nine-point Laplacian stencil could reach the U-skate
travelling-glider regime. The answer was no, and it recorded why: "It remains
the only discretisation route to the regime, and it is a kernel change with its
own cost and re-baseline, not a preset change" — referring to a sub-unit
timestep, which stage 76's card named as its fallback and which stage 76
deliberately did not build.

That is the last route. Either a sub-unit timestep reaches the regime or the
regime is not reachable in this kernel, and the U-skate question closes.

## Inputs (read these in your own context)

- `docs/sweeps/gray-scott-interestingness.md` — the appendices "U-skate gliders
  retired — 2026-09-02" and "the nine-point stencil does not reach the glider
  regime — 2026-09-03", in full, including the six-preset table at the end
- `src/sims/gray-scott/kernel.ts` — the step loop, the stencil switch stage 76
  added, and how `stepsPerFrame` interacts with the update
- `src/sims/gray-scott/kernel.test.cjs` — what is currently asserted

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A sub-unit timestep in the Gray-Scott kernel: `dt < 1` with a compensating
   substep count, off by default, selectable the way stage 76's stencil is
   selectable. Shipped behaviour at the default is bit-identical, and a test
   asserts that.
2. A probe of the U-skate regime under the new timestep, over stage 73's F/k
   box and the canonical pair, at the dt values you judge worth trying (state
   how many and why before the table). Track whether any structure translates.
3. A dated appendix: what was searched, what was found, and a yes-or-no answer
   on the glider regime.
4. The six shipped presets re-scored at the default and compared to the
   recorded five-point column, proving the default path did not move.

## Constraints

- Default off. The default stencil stays five-point and the default timestep
  stays 1. If the shipped presets' scores move at all, the change is wrong.
- No preset change. `src/app/presets.ts` is not in your claims.
- No metric, weight or composite change.
- No change to `e2e/harness/sims.ts` — this probe runs in Node against the
  compiled kernel, as stage 76's did.
- A smaller dt with a proportionally larger substep count is more work per
  frame. State the cost.

## Acceptance criteria

1. `npm run verify` green.
2. The contract-test guard passes on the staged change set, invoked with the
   test file named explicitly.
3. The six presets reproduce their recorded five-point scores to the digit.
   Check this before reading anything else in the appendix.
4. A test asserts bit-identical output at `dt = 1` against the pre-change path.
5. The appendix names every dt tried and why that set, and answers the glider
   question yes or no.
6. If the answer is no, the appendix says what would be left to try, or states
   that nothing is.

## Contract test

- **Test file:** none.

`src/sims/gray-scott/kernel.test.cjs` carries no `AUTOMETTA-CONTRACT` freeze
marker, so there is no digest to declare and the gate has nothing to check in
this card's claims. Do not invent one. Criterion 2 is satisfied by the gate
running over your staged set and reporting no violation. If you believe the
preset-reproduction assertions should be frozen, say so in the appendix as a
recommendation; adding a freeze is its own card.

## Out of scope

- Switching the default stencil. That is card 85.
- Restoring or retuning the U-skate preset, retired at stage 73.
- Any GPU compute path.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the six presets do not reproduce, stop. The default path moved and nothing
downstream in the appendix is comparable to the recorded numbers. Report the
drift and do not run the probe.

## Verifier handoff

Criterion 3 first, from your own run, before you read the probe result. Then
ask the harder question: a negative result is the expected outcome here, and an
agent that expects a negative result can reach one cheaply. Check that the dt
values actually bracket the regime the appendices describe, rather than merely
being small.

## Re-brief (2026-09-07, the contract gate was fixed underneath this card)

This card's acceptance criterion 2 was written against the old gate and its
wording is now wrong. Autometta cards 129 and 134 rewrote
`scripts/check-contract-test-gate.sh`, and the fix was re-vendored into this
repo at `0d4760db`. Criterion 2 is superseded by what follows; nothing else in
the card changes.

**Invoke it as `scripts/check-contract-test-gate.sh --worktree`.** A dispatch
evaluates an unstaged working tree. The bare invocation still means `--staged`
and will find nothing staged; that is the defect stage 79 found, and it is now
loud rather than silent.

**Three outcomes, and all three can be correct.**

- Exit 0 with no warnings: files this gate is responsible for were inspected
  and their frozen blocks match their cards. This is a real pass.
- Exit 2 with `no relevant changed files to inspect in the working tree`: your
  change touches nothing that any card names as a contract test. For a card
  whose claims are a single document this is the *expected* outcome and it
  satisfies criterion 2. Report it in those words. Do not stage extra files to
  make the gate find something, and do not report it as a pass it is not.
- Non-zero with warnings: a real violation. Read the message; it names the
  file, the card, and the two digests.

The gate now inspects only files a card names on a `**Test file:**` line, plus
`scripts/*-smoke.sh`. A file no card names is skipped, so editing a test file
this card does not declare is not a violation.

**Criterion 2 now reads:** run the guard in `--worktree` mode and report its
exit code and message verbatim in your envelope, with one sentence saying
which of the three outcomes above it was and why that is correct for this
card. An exit code cited without which case it was is not evidence — that is
the whole lesson of the defect this replaces.
