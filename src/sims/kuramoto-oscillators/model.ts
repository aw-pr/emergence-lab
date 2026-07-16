export type KuramotoPattern = "vortices" | "waves" | "random";

export interface KuramotoInitialParams {
  frequencySpread: number;
  initialPattern: KuramotoPattern;
  seed: number;
}

export interface KuramotoInitialFields {
  phases: Float32Array;
  frequencies: Float32Array;
  rngState: number;
}

export const KURAMOTO_TAU = Math.PI * 2;

function wrapTau(value: number): number {
  const wrapped = value % KURAMOTO_TAU;
  return wrapped < 0 ? wrapped + KURAMOTO_TAU : wrapped;
}

function nextRandom(state: number): [number, number] {
  let next = state;
  next ^= next << 13;
  next ^= next >>> 17;
  next ^= next << 5;
  const unsigned = next >>> 0;
  return [unsigned / 0x100000000, unsigned];
}

export function createKuramotoInitialFields(
  width: number,
  height: number,
  params: KuramotoInitialParams,
): KuramotoInitialFields {
  const w = Math.max(0, Math.floor(width));
  const h = Math.max(0, Math.floor(height));
  const phases = new Float32Array(w * h);
  const frequencies = new Float32Array(w * h);
  let rngState = (Math.floor(params.seed) >>> 0) || 1;

  for (let index = 0; index < phases.length; index += 1) {
    const x = index % w;
    const y = Math.floor(index / w);
    let random: number;
    [random, rngState] = nextRandom(rngState);

    if (params.initialPattern === "random") {
      phases[index] = random * KURAMOTO_TAU;
    } else {
      const nx = (x + 0.5) / Math.max(1, w);
      const ny = (y + 0.5) / Math.max(1, h);
      const perturbation = (random - 0.5) * 0.3;
      if (params.initialPattern === "waves") {
        phases[index] = wrapTau(
          KURAMOTO_TAU * (nx * 1.75 + ny * 0.8) + perturbation,
        );
      } else {
        const vortex = Math.atan2(ny - 0.34, nx - 0.34);
        const antivortex = Math.atan2(ny - 0.68, nx - 0.67);
        phases[index] = wrapTau(vortex - antivortex + perturbation);
      }
    }

    [random, rngState] = nextRandom(rngState);
    frequencies[index] = (random * 2 - 1) * params.frequencySpread;
  }

  return { phases, frequencies, rngState };
}
