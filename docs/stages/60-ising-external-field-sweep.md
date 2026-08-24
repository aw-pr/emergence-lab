# Stage card 60-ising-external-field-sweep: evidence-based fix for the Positive field preset

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/60-ising-external-field-sweep
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** a narrow, well-specified one-axis sweep on an existing
  harness — mechanical work the Codex seat handles well, cross-checked by a
  Claude verifier. The worker drives Playwright, hence Requires GUI.

## Objective

The 2026-08-23 sweep (`docs/sweeps/ising-model-interestingness.md`) found the
"Positive field" preset (`externalField: 0.35` at T 1.8) saturates 99% of spins
to one state — a flat colour frame, score 0.003. The sweep pinned
`externalField` so it produced no candidate, and its recommended follow-up is
this card: a one-axis pass over `externalField ∈ [0.02, 0.2]` at T 1.8–2.4 to
find the largest bias that still leaves visible domain structure, then fix the
preset on that evidence.

## Inputs (read these in your own context)

- `docs/sweeps/ising-model-interestingness.md`
- `e2e/harness/sims.ts` (`ISING_MODEL`), `e2e/sweep.spec.ts`
- `src/app/presets.ts` (the "Positive field" preset)
- `src/sims/ising-model/kernel.ts` (param names and help text only)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A sweep pass with axes `externalField ∈ {0.02, 0.05, 0.08, 0.11, 0.14,
   0.17, 0.2}` × `temperature ∈ {1.8, 2.1, 2.4}`, coupling 1, seed 7, other
   settings identical to the 2026-08-23 `ISING_MODEL` config so scores are
   comparable. Extend or parameterise the existing config; do not fork the
   harness.
2. A dated appendix in `docs/sweeps/ising-model-interestingness.md` with the
   ranked table and the field/T boundary where the lattice tips to saturation.
3. `src/app/presets.ts` — "Positive field" promoted to the largest
   `externalField` whose set scores ≥ 0.3 with coverage ≤ 0.9 (visible domains
   under a real bias), keeping T within the swept range. Carry the delta
   comment form. The preset must keep a strictly positive `externalField` —
   demonstrating field bias is its identity.

## Constraints

- Metric stack unchanged; scores must be comparable with the 2026-08-23 run.
- Headless only; unattended.
- All 21 sets evaluated and recorded, none silently skipped.

## Acceptance criteria

1. `npm run verify` green.
2. The field sweep completes headless; the appendix records all 21 sets.
3. Re-running the promoted parameter set reproduces its four metric scores
   exactly.
4. The promoted "Positive field" scores ≥ 0.3 with coverage ≤ 0.9 and
   `externalField > 0`.
5. The unchanged Ising presets' reference scores reproduce the 2026-08-23
   values.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- The other three Ising presets (the sweep found them healthy or correctly
  placed).
- Kernel changes; metric changes; merging to `dev`/`main`; deploys.

## Budget

- **Worker wall-clock:** 90 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

If no swept set meets the ≥ 0.3 / ≤ 0.9 gate, promote nothing: record the best
candidate and the incumbent in the appendix and state that the preset cannot be
fixed inside this field range — the operator then decides between a wider range
or retiring the preset.

## Verifier handoff

Re-run `npm run verify` and the field sweep; confirm reproduction of the
promoted set and the reference scores, and that the appendix records 21 sets.
Judge numbers only.
