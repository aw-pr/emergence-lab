# Stage card 83-interestingness-structure-term-bias: the term that is 55% of every score rewards blur

## Metadata

- **Authored:** 2026-09-06
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Base branch:** dev
- **Run branch:** autometta/83-interestingness-structure-term-bias
- **Worker effort:** high
- **Verifier effort:** high
- **Verifier panel:** false
- **Path claims:** docs/audits/2026-09-07-interestingness-structure-bias.md
- **Pairing rationale:** cross-family, and both seats at high effort because
  the finding under audit is a reasoning claim, not a measurement. The worker
  must argue a case about a metric's construction across nine write-ups; the
  verifier's job is to try to break that argument, which needs the same tier.
- **Type:** Audit. No code change, no metric change.

## Surfacing concern

The composite is `coverageFactor * (0.55*structure + 0.45*detail) * liveliness`
(`e2e/harness/metrics.ts:353`), where `structure` is lag-1 spatial
autocorrelation. Blurring a field raises its lag-1 autocorrelation. So the
term carrying the largest single weight in every interestingness score rewards
exactly the smoothing that the Belousov-Zhabotinsky parameter note calls
blur — and stage 81 found a score that ramps monotonically to the edge of a
slider, carried almost entirely by that term, and refused to promote on it.

If that bias is real, it is not confined to BZ. Nine sweep write-ups in
`docs/sweeps/` rank presets by this composite, and promotions have been made
on it.

## Inputs (read these in your own context)

- `e2e/harness/metrics.ts` — the composite, the structure term, and the
  comment block at lines 325-340 stating the design intent
- `e2e/harness/sims.ts` — the note at line 668 on the structure term being 55%
  of the composite
- `docs/sweeps/belousov-zhabotinsky-interestingness.md` — the 2026-09-06
  appendix, which is the case that prompted this
- The other eight files in `docs/sweeps/` — the ranking tables and any
  promotion sections. You do not need their prose in full; you need the
  rankings and what was promoted.

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A dated audit under `docs/audits/` stating whether the structure term's
   preference for smoothness is a defect, a deliberate tradeoff, or
   circumstantial — argued from the metric's construction, not asserted.
2. A table of every promotion made on this composite across the nine sweeps,
   with the margin that justified it and whether that margin survives if the
   structure term is discounted. Show the arithmetic; do not re-run sweeps.
3. A named test that would distinguish "the metric rewards blur" from "blurred
   fields are genuinely more coherent": what you would measure, on what, and
   what result would settle it. This is the design for a future card, not work
   to do here.
4. An explicit verdict: does any shipped promotion need revisiting, and which.

## Constraints

- No change to `e2e/harness/metrics.ts` or any weight, threshold or term.
  A metric change is its own card with its own re-baseline of nine sweeps.
- No sweep runs. Every number in the audit comes from a write-up already on
  `dev`, cited by file and section.
- No preset changes.
- If a write-up's numbers do not support a claim you want to make, say the
  evidence is absent rather than generating it.

## Acceptance criteria

1. `npm run verify` green (nothing should have changed, so this is a check that
   nothing did).
2. The contract-test guard passes on the staged change set, invoked with the
   test file named explicitly.
3. The audit takes a position in its first paragraph — defect, tradeoff, or
   circumstantial — and the rest of the document supports that position.
4. Every promotion across the nine sweeps appears in the table, or the audit
   states which sweeps made none.
5. Every number cited is traceable to a file and section already on `dev`.
6. The distinguishing test in deliverable 3 is specific enough that a later
   card could be written from it without further design.

## Contract test

- **Test file:** none.

This card stages one document and changes no code, so no frozen block is in
its claims. Criterion 2 is satisfied by the gate running over your staged set
and reporting no violation.

## Out of scope

- Fixing the metric.
- Re-running any sweep.
- Re-scoring or un-promoting any preset. This card produces the case; the
  operator decides whether a correction card follows.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 45 minutes

## Escalation

If the nine write-ups turn out not to record their promotion margins
consistently enough to build the table, stop and report which ones are missing
what. An incomplete table presented as complete is worse than no table.

## Verifier handoff

Attack the central argument. The claim "high autocorrelation means blur" is
plausible and may still be wrong — a sharp periodic pattern also has high
lag-1 autocorrelation. If the audit does not address that counter-case, it has
not made its argument, however confident the prose sounds.

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

## Re-brief (2026-09-07, attempt 1 FAIL — the card's scope was wrong)

Attempt 1 failed criterion 4 and passed the other five. The failure is the
card's fault before it is the worker's, and the correction belongs here rather
than in an instruction to try harder.

**This card says "nine write-ups" in five places. There are fifteen.**
`docs/sweeps/` holds fifteen `*-interestingness.md` files: abelian-sandpile,
belousov-zhabotinsky, boids, brians-brain, clifford-dejong, cyclic-ca,
diffusion-limited-aggregation, game-of-life, gray-scott, ising-model,
kuramoto-oscillators, lenia, particle-life, physarum, swarmalators. The
orchestrator authored the card from a truncated directory listing and wrote
the wrong number into the Surfacing concern, the Inputs, deliverable 2,
criterion 4 and the Escalation clause. Every one of those now reads
**fifteen**, and the Inputs line "the other eight files" reads **the other
fourteen**.

What the worker did with that is still a defect, and naming it is the point of
this re-brief. It asserted a specific list of nine at :55-60 with no basis
given, never mentioned the six it dropped, and closed at :150-154 by
enumerating which decisions need reopening — presenting the census as complete.
The card was wrong about the count; the directory was not, and it was one `ls`
away. The Escalation clause you were given says exactly this: "An incomplete
table presented as complete is worse than no table." A census whose scope you
cannot justify from the filesystem is the case that clause is about, and the
right move was to stop and report the mismatch.

**Two specific gaps the verifier found, which the new table must close:**

- `docs/sweeps/clifford-dejong-interestingness.md` scores on the same metric
  stack (:14-15) and promotes three shipped presets on it (:38-44): Clifford
  veils 0.481 → 0.740, De Jong web→swan 0.435 → 0.762, De Jong scroll→heart
  0.262 → 0.768, called "The promoted sets" at :48-50. None appear in attempt
  1's table and none are declared absent.
- `docs/sweeps/gray-scott-interestingness.md:73-75` records that the Spots and
  Waves rows use the *promoted* parameters and that the pre-promotion params
  "no longer exist" — a further promotion pair on this composite, neither
  tabulated nor declared absent.

Four of the six dropped write-ups do record "None" (boids:138-140,
kuramoto-oscillators:86-90, swarmalators:82-86, particle-life:77-82), so the
omission was not total. Record those as "none" explicitly rather than by
silence.

**Your starting point is committed.** Attempt 1's audit is preserved at
`df560c52` on `wip/83-interestingness-structure-term-bias-attempt-1`, 154 lines.
The verifier passed its verdict (criterion 3), its arithmetic (criterion 5) and
its distinguishing test (criterion 6) — the phase-scrambled surrogate design at
:96-135 was called specific enough to write a later card from. Build on that
document; do not start over. What it needs is the six missing write-ups folded
into the census and the two promotion records above tabulated.

One thing to carry forward from the verifier's own reading: it accepted the
"deliberate tradeoff" verdict, but the counter-case in the card's Verifier
handoff still stands — a sharp periodic pattern has high lag-1 autocorrelation
too. If the expanded census changes which promotions look fragile, say so
rather than preserving attempt 1's conclusion out of momentum.
