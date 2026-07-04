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
