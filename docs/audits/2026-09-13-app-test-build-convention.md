# How a pure `src/app` module becomes testable — decision

**Date:** 2026-09-13
**Stage:** 95-app-test-build-convention
**Status:** decided and implemented

## Decision

**Chosen: option (d), the explicit include list plus a named failure.** The
`include` array in `tsconfig.test.json` keeps naming `src/app` sources one by
one, the rule is written down in `docs/INTERFACE.md` where a card author will
find it, and `scripts/run-kernel-tests.cjs` now pre-checks every
`.test-build/` require before it starts `node:test`, so a module nobody added
to the list fails with the source path and the name of the file to edit
instead of a bare `MODULE_NOT_FOUND` from inside a test. This is option (b)
with the surprise removed mechanically rather than only by documentation: the
tax of one line per tested module stays, but it is now visible at authoring
time (the rule) and at run time (the guard), and both point at the same file.
The measurement below is what settled it — option (a) is not merely risky
here, it is structurally impossible, so the only real choice was between (b)
and (c), and (c) costs TypeScript on exactly the modules worth testing.

## How the test build actually works today

Worth stating plainly, because the two mechanisms are easy to conflate:

- **Discovery is automatic.** `scripts/run-kernel-tests.cjs` walks `src/sims`,
  `src/app` and `e2e/harness` and collects every `*.test.cjs`. Nothing has to
  be registered for a test to be found and run.
- **Compilation is not.** `npm run build:test` is `tsc -p tsconfig.test.json`,
  whose `include` array names its inputs individually. `npm run typecheck`
  runs the same config with `--noEmit`, so the list governs typechecking too.

Consequently a new `src/app` test is discovered and executed whether or not
its module was compiled; if it was not, the test fails on the `require`. The
test file is plainly present and plainly picked up, which is what makes the
failure confusing.

Note that the emitted set is already wider than the `include` list — 34 files
from three entries — because `tsc` follows imports and emits every program
file under `rootDir`. `colormap.js`, `rendererBackend.js`, `resolutionPreset.js`
and `types.js` arrive that way, pulled in by `qualityProfiles.ts`.

## The options, and why the others lost

### (a) Scoped glob over `src/app` — measured and rejected

Rejected on measurement, not on judgement. `src/app` is flat: there are no
subdirectories, so the only glob available is `src/app/*.ts`, and the
measurement below shows it fails outright.

The cause is a resolution mismatch between the two configs, not a DOM or WebGL
dependency:

| | app build (`tsconfig.json`) | test build (`tsconfig.test.json`) |
|---|---|---|
| `moduleResolution` | `Bundler` | `Node16` |
| `allowImportingTsExtensions` | `true` | absent |

App modules therefore import each other as `from "./foo.ts"`, which `Node16`
rejects with TS5097. Twenty of the thirty-seven modules under `src/app` use
`.ts` specifiers in *value* imports and cannot compile under the test config at
all: `canvasRenderer`, `chrome`, `controls`, `docTitle`, `element`,
`fractalCanvas`, `fractalView`, `gallery`, `lib`, `loader`, `main`, `mount`,
`orbit3d`, `orbitSampler`, `persistence`, `registry`, `renderer`, `simView`,
`thumbnail`, `webglRenderer`. Type-only `.ts` imports are fine, which is why
`qualityProfiles.ts` compiles today.

No `exclude` pattern fixes this in the spirit of the card's escalation clause —
an exclude list would have to name all twenty and would grow with every new
renderer module, which is strictly worse than naming the two we do want.

### (b) Explicit list, documented — rejected as written, adopted as (d)

Zero build risk and it keeps the include list a statement of intent. Its only
defect is that the tax is invisible until a worker is already blocked, which
is exactly what happened on stage 94. Documentation alone does not close that:
a card author who has not read `docs/INTERFACE.md` recently still writes an
unclaimed card. Adopting it required the runner guard, hence (d).

### (c) Plain-CJS convention — rejected

Standardising on stage 93's route forfeits TypeScript on the tested unit,
and the tested units are precisely where types earn their keep:
`orbitRefinement.ts`'s `resolveOrbitRefinement` takes
`number | boolean | string | undefined` and narrows it, a signature whose
whole point is the type. It is also the largest migration of the three —
`qualityProfiles.ts` and `orbitRefinement.ts` both move, and both are imported
by app code that would then be importing an untyped `.cjs`. Stage 93's use of
a `.cjs` require is still correct *for its case*, because
`scripts/param-groups-snapshot.cjs` was already CommonJS; that route stays
documented as the second branch of the rule, it just is not the default.

### (d) Explicit list, documented, with a named failure — chosen

