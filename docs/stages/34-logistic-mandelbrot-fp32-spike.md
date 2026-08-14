# Stage card 34-logistic-mandelbrot-fp32-spike: measure what fp32 costs the orbit sampler

## Metadata

- **Authored:** 2026-08-14
- **Orchestrator:** Claude Opus 5 <claude-opus-5@local>
- **Worker:** GPT-5.6 Sol <gpt-5-6-sol@local>
- **Verifier:** Claude Opus 5 <claude-opus-5@local>
- **Worker effort:** high
<!-- Verifier effort intentionally unset: autometta delivers `--effort high`
     as a single argv element and the Claude CLI rejects it. See autometta card
     30-effort-flags-ifs-wordsplit. Restore once that lands. -->
- **Verifier panel:** false
- **Pairing rationale:** This is a measurement stage whose output is a number
  that two later stages hard-code as their acceptance tolerance. A wrong number
  here poisons both. Sol builds because the work is numerical and mechanical
  once the method is fixed; the Claude verifier's job is the harder one — to
  judge whether the *method* actually models GPU fp32, not merely whether the
  script runs. That is a methodology judgement, so it goes cross-family and at
  high effort. No GUI is needed on either side: see the emulation note below,
  which is the whole reason this stage exists separately from stage 35.

## Objective

Decide whether the orbit sampler can move to a WebGL2 fragment shader at all,
by measuring how much single-precision arithmetic degrades it against the
existing double-precision CPU sampler. Produce the tolerance numbers that
stages 35 and 36 will use as acceptance criteria, and a clear go / no-go /
go-with-mitigation recommendation.

This stage writes a throwaway measurement script and a findings document. It
changes no shipping code.

## Background you need

The sim's name is misleading and has already misled once. The orbit iterated
here is the **complex quadratic map `z -> z^2 + c`** (`model.ts:154-158`), the
ordinary Mandelbrot recurrence — *not* the real logistic map `x -> rx(1-x)`.
The "logistic" in the name refers to what the reveal *plots*: the attractor
samples of that complex orbit, laid out so the period-doubling cascade reads
like a logistic bifurcation diagram. Implement and measure `z^2 + c`.

## Inputs (read these in your own context)

- src/sims/logistic-mandelbrot/model.ts — the whole file, but especially
  `sampleAttractorCell` (line 130), `estimatePeriod` (line 97), and the
  constants block at lines 17-48
- src/sims/logistic-mandelbrot/kernel.ts — lines 40-70 only, for the default
  warmup / sample counts actually used in production
- scripts/bake-orbit3d.mjs — lines 1-60 only, for how the pure sampler is
  reused headlessly from Node via `.test-build/`

Do not read anything else unless you need to; keep your context lean.

## The emulation approach, and its limits

You cannot run a GPU shader: your role is sandboxed. You do not need to.
Emulate fp32 in Node with `Math.fround` around every arithmetic result, and
compare against the same orbit computed in ordinary fp64. `npm run build:test`
compiles the pure sampler to `.test-build/`, which is how `bake-orbit3d.mjs`
already consumes it headlessly — reuse that path.

**State this limitation prominently in your findings, because it bounds every
conclusion you draw.** A `Math.fround` model is a *lower bound* on GPU error,
not an estimate of it. Real GLSL `highp` may differ in at least three ways:
it may contract `a*b+c` into a fused multiply-add with a single rounding
(reducing error), it may flush denormals to zero (increasing it), and `highp`
is a minimum guarantee rather than an exact format, so precision varies by
driver. Do not present emulated figures as if they were measured GPU figures.

## The trap: the convergence tolerance is fp64-shaped

`sampleAttractorCell` has a Brent-style early exit that breaks out of warmup
when the orbit revisits a checkpoint within `CONVERGENCE_TOLERANCE_SQ = 1e-18`
(`model.ts:47`, `model.ts:165`). That is a *squared* distance, so a separation
of 1e-9.

fp32 cannot represent that. Near magnitude 1 the fp32 spacing is about 1.2e-7,
so the squared delta between two distinct fp32 values is either exactly 0 or at
least ~1.4e-14 — never below 1e-18. **In fp32 this convergence test degenerates
into a test for exact bitwise equality.** Orbits that settle onto an exact
fixed-point representation will still trip it; orbits approaching a cycle
asymptotically, which is the common case, never will.

Quantify this rather than assuming its consequences. It has two separate
effects and you should measure both:

1. **Cost.** How many cells lose their early exit and run the full warmup?
   This directly undercuts the naive speedup estimate for stage 35, because
   GPU lanes execute in lockstep and a divergent early-exit saves nothing
   unless a whole warp exits together.
2. **Correctness.** Does running the full warmup instead of exiting early
   change the sampled orbit, the detected period, or the interior measure?

`PERIOD_TOLERANCE = 1e-4` (`model.ts:39`) is a different matter and is
comfortably inside fp32 range. Confirm that rather than assuming it.

