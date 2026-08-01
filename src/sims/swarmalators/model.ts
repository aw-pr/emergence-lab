export const SWARMALATOR_TAU = Math.PI * 2;

export interface SwarmalatorParams {
  particleCount: number;
  A: number;
  B: number;
  J: number;
  K: number;
  frequencySpread: number;
  seed: number;
}

export interface SwarmalatorState {
  readonly x: Float32Array;
  readonly y: Float32Array;
  readonly theta: Float32Array;
  readonly omega: Float32Array;
}

export interface InitialPlacement {
  centreX?: number;
  centreY?: number;
  radius?: number;
}

function mulberry32(seed: number): () => number {
  let state = (Math.floor(seed) >>> 0) || 1;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let mixed = Math.imul(state ^ (state >>> 15), 1 | state);
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), 61 | mixed);
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 0x100000000;
  };
}

export function wrapTau(value: number): number {
  const wrapped = value % SWARMALATOR_TAU;
  return wrapped < 0 ? wrapped + SWARMALATOR_TAU : wrapped;
}

export function createSwarmalatorState(
  params: Pick<SwarmalatorParams, "particleCount" | "frequencySpread" | "seed">,
  placement: InitialPlacement = {},
): SwarmalatorState {
  const count = Math.max(0, Math.floor(params.particleCount));
  const x = new Float32Array(count);
  const y = new Float32Array(count);
  const theta = new Float32Array(count);
  const omega = new Float32Array(count);
  const random = mulberry32(params.seed);
  const centreX = placement.centreX ?? 0;
  const centreY = placement.centreY ?? 0;
  const radius = Math.max(0, placement.radius ?? 1);
  const spread = Math.max(0, params.frequencySpread);

  for (let i = 0; i < count; i += 1) {
    const radial = Math.sqrt(random()) * radius;
    const angle = random() * SWARMALATOR_TAU;
    x[i] = centreX + Math.cos(angle) * radial;
    y[i] = centreY + Math.sin(angle) * radial;
    theta[i] = random() * SWARMALATOR_TAU;
    omega[i] = (random() * 2 - 1) * spread;
  }

  return { x, y, theta, omega };
}

/** Advance one explicit Euler step of the O'Keeffe-Hong-Strogatz equations. */
export function stepSwarmalators(
  state: SwarmalatorState,
  params: Pick<SwarmalatorParams, "A" | "B" | "J" | "K">,
  dt: number,
): void {
  const count = state.x.length;
  if (count === 0 || dt === 0) return;

  const nextX = new Float32Array(count);
  const nextY = new Float32Array(count);
  const nextTheta = new Float32Array(count);
  const inverseCount = 1 / count;
  const minDistanceSquared = 1e-8;

  for (let i = 0; i < count; i += 1) {
    let velocityX = 0;
    let velocityY = 0;
    let phaseVelocity = state.omega[i];

    for (let j = 0; j < count; j += 1) {
      if (i === j) continue;

      const dx = state.x[j] - state.x[i];
      const dy = state.y[j] - state.y[i];
      const distanceSquared = Math.max(dx * dx + dy * dy, minDistanceSquared);
      const distance = Math.sqrt(distanceSquared);
      const phaseDifference = state.theta[j] - state.theta[i];
      const spatialStrength =
        (params.A + params.J * Math.cos(phaseDifference)) / distance -
        params.B / distanceSquared;

      velocityX += dx * spatialStrength;
      velocityY += dy * spatialStrength;
      phaseVelocity +=
        params.K * inverseCount * Math.sin(phaseDifference) / distance;
    }

    nextX[i] = state.x[i] + dt * inverseCount * velocityX;
    nextY[i] = state.y[i] + dt * inverseCount * velocityY;
    nextTheta[i] = wrapTau(state.theta[i] + dt * phaseVelocity);
  }

  state.x.set(nextX);
  state.y.set(nextY);
  state.theta.set(nextTheta);
}