(b) plus roughly thirty lines in `scripts/run-kernel-tests.cjs`: scan each
discovered test for `require(".../.test-build/...")`, check the emitted file
exists, and if not, print the test file, the missing emitted path, the source
path it should have been built from, and the instruction to add it to
`tsconfig.test.json`'s `include` — with a pointer to the `docs/INTERFACE.md`
section and a reminder that the stage card must claim that file. Verified by
temporarily removing `src/app/orbitRefinement.ts` from the include list:

```
Tests require modules that npm run build:test did not emit:

  src/app/orbitRefinement.test.cjs
    requires .test-build/app/orbitRefinement.js, which was not built from src/app/orbitRefinement.ts

Add the source path to the "include" array in tsconfig.test.json.
A stage card that adds a compiled src/app test must claim that file;
see docs/INTERFACE.md, "Testing a pure src/app module".
```

The include list was restored immediately; the committed config is unchanged.

## Build evidence (deliverable 3)

All figures from the run worktree after `npm ci --offline`, on the same
machine in one session.

| | before (3 include entries) | option (a) glob, measured | after (chosen) |
|---|---|---|---|
| emitted files under `.test-build/` | 34 | 65 | 34 |
| `.test-build/` size | 440K | 1.1M | 440K |
| `npm run build:test`, cold | 1.064s | 1.469s | 0.949s |
| `npm run build:test`, warm | 0.699s | — | 0.693s |
| `tsc` errors | 0 | 88 (all TS5097) | 0 |
| `npm test` count | 374 pass / 0 fail | — | 374 pass / 0 fail |

**The chosen option changes nothing about the build.** `tsconfig.test.json` is
byte-identical to its pre-change state; the only code change is in the test
runner, which runs after the build. The before and after columns are the same
same to within run-to-run noise because they are the same build, and that is
the intended result —
the emitted file list below is unchanged in both.

Emitted file list, before and after (identical, 34 files):

```
.test-build/app/colormap.js
.test-build/app/orbitRefinement.js
.test-build/app/qualityProfiles.js
.test-build/app/rendererBackend.js
.test-build/app/resolutionPreset.js
.test-build/app/types.js
.test-build/sims/abelian-sandpile/kernel.js
.test-build/sims/belousov-zhabotinsky/kernel.js
.test-build/sims/boids/kernel.js
.test-build/sims/boids/layoutStore.js
.test-build/sims/brians-brain/kernel.js
.test-build/sims/burning-ship/kernel.js
.test-build/sims/clifford-dejong/kernel.js
.test-build/sims/cyclic-ca/kernel.js
.test-build/sims/diffusion-limited-aggregation/kernel.js
.test-build/sims/elementary-cellular-automata/kernel.js
.test-build/sims/fractal/detail.js
.test-build/sims/game-of-life/kernel.js
.test-build/sims/gray-scott/kernel.js
.test-build/sims/ising-model/kernel.js
.test-build/sims/julia-set/kernel.js
.test-build/sims/kuramoto-oscillators/kernel.js
.test-build/sims/kuramoto-oscillators/model.js
.test-build/sims/lenia/kernel.js
.test-build/sims/logistic-mandelbrot/kernel.js
.test-build/sims/logistic-mandelbrot/model.js
.test-build/sims/lorenz-attractor/kernel.js
.test-build/sims/mandelbrot/kernel.js
.test-build/sims/markus-lyapunov/kernel.js
.test-build/sims/markus-lyapunov/model.js
.test-build/sims/particle-life/kernel.js
.test-build/sims/physarum/kernel.js
.test-build/sims/swarmalators/kernel.js
.test-build/sims/swarmalators/model.js
```

(`find .test-build -type f | sort`.)

Under option (a) the emitted count rose to 65 files and 1.1M despite the
compile failing, because `tsc` emits what it can before reporting errors —
another reason not to rely on the glob: a red build leaves a half-populated
`.test-build/` behind.

## Who paid for the absence of a rule

**Stages 93 and 94.** Stage 93 wrote `src/app/paramGroups.test.cjs` requiring
`scripts/param-groups-snapshot.cjs`, a plain CommonJS script that needs no
include entry, and passed. Stage 94 wrote `src/app/orbitRefinement.test.cjs`
requiring `.test-build/app/orbitRefinement.js`, following
`qualityProfiles.test.cjs`, and failed: `npm run build:test` never emitted the
file, 366 of 367 tests passed, and the card needed a third attempt and a
re-brief claiming `tsconfig.test.json` for a one-line change. Neither worker
did anything wrong. There was no rule, so each card invented one, and the cost
landed on whichever worker guessed the compiled route.

## Where the rule lives

`docs/INTERFACE.md`, section "Testing a pure `src/app` module". It records both
routes, which to use when, the requirement that a card adding a compiled
`src/app` test claims `tsconfig.test.json`, and the TS5097 constraint that
rules out widening the include list to a glob. It carries no contract version
bump: it is a build convention, not a change to the `SimKernel` shape.
