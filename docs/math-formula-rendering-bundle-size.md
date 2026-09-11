# Math formula rendering bundle size

Measured on 2026-09-01 with two clean production builds using Vite 6.4.2 and
KaTeX 0.16.47:

- Before: `d0e7ce9751895011ae996e0582b4f86ad8dbe470`, the parent of the formula
  rendering change.
- After: `2460643aa98f0d806da395e5131aabe5f38ae7d5`, the formula rendering change.

Each revision was exported to a separate temporary directory and built with
`npm run build`. The figures below are Vite's production-build output.

| Primary asset | Before gzip | After gzip | Delta gzip |
| --- | ---: | ---: | ---: |
| CSS | 1.96 kB | 10.05 kB | +8.09 kB |
| JavaScript | 19.41 kB | 97.14 kB | +77.73 kB |
| **Combined** | **21.37 kB** | **107.19 kB** | **+85.82 kB** |

The HTML and twelve simulation-kernel chunks were unchanged. The measured
85.82 kB gzip increase is 5.82 kB above the stage's 80 kB soft cap.

KaTeX also emitted 59 font files totalling 1,072,948 bytes on disk. Vite lists
these separately without gzip figures, so they are not included in the primary
JS and CSS delta above. As a conservative build-artifact check, independently
gzipping every emitted file with `gzip -9 -n` produced a 951,605-byte total
delta, including all font formats. That is not an initial-transfer estimate:
browsers select supported font sources and fetch the faces used by rendered
formulas rather than downloading every emitted font asset up front.
