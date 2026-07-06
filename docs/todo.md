- [x] Set the default boids rersolution to ultra and see if we can reandomise the start criteria so we get different patterns and increase the number of boids to 10000
- [x] can we try and increase the pixel desnsity in garry scott diffusion so we can fit more intricate patterns on the screen?

## 2026-07-04 — overnight build (Claude Sonnet 4.6)

- Gallery landing redesigned: responsive grid grouped by `family`, each card
  with a real still preview rendered from the sim's own kernel via the
  existing WebGL2/Canvas2D renderer backends (`src/app/thumbnail.ts`), lazily
  painted with IntersectionObserver and degrading to the text-only card on
  failure. Hash-route navigation and existing copy untouched.
  (`src/app/gallery.ts`, `src/app/styles.css`, `src/app/thumbnail.ts`)
- Scaffolded all 12 `essays/<slug>.md` files (frontmatter + What it is / The
  rule / Why it's interesting / Parameters to try / Further reading), drafted
  from the registry's subtitle/description.
- `npm run verify` green (types, 119 kernel tests, build); `npm run dev`
  compiles and serves cleanly.
- Queued (post-exam, optional): Fable-generated hero visuals to replace live
  thumbnails + an essay polish pass.

## 2026-07-06 — visual expansion (multi-agent, Claude Fable 5 lead)

Branch `feat/visual-expansion` (35 commits off dev, verify green: 200 kernel
tests, typecheck, build). Parallel Opus/Sonnet worktree agents, merged
sequentially with verify per merge.

- Four new sims: **physarum** (Stigmergy), **lenia** (continuous CA, perf-tier
  default, ~27ms/step at 384²), **cyclic-ca** (twilight cyclic palette),
  **particle-life** (seeded asymmetric matrix, 3-channel species RGB). Each
  with presets, kernel tests, essay stub.
- Renderer/colour foundation: per-slug colormap defaults now win over the
  ≥3-channel rgb fallback (fixes BZ rendering raw RGB — dead-code bug);
  3-channel chemical blend for BZ; magma/turbo/twilight(cyclic) ramps in CPU
  + GLSL; seamless cyclic palette cycling; stepped quantisation (sandpile
  terraces = 5 bands); particle-mode trail persistence (boids default 0.93);
  bloom post-pass (lorenz/boids/fractals default 0.3); render options
  persisted in `el:render` store.
- Kernel visual upgrades: DLA colour-by-accretion-age; game-of-life age
  shading + death-ghost trails; lorenz-attractor generalised to strange
  attractors (Rössler/Thomas/Aizawa/Halvorsen) with height-coloured trails.
- **INTERFACE.md v1.1.0**: optional `applyImpulse(x, y, radius, strength)` —
  pointer drag perturbs gray-scott, BZ, game-of-life, sandpile, boids,
  physarum, lenia. Renderer owns px→cell mapping via shared containRect.
- Known follow-ups: WebGL2 samples row 0 at bottom vs canvas2d top (latent
  flip, compensated in pointerToCell — normalise someday); Gray-Scott GPU
  compute path deliberately deferred (inverts the kernel-produces-floats
  seam; needs its own contract decision before code).
