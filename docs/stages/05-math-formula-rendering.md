# Stage card math-formula-rendering: Render mathematical formulas on sim pages

## Metadata

- **Authored:** 2026-05-26
- **Orchestrator:** Claude Opus 4.7 <claude-opus-4-7@local>
- **Worker:** Codex GPT-5.3 <codex-gpt-5-3@local>
- **Verifier:** Claude Sonnet 4.6 <claude-sonnet-4-6@local>
- **Pairing rationale:** Cross-family. New external dep (KaTeX) plus per-sim content; Claude verifier confirms publishing-safe choice of library and bundle-size impact.

## Objective

Add LaTeX-rendered formulas to the sim pages where a formula is the natural way to communicate the underlying mathematics. Use KaTeX (not MathJax — smaller, faster, render-only). Place each formula in a compact panel under the sim's title or in a collapsible "About this simulation" section. The formula appears on the sim page itself (not just in `essays/`).

Initial coverage (the worker may add more if obvious, but at minimum these):

- **Gray-Scott**: the reaction-diffusion PDE system for U and V.
- **Mandelbrot**: $z_{n+1} = z_n^2 + c$, escape condition $|z_n| > 2$.
- **Julia set**: $z_{n+1} = z_n^2 + c$ with $c$ fixed.
- **Burning Ship**: $z_{n+1} = (|\Re(z_n)| + i|\Im(z_n)|)^2 + c$.
- **Lorenz attractor**: the three ODEs.

For other sims (Boids, DLA, sandpile, BZ, Brian's Brain, GoL, ECA) the underlying mathematics is rule-based rather than formula-based; the worker may skip them or add a brief rule statement instead — worker's call.

## Inputs (read these in your own context)

- `src/app/simView.ts`
- `src/app/main.ts`
- `src/app/styles.css`
- `package.json`
- The kernels listed in the objective (to confirm parameter names and equations match what the kernel actually implements)
- `docs/INTERFACE.md` (read-only)

Do not read anything else unless you need to.

## Deliverables

All files listed here must be created or modified. Paths are relative to repo root.

1. `package.json` and `package-lock.json` — add `katex` as a runtime dependency.
2. `src/app/simView.ts` — render formulas where present (via a small helper that calls `katex.render` or `katex.renderToString`).
3. `src/app/styles.css` — minimal styling for the formula panel.
4. A small per-sim data file or an inline lookup mapping sim slug to a formula string. The worker chooses the structure (object literal in `simView.ts`, or a separate `src/app/formulas.ts`) and justifies it in the commit message.
5. KaTeX CSS — bundled via the dep, imported in `src/app/main.ts` or `styles.css`.

## Constraints

- KaTeX only. No MathJax. No CDN — the dep is bundled.
- Bundle size impact must be reported. Soft cap: KaTeX adds < 80 kB gzipped to the production build. If it exceeds, worker reports it but does not abort.
- No modifications to `docs/INTERFACE.md`.
- No kernel changes — formulas live in the renderer/UI layer, not in the kernel.
- `npm run verify` passes. Atomic commit. Author `Codex GPT-5.3 <codex-gpt-5-3@local>`.
- No absolute paths in committed content.
- Formula content must be in the kernel's actual notation — the worker verifies the symbols and parameter names against the kernel implementation, not assumed values.

## Acceptance criteria

1. `npm run verify` passes.
2. `docs/INTERFACE.md` is unchanged.
3. No files under `src/sims/**` are modified.
4. `katex` appears in `package.json` `dependencies`.
5. Visiting `/#/gray-scott`, `/#/mandelbrot`, `/#/julia-set`, `/#/burning-ship`, `/#/lorenz-attractor` each shows at least one KaTeX-rendered formula (worker confirms by visual inspection or by grepping rendered DOM for `.katex` class).
6. Production build gzip size impact is reported (worker measures with `du` or build output).
7. No files outside the deliverables set are modified — except this stage card itself.

## Out of scope

- Server-side rendering of formulas.
- Adding formulas to essays under `essays/` (the worker may, but it is not required and not gated).
- LaTeX support in user-editable controls (e.g. typing a formula into a slider label).
- A toggle to hide/show formulas.

## Budget

- **Worker wall-clock:** 60 minutes
- **Verifier wall-clock:** 15 minutes

## Verifier handoff

Worker returns:

- KaTeX version added.
- Bundle size delta (gzipped production build before/after).
- Which sims got formulas and the formula strings used.
- Confirmation `npm run verify` is green.

## Family-specific notes

- Codex worker: `</dev/null` stdin redirect.
- Claude verifier: cross-family. The verifier should pay attention to the mathematical content — the formulas must match the kernel, not just be syntactically valid LaTeX.
