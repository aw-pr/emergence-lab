# RUNBOOK — emergence-lab

## Purpose

Canonical emergent-behaviour / complex-adaptive-systems simulations. Each simulation consists of a kernel, shared renderer, and essay.

## Lead model and boundary

One lead model owns each project's trunk. Cross-model comparison happens only in the bench-marks repo, never on trunk.

This repo deliberately SPLITS leads by file area: Codex owns `src/sims/**/kernel.ts`, Cursor owns `src/app/**`, Claude owns `docs/INTERFACE.md` and `essays/**`. The kernel<->renderer contract is `docs/INTERFACE.md` (FINAL v1.0). See `MODELS.md` and `CLAUDE.md`.

## How to run

1. Paste `START-PROMPT-codex.md` into a Codex session or cloud task — it builds the Gray-Scott kernel.
2. Paste `START-PROMPT-cursor.md` into Cursor — it builds the renderer and gallery.
3. Both prompts can run in parallel safely because the file boundary prevents collision.
4. Once both complete, run `npm run dev` to serve the gallery.

## Tooling note (record correction)

The `package.json` / `tsconfig.test.json` / `typescript` devDep added alongside
the Gray-Scott kernel were **user-directed**: Tony asked Codex to install the TS
lib so the kernel runs against a stronger test suite (needed later). This is
sanctioned tooling, NOT a Codex scope deviation. Commit `9faf527`'s message
calls it a deviation and a BENCH-001 observation; that framing is withdrawn.
Do not score it against Codex in any Bench task.

## Verification gates

- **Kernel:** exported `selfTest(): boolean` must return `true`.
- **Renderer:** `npm run dev` opens the gallery and Gray-Scott loads and animates.
- **Contract:** kernel must expose `paramSchema`, `channelRanges`, and `channelLabels` per INTERFACE v1.0.

## Task list

- [x] Scaffold repo, model-boundary docs, starting prompts
- [x] Finalise `docs/INTERFACE.md` v1.0 (sync step, paramSchema, Float32Array-only)
- [x] Align start prompts with INTERFACE v1.0
- [x] Codex: implement `src/sims/gray-scott/kernel.ts` (8/8 tests green, commit 9faf527)
- [ ] Cursor: implement `src/app/**` renderer + gallery (`npm run dev` renders) — Tony runs from IDE
- [ ] Verify Gray-Scott runs end-to-end in browser
- [ ] Claude: write `essays/gray-scott.md`
- [ ] Fork the Gray-Scott kernel task into bench-marks as BENCH-001

## Backlog

Further simulations: Lenia (continuous CA), Belousov-Zhabotinsky and other reaction-diffusion presets, Boids flocking, Abelian sandpile (self-organised criticality), strange attractors and L-system fractals. One essay per simulation.
