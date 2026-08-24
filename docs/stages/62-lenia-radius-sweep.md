# Stage card 62-lenia-radius-sweep: search the radius axis Geminium storm pointed at

## Metadata

- **Authored:** 2026-08-24
- **Orchestrator:** Claude Fable 5 <claude-fable-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Base branch:** dev
- **Run branch:** autometta/62-lenia-radius-sweep
- **Worker effort:** medium
- **Verifier effort:** medium
- **Requires GUI:** true
- **Verifier panel:** false
- **Pairing rationale:** same shape as stages 60–61 — follow-up sweep on the
  existing harness, Codex worker, Claude verifier. Worker drives Playwright,
  hence Requires GUI.

## Objective

The 2026-08-23 Lenia sweep (`docs/sweeps/lenia-interestingness.md`) found no
μ/σ candidate beat the incumbent "Geminium storm" (0.414 vs best swept 0.369),
and attributed the incumbent's win to `radius: 10` — held at 8 for every swept
set — with the explicit conclusion that radius "is the axis most likely to hold
an unfound regime". This card sweeps it.

## Inputs (read these in your own context)

- `docs/sweeps/lenia-interestingness.md`
- `e2e/harness/sims.ts` (`LENIA`), `e2e/sweep.spec.ts`
- `src/app/presets.ts` (the three Lenia presets)
- `src/sims/lenia/kernel.ts` (the radius cost note only)

Do not read anything else unless you need to; keep your context lean.

## Deliverables

1. A sweep pass with axes `radius ∈ {6, 8, 10, 12, 14}` × μ/σ at the three
   strongest pairs from the 2026-08-23 run — (0.24, 0.028), (0.212, 0.028),
   and Geminium storm's own μ/σ — 15 sets, other settings identical to the
   2026-08-23 `LENIA` config (260 warmup, muDrift 0.015). Radius is the cost
   driver; if radius 14 at 128² exceeds the harness timeout, record the sets
   dropped and why rather than silently truncating.
2. A dated appendix in `docs/sweeps/lenia-interestingness.md` with the ranked
   table and a reading of how radius moves score, flux, and organism scale.
3. `src/app/presets.ts` — promote a preset only if a swept set beats Geminium
   storm (0.414) by more than 5% on the composite. If the winner is a
   different character rather than a better version of an incumbent, promote
   nothing and record it as a fourth-preset candidate per Escalation.

## Constraints

- Metric stack unchanged; scores comparable with the 2026-08-23 run.
- Headless only; unattended.
- References re-scored in the same run so the comparison is like-for-like.

## Acceptance criteria

1. `npm run verify` green.
2. The radius sweep completes headless; the appendix records every set
   evaluated and any dropped for time, with counts.
3. Re-running one recorded set reproduces its four metric scores exactly.
4. Either a promotion carrying its delta comment and >5% margin over 0.414,
   or a recorded no-promotion reading with the best candidate's numbers.

## Contract test

- **Test file:** None
- **Assertions digest:** None

## Out of scope

- μ/σ re-search beyond the three named pairs; `dt`/`stepsPerFrame`/`muDrift`;
  kernel changes; metric changes; merging; deploys.

## Budget

- **Worker wall-clock:** 120 minutes
- **Verifier wall-clock:** 30 minutes

## Escalation

A winner with a new visual character (rather than a sharper version of an
incumbent) is a fourth-preset candidate: record incumbent and candidate with
their metric deltas, promote nothing, and let the operator pick — same clause
as the Physarum escalation in the 2026-08-23 run.

## Verifier handoff

Re-run `npm run verify` and the radius sweep; confirm reproduction of one set,
the evaluated/dropped counts, and the >5% margin if a promotion landed. Judge
numbers only.
