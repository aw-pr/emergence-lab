- [x] Set the default boids rersolution to ultra and see if we can reandomise the start criteria so we get different patterns and increase the number of boids to 10000
- [x] can we try and increase the pixel desnsity in garry scott diffusion so we can fit more intricate patterns on the screen?

## 2026-07-06 — release to dev, live deploy, and public mirror (Claude Opus 4.8)

Shipped the completed `feat/visual-expansion` tuning work end to end.

- Two docs-currency commits: README/CLAUDE.md updated from "twelve" to
  "sixteen" kernels and now list physarum/particle-life/cyclic-ca/lenia;
  `docs/PUBLISH-WORKFLOW.md` and `.cursor/rules/git-strategy.mdc`
  reconciled to the real feat → dev → main → publish flow (previously
  described a squash-to-main flow that no longer matches practice).
- Merged `feat/visual-expansion` → `dev` (fast-forward, `historymode=preserve`
  via the installed git aliases, not squash).
- Deployed to live via `git ff-dev-main`; Netlify deploy verified
  in-browser (20-card gallery, all four new sims present and rendering).
- Published to the public mirror via `git publish`. Bundle backup taken at
  `~/emergence-lab-history-20260706-115251.bundle`.
- `npm run verify` green (201 kernel tests, typecheck, build) before merge
  and again on merged `dev`.
- Deferred: thumbnails shipped as-is — the four tuned sims' default looks
  changed but the user chose not to regenerate them this session; if their
  defaults move again, regenerate via `node scripts/generate-thumbnails.mjs`.
- Left untouched: `docs/todo.md` line ~12 above still reads "all 12 essays"
  — that's a historical changelog line from the 2026-07-04 entry (all 16
  essays now exist); rewriting past log entries wasn't in scope.

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

## 2026-07-06 — visual expansion, follow-on tuning (Claude Opus 4.8)

Five more commits on `feat/visual-expansion` (verify green: typecheck, 199
kernel tests, build; gallery, variant routing, and stock thumbnails checked
live in-browser).

- Strange attractors split into individual gallery cards via a registry
  `variant` concept, routed at `#/lorenz-attractor/<variant>`.
- Physarum capped at **high** (960²), not ultra — the CPU 3×3 diffusion pass
  makes ultra ~1 step/s and the trail never forms; agents scaled 32k → 100k.
- Belousov-Zhabotinsky: high grid + slower default speed (1.5x → 1.0x).
- Abelian sandpile: default pile 2M → 3M, per-frame topples 2M → 1M for
  smoother growth. Still reads slightly pixelated/jerky at the higher pile —
  left for Fable to tune further; bilinear display smoothing was offered but
  not applied.
- Gallery: live per-card WebGL stills replaced by pre-rendered stock PNGs
  (`public/thumbnails/`, generated by `scripts/generate-thumbnails.mjs`);
  single responsive grid with a category tag per card, Swarm & Flocking
  leads. **Regenerate these thumbnails** (`node scripts/generate-thumbnails.mjs`)
  after any kernel change that alters a sim's default look.
- Game of Life reverted to its original ultra/full-speed default per user
  feedback.
- Next: publish to the public mirror (user-driven), then Fable tunes
  physarum, belousov-zhabotinsky, and abelian-sandpile further. Open: should
  the sandpile get bilinear smoothing? Should physarum ever force ultra
  despite the low framerate?
