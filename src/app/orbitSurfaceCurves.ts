export interface OrbitSurfaceComplex {
  re: number;
  im: number;
}

export interface OrbitSurfaceBoundaryPoint {
  angle: number;
  c: OrbitSurfaceComplex;
  cycle: OrbitSurfaceComplex;
  residual: number;
}

export interface OrbitSurfaceBoundarySeed {
  angle: number;
  c: OrbitSurfaceComplex;
  cycle: OrbitSurfaceComplex;
}

export interface OrbitSurfaceBoundaryCurve {
  period: number;
  points: OrbitSurfaceBoundaryPoint[];
  maxChordError: number;
  closed: boolean;
}

export interface OrbitSurfaceBoundaryTraceOptions {
  startAngle?: number;
  endAngle?: number;
  initialAngleStep?: number;
  minimumAngleStep?: number;
  maximumAngleStep?: number;
  maxChordError?: number;
  rootTolerance?: number;
  maxCorrectorIterations?: number;
}

const TWO_PI = Math.PI * 2;
const DEFAULT_ROOT_TOLERANCE = 1e-12;
const DEFAULT_MAX_CORRECTOR_ITERATIONS = 24;

/**
 * Correct one cycle point and parameter against
 * f_c^period(z) = z and (f_c^period)'(z) = exp(i angle).
 */
export function correctOrbitSurfaceBoundaryPoint(
  period: number,
  angle: number,
  predictedCycle: OrbitSurfaceComplex,
  predictedC: OrbitSurfaceComplex,
  tolerance = DEFAULT_ROOT_TOLERANCE,
  maxIterations = DEFAULT_MAX_CORRECTOR_ITERATIONS,
): OrbitSurfaceBoundaryPoint {
  const boundedPeriod = Math.floor(period);
  if (boundedPeriod < 1 || boundedPeriod !== period) {
    throw new Error("Orbit surface boundary periods must be positive integers.");
  }
  const target = polar(angle);
  let cycle = finiteComplex(predictedCycle, "cycle seed");
  let c = finiteComplex(predictedC, "parameter seed");
  const boundedTolerance = Math.max(Number.EPSILON, Math.abs(tolerance));
  const boundedIterations = Math.max(1, Math.floor(maxIterations));

  for (let iteration = 0; iteration < boundedIterations; iteration += 1) {
    const evaluated = evaluateCycle(boundedPeriod, cycle, c);
    const cycleResidual = subtract(evaluated.value, cycle);
    const multiplierResidual = subtract(evaluated.multiplier, target);
    const residual = Math.max(magnitude(cycleResidual), magnitude(multiplierResidual));
    if (residual <= boundedTolerance) {
      return { angle, c, cycle, residual };
    }

    const cycleDerivative = subtract(evaluated.multiplier, { re: 1, im: 0 });
    const determinant = subtract(
      multiply(cycleDerivative, evaluated.multiplierC),
      multiply(evaluated.valueC, evaluated.multiplierCycle),
    );
    if (magnitude(determinant) <= Number.EPSILON) {
      throw new Error(
        `Orbit surface boundary corrector became singular for period ${period} at angle ${angle}.`,
      );
    }
    const cycleDelta = divide(
      subtract(
        multiply(negate(cycleResidual), evaluated.multiplierC),
        multiply(evaluated.valueC, negate(multiplierResidual)),
      ),
      determinant,
    );
    const cDelta = divide(
      subtract(
        multiply(cycleDerivative, negate(multiplierResidual)),
        multiply(negate(cycleResidual), evaluated.multiplierCycle),
      ),
      determinant,
    );
    cycle = add(cycle, cycleDelta);
    c = add(c, cDelta);
  }

  const evaluated = evaluateCycle(boundedPeriod, cycle, c);
  const residual = Math.max(
    magnitude(subtract(evaluated.value, cycle)),
    magnitude(subtract(evaluated.multiplier, target)),
  );
  throw new Error(
    `Orbit surface boundary corrector did not converge for period ${period} at angle ${angle}; residual ${residual}.`,
  );
}

/**
 * Trace one seeded hyperbolic-component boundary by predictor-corrector
 * continuation in multiplier angle. Accepted angle steps adapt to the
 * corrected midpoint's distance from the parameter-plane chord.
 */