## Deliverables

1. `scripts/spike-fp32-orbit.mjs` — a throwaway measurement script, marked as
   such in its header comment. It must sample a defensible spread of the
   c-plane (not a handful of hand-picked points): include cells drawn from
   cardioid interior, period-2 and period-4 bulbs, the chaotic band, and
   crucially a dense band along bulb *boundaries*, since boundaries are where
   the operator's visual review will actually look. State your cell counts.
   Run at the production defaults from `kernel.ts` (warmup 1500, 8 samples)
   and at the baker's deeper settings (warmup 20000, 64 samples), because
   stage 36 has to decide whether the GPU path can serve both.
2. `docs/spikes/2026-08-14-fp32-orbit-precision.md` — the findings. Must state,
   with figures:
   - max and 99th-percentile absolute divergence in sampled `zr` values,
     at both settings;
   - the **fraction of cells whose detected period differs** between fp32 and
     fp64 — this is the headline number, because period drives the colouring
     and is what a viewer sees;
   - the same fraction restricted to boundary cells only, which will be worse
     than the global figure and is the one that matters;
   - the early-exit findings from the trap section above;
   - a recommended parity tolerance for stages 35 and 36, expressed as both a
     value tolerance and a maximum acceptable period-mismatch fraction, with
     the reasoning for the numbers you chose;
   - a go / no-go / go-with-mitigation recommendation. If mitigation, name it
     concretely (e.g. fp32 with a compensated summation, split-double
     arithmetic in the shader, a hybrid where boundary cells stay on CPU, or
     retuning the convergence constant for fp32).
3. Add `docs/spikes/` to the repo if it does not exist. No other file changes.

## Constraints

- Do not modify `src/**` at all. This stage measures; it does not change the
  sampler.
- Do not modify `scripts/bake-orbit3d.mjs`. Read it, reuse its pattern.
- No new runtime dependencies. Node built-ins and the existing `.test-build/`
  output only.
- The script must be deterministic and re-runnable: no `Math.random()` without
  a seeded generator, and state the seed in the findings.
- Do not attempt to launch a browser, Playwright, or any GPU context. Your
  sandbox will abort it and the attempt wastes your wall-clock budget.
- Report honestly. A no-go recommendation is a completely acceptable outcome of
  this stage and is worth more than an optimistic one. Stage 35 is contingent
  on this result, not entitled to it.

## Acceptance criteria

The verifier will check each of these. Failure of any one is a failure of the stage.

1. `npm run verify` green (typecheck + kernel tests + production build).
2. Diff confined to `scripts/spike-fp32-orbit.mjs` and
   `docs/spikes/2026-08-14-fp32-orbit-precision.md`. `src/**` unchanged —
   confirm by diff, explicitly.
3. The script runs to completion from a clean checkout following only the
   commands stated in its header, and reproduces the figures in the findings
   document. Run it; do not take the document's word for it.
4. The script iterates `z^2 + c`, matching `model.ts:154-158`. A real-logistic
   `rx(1-x)` implementation is an automatic fail — it would measure the wrong
   map entirely.
5. The fp32 emulation is faithful: `Math.fround` is applied to every
   intermediate arithmetic result, not merely to the final stored sample.
   Check the inner loop line by line. A single unrounded intermediate makes
   every figure in the document optimistic.
6. The findings document states the `Math.fround`-is-a-lower-bound limitation
   explicitly, including the FMA and denormal caveats.
7. The convergence-tolerance trap is addressed with measured numbers for both
   the cost and the correctness effects, not asserted from theory.
8. Cell sampling genuinely covers the boundary band, and the boundary-only
   period-mismatch figure is reported separately from the global one.
9. The recommended tolerances are justified, not asserted. A number with no
   reasoning attached is a fail — stages 35 and 36 inherit these as acceptance
   thresholds and cannot re-derive them.

## Contract test

- **Test file:** None. This is a throwaway measurement stage.
- **Assertions digest:** None

## Out of scope

- Any change to the sampler, the kernel, `orbit3d.ts`, or the renderer.
- Writing any GLSL. Stage 35 does that, and only if this stage says go.
- The prebaked ELPC path and the baker.
- Markus–Lyapunov, which is a separate future stage set.
- Any push, publish-branch, or merge work.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 40 minutes

## Verifier handoff

Worker reports: the sampling strategy and cell counts per region; the headline
period-mismatch fractions, global and boundary-only, at both settings; what the
convergence-tolerance degeneracy did to both cost and correctness; the
recommended tolerances with reasoning; the go/no-go call; and an explicit
statement of what the `Math.fround` model does not capture.

## Family-specific notes

Codex worker: stdin is redirected from `/dev/null` by the dispatch wrapper.
Do not declare `Requires GUI` for this stage — it is deliberately designed to
need no window server, and granting it would hand the role full machine access
for no benefit.
