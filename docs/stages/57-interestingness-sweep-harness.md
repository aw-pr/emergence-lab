# Stage card 57-interestingness-sweep-harness: tune the sims by measurement, not by eye

## Metadata

- **Authored:** 2026-08-23
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** Codex GPT-5.6 Terra <codex-gpt-5-6-terra@local>
- **Verifier:** Claude Sonnet 5 <claude-sonnet-5@local>
- **Worker effort:** high
- **Verifier effort:** medium
- **Verifier panel:** false
- **Pairing rationale:** the harness and its metrics are well-specified
  TypeScript, which is Terra's strength and bills the Codex pool rather than
  the Claude subscription. The verifier is Sonnet 5 rather than the usual
  Fable: Fable quota is the scarce one this week (~20% remaining against ~45%
  on the general pool), and the gate here is numeric — metric deltas and a
  green `npm run verify` — so it does not need the aesthetic tier. The one
  genuinely aesthetic judgement, whether a promoted preset is *actually* more
  interesting, is escalated to the operator rather than decided by the
  verifier. See "Escalation" below.

## Objective

Tune the simulation models so the emergent behaviour is more interesting, and
build the harness that makes that a measurement rather than an opinion: a
Playwright-driven parameter sweep that captures frames and scores them.

Sourced from `token-maxing/kickoffs/emergence-interestingness-sweep.md`, which
this card supersedes as the dispatchable form.

## The work

1. **Add Playwright.** `npm i -D @playwright/test && npx playwright install`.
   New `e2e/` suite. It must run headless — see the constraint below.
2. **Build the sweep harness.** Drive the Vite dev server (`npm run dev`,
   `localhost:5173`, hash routes such as `/#/gray-scott`), inject parameter
   sets programmatically, capture frames (`canvas.toDataURL` or WebGL
   `readPixels`), and score each set on four interestingness metrics:
   - frame entropy (intensity variance),
   - spatial autocorrelation (pattern coherence),
   - temporal flux (frame-to-frame difference),
   - non-background coverage.
3. **Search the parameter surface.** Start with **Gray-Scott** F/k, the richest
   regime selector (`src/sims/gray-scott/kernel.ts`), then Boids
   (visualRadius / separation / wander) and Lorenz (rho / sigma / fade).
   Promote winning regimes into `src/app/presets.ts` with the metric delta
   recorded alongside each.
4. **Pay the owed live-browser smoke.** DLA fill ~0.25, sandpile on Ultra,
   boids 5k–12k flocking feel.

## Notes on the codebase

- All 12 kernels live under `src/sims/<name>/kernel.ts`; each exposes a
  `paramSchema` that the renderer turns into controls automatically.
- The compute grid is decoupled from the display canvas (quality presets set
  cell counts); resizing the window does not reseed a sim.
- Kernels are pure deterministic numerics — same params plus same step count
  gives identical state. That determinism is what makes the sweep
  reproducible, and any metric that is not reproducible across two runs of the
  same parameter set is a harness bug, not a property of the sim.

## Constraints

- **Headless only.** Per `templates/` policy (autometta `7c7f22b`, verifier
  browser checks must run headless), the suite must not require a visible
  browser. This card runs unattended inside the overnight window with the lid
  closed; anything needing a display will produce nothing.
- **Unattended.** No step may wait on operator input. Where a judgement is
  needed, record it and continue — see Escalation.
- **Budget.** `emergence-lab` holds a 100M token window cap and has spent
  ~5.9M today. The sweep is the heavy part: cap the search at a documented
  number of parameter sets per sim rather than running an open grid, and log
  how many were evaluated and how many were skipped. A silent truncation that
  reads as full coverage is worse than a smaller sweep that says so.

## Escalation

The verifier decides the numeric gate only. Where the sweep's top-scoring
regime is a judgement call — the metrics rank it highest but it may not
actually look better — the worker writes both the incumbent and the candidate
into the promotion notes with their metric deltas and leaves the incumbent in
place. The operator picks. Do not let a metric silently replace a preset that
a human chose.

## Gate

1. `npm run verify` green: 118 kernel tests, types, production build.
2. The Playwright suite runs headless, start to finish, with no display.
3. Re-running one parameter set reproduces its four metric scores exactly.
4. At least one sim has a promoted preset with the metric delta written down.
5. The owed live-browser smoke is recorded: DLA fill ~0.25, sandpile on Ultra,
   boids 5k–12k.
6. The sweep reports parameter sets evaluated and skipped per sim.

## Notes for the worker

- Netlify deploys from `origin/main`, so nothing here is live until merged.
  Work on the run worktree as usual; do not push to `main`.
- Stages 15 (`boids-density-motion-tuning`) and 16 (`sandpile-larger-slower`)
  are recorded `verifier_failed` and `stalled` respectively and touch the same
  boids and sandpile parameters. Read their verifier artefacts under
  `state/verifiers/` before tuning either, so this sweep does not re-promote a
  regime that already failed a browser check.