export function traceOrbitSurfaceBoundary(
  period: number,
  seed: OrbitSurfaceBoundarySeed,
  options: OrbitSurfaceBoundaryTraceOptions = {},
): OrbitSurfaceBoundaryCurve {
  const startAngle = options.startAngle ?? seed.angle;
  const endAngle = options.endAngle ?? startAngle + TWO_PI;
  if (!(endAngle > startAngle)) {
    throw new Error("Orbit surface boundary end angle must exceed its start angle.");
  }
  const maximumStep = positive(options.maximumAngleStep, Math.PI / 8);
  const minimumStep = Math.min(
    maximumStep,
    positive(options.minimumAngleStep, Math.PI / 4096),
  );
  const initialStep = Math.min(
    maximumStep,
    Math.max(minimumStep, positive(options.initialAngleStep, Math.PI / 32)),
  );
  const chordLimit = positive(options.maxChordError, 1e-3);
  const rootTolerance = positive(options.rootTolerance, DEFAULT_ROOT_TOLERANCE);
  const maxIterations = Math.max(
    1,
    Math.floor(options.maxCorrectorIterations ?? DEFAULT_MAX_CORRECTOR_ITERATIONS),
  );
  const first = correctOrbitSurfaceBoundaryPoint(
    period,
    startAngle,
    seed.cycle,
    seed.c,
    rootTolerance,
    maxIterations,
  );
  const points = [first];
  let step = initialStep;
  let maximumAcceptedError = 0;

  while (points.at(-1)!.angle < endAngle - Number.EPSILON) {
    const current = points.at(-1)!;
    const targetAngle = Math.min(endAngle, current.angle + step);
    const predicted = predict(points, targetAngle);
    let endpoint: OrbitSurfaceBoundaryPoint;
    let midpoint: OrbitSurfaceBoundaryPoint;
    try {
      endpoint = correctOrbitSurfaceBoundaryPoint(
        period,
        targetAngle,
        predicted.cycle,
        predicted.c,
        rootTolerance,
        maxIterations,
      );
      const middleAngle = (current.angle + targetAngle) * 0.5;
      midpoint = correctOrbitSurfaceBoundaryPoint(
        period,
        middleAngle,
        interpolate(current.cycle, endpoint.cycle, 0.5),
        interpolate(current.c, endpoint.c, 0.5),
        rootTolerance,
        maxIterations,
      );
    } catch (error) {
      if (step <= minimumStep * (1 + 1e-12)) throw error;
      step = Math.max(minimumStep, step * 0.5);
      continue;
    }

    const chordError = pointSegmentDistance(midpoint.c, current.c, endpoint.c);
    if (chordError > chordLimit && step > minimumStep * (1 + 1e-12)) {
      step = Math.max(minimumStep, step * 0.5);
      continue;
    }
    maximumAcceptedError = Math.max(maximumAcceptedError, chordError);
    points.push(endpoint);
    if (chordError < chordLimit * 0.2) {
      step = Math.min(maximumStep, step * 2);
    }
  }

  return {
    period,
    points,
    maxChordError: maximumAcceptedError,
    closed: complexDistance(points[0].c, points.at(-1)!.c) <= rootTolerance * 100,
  };
}

/**
 * Trace the primary period-1 or period-2 component from its closed form.
 * These formulae avoid the singular period-2 root while retaining the same
 * deterministic curvature-adaptive polyline contract as continuation.
 */
export function tracePrimaryOrbitSurfaceBoundary(
  period: 1 | 2,
  maxChordError = 1e-3,
): OrbitSurfaceBoundaryCurve {
  const chordLimit = positive(maxChordError, 1e-3);
  const pointAt = (angle: number): OrbitSurfaceBoundaryPoint => {
    const multiplier = polar(angle);
    if (period === 1) {
      const cycle = scale(multiplier, 0.5);
      const c = subtract(cycle, multiply(cycle, cycle));
      return { angle, c, cycle, residual: 0 };
    }
    const c = add({ re: -1, im: 0 }, scale(multiplier, 0.25));
    const discriminant = squareRoot({ re: -3 - 4 * c.re, im: -4 * c.im });
    const cycle = scale(add({ re: -1, im: 0 }, discriminant), 0.5);
    return { angle, c, cycle, residual: 0 };
  };
  const points: OrbitSurfaceBoundaryPoint[] = [pointAt(0)];
  let maximumAcceptedError = 0;

  appendAdaptive(0, TWO_PI, pointAt(0), pointAt(TWO_PI), 0);
  return {
    period,
    points,
    maxChordError: maximumAcceptedError,
    closed: true,
  };

  function appendAdaptive(
    firstAngle: number,
    secondAngle: number,
    first: OrbitSurfaceBoundaryPoint,
    second: OrbitSurfaceBoundaryPoint,
    depth: number,
  ): void {
    const middleAngle = (firstAngle + secondAngle) * 0.5;
    const middle = pointAt(middleAngle);
    const error = pointSegmentDistance(middle.c, first.c, second.c);
    if (error > chordLimit && depth < 24) {
      appendAdaptive(firstAngle, middleAngle, first, middle, depth + 1);
      appendAdaptive(middleAngle, secondAngle, middle, second, depth + 1);
      return;
    }
    maximumAcceptedError = Math.max(maximumAcceptedError, error);
    points.push(second);
  }
}

interface CycleEvaluation {
  value: OrbitSurfaceComplex;
  valueC: OrbitSurfaceComplex;
  multiplier: OrbitSurfaceComplex;
  multiplierCycle: OrbitSurfaceComplex;
  multiplierC: OrbitSurfaceComplex;
}

function evaluateCycle(
  period: number,
  cycle: OrbitSurfaceComplex,
  c: OrbitSurfaceComplex,
): CycleEvaluation {
  let value = cycle;
  let valueCycle = { re: 1, im: 0 };
  let valueC = { re: 0, im: 0 };
  let multiplierCycle = { re: 0, im: 0 };
  let multiplierC = { re: 0, im: 0 };
  for (let iteration = 0; iteration < period; iteration += 1) {
    const nextMultiplierCycle = add(
      scale(multiply(valueCycle, valueCycle), 2),
      scale(multiply(value, multiplierCycle), 2),
    );
    const nextMultiplierC = add(
      scale(multiply(valueC, valueCycle), 2),
      scale(multiply(value, multiplierC), 2),
    );
    valueC = add(scale(multiply(value, valueC), 2), { re: 1, im: 0 });
    valueCycle = scale(multiply(value, valueCycle), 2);
    value = add(multiply(value, value), c);
    multiplierCycle = nextMultiplierCycle;
    multiplierC = nextMultiplierC;
  }
  return {
    value,
    valueC,
    multiplier: valueCycle,
    multiplierCycle,
    multiplierC,
  };
}

function predict(
  points: readonly OrbitSurfaceBoundaryPoint[],
  targetAngle: number,
): { c: OrbitSurfaceComplex; cycle: OrbitSurfaceComplex } {
  const current = points.at(-1)!;
  if (points.length < 2) return { c: current.c, cycle: current.cycle };
  const previous = points.at(-2)!;
  const scaleAmount = (targetAngle - current.angle) / (current.angle - previous.angle);
  return {
    c: add(current.c, scale(subtract(current.c, previous.c), scaleAmount)),
    cycle: add(
      current.cycle,
      scale(subtract(current.cycle, previous.cycle), scaleAmount),
    ),
  };
}

function pointSegmentDistance(
  point: OrbitSurfaceComplex,
  first: OrbitSurfaceComplex,
  second: OrbitSurfaceComplex,
): number {
  const dx = second.re - first.re;
  const dy = second.im - first.im;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) return complexDistance(point, first);
  const amount = Math.max(0, Math.min(1,
    ((point.re - first.re) * dx + (point.im - first.im) * dy) / lengthSquared,
  ));
  return Math.hypot(
    point.re - (first.re + amount * dx),
    point.im - (first.im + amount * dy),
  );
}

function polar(angle: number): OrbitSurfaceComplex {
  return { re: Math.cos(angle), im: Math.sin(angle) };
}

function add(
  left: OrbitSurfaceComplex,
  right: OrbitSurfaceComplex,
): OrbitSurfaceComplex {
  return { re: left.re + right.re, im: left.im + right.im };
}

function subtract(
  left: OrbitSurfaceComplex,
  right: OrbitSurfaceComplex,
): OrbitSurfaceComplex {
  return { re: left.re - right.re, im: left.im - right.im };
}

function negate(value: OrbitSurfaceComplex): OrbitSurfaceComplex {
  return { re: -value.re, im: -value.im };
}

function multiply(
  left: OrbitSurfaceComplex,
  right: OrbitSurfaceComplex,
): OrbitSurfaceComplex {
  return {
    re: left.re * right.re - left.im * right.im,
    im: left.re * right.im + left.im * right.re,
  };
}

function divide(
  numerator: OrbitSurfaceComplex,
  denominator: OrbitSurfaceComplex,
): OrbitSurfaceComplex {
  const scaleAmount = denominator.re * denominator.re + denominator.im * denominator.im;
  if (scaleAmount <= Number.EPSILON) throw new Error("Complex division by zero.");
  return {
    re: (numerator.re * denominator.re + numerator.im * denominator.im) / scaleAmount,
    im: (numerator.im * denominator.re - numerator.re * denominator.im) / scaleAmount,
  };
}

function scale(value: OrbitSurfaceComplex, amount: number): OrbitSurfaceComplex {
  return { re: value.re * amount, im: value.im * amount };
}

function interpolate(
  first: OrbitSurfaceComplex,
  second: OrbitSurfaceComplex,
  amount: number,
): OrbitSurfaceComplex {
  return add(first, scale(subtract(second, first), amount));
}

function magnitude(value: OrbitSurfaceComplex): number {
  return Math.hypot(value.re, value.im);
}

function complexDistance(
  first: OrbitSurfaceComplex,
  second: OrbitSurfaceComplex,
): number {
  return Math.hypot(first.re - second.re, first.im - second.im);
}

function squareRoot(value: OrbitSurfaceComplex): OrbitSurfaceComplex {
  const radius = magnitude(value);
  const re = Math.sqrt(Math.max(0, (radius + value.re) * 0.5));
  const imMagnitude = Math.sqrt(Math.max(0, (radius - value.re) * 0.5));
  const im = value.im < 0 || Object.is(value.im, -0) ? -imMagnitude : imMagnitude;
  return { re, im };
}

function finiteComplex(
  value: OrbitSurfaceComplex,
  label: string,
): OrbitSurfaceComplex {
  if (!Number.isFinite(value.re) || !Number.isFinite(value.im)) {
    throw new Error(`Orbit surface ${label} must be finite.`);
  }
  return { re: value.re, im: value.im };
}

function positive(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : fallback;
}
