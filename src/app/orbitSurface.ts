export interface OrbitSurfaceCells {
  width: number;
  height: number;
  sampleCount: number;
  samples: Float32Array;
  periods: Int16Array;
  interiors: Float32Array;
  boundaries: Float32Array;
  /** Sheet coverage across the periodic-to-chaotic dissolve band. */
  dissolves?: Float32Array;
  escaped: Uint8Array;
}

export interface OrbitSurfaceMesh {
  /** Grid x, grid y, orbit height for every emitted vertex. */
  positions: Float32Array;
  /** Unit normals in the same grid x, grid y, orbit-height coordinate space. */
  normals: Float32Array;
  periods: Float32Array;
  interiors: Float32Array;
  boundaries: Float32Array;
  ranks: Float32Array;
  edgeFades: Float32Array;
  dissolves: Float32Array;
  indices: Uint32Array;
}

export interface OrbitSurfaceSample {
  samples: ArrayLike<number>;
  sampleOffset?: number;
  period: number;
  interior: number;
  boundary: number;
  dissolve?: number;
  escaped: boolean;
}

export interface OrbitSurfaceSamplePoint {
  x: number;
  y: number;
  sample: OrbitSurfaceSample;
}

export type OrbitSurfaceSampler = (
  gridX: number,
  gridY: number,
) => OrbitSurfaceSample;

export interface OrbitSurfaceRefinedCell {
  /** Top-left grid coordinate of the refined quad. */
  x: number;
  y: number;
  /** Dyadic subdivision level relative to its containing coarse quad. */
  depth: number;
  /** Leaf width in grid cells. Omitted for the legacy uniform-depth form. */
  size?: number;
}

export interface OrbitSurfaceBuildOptions {
  sampler?: OrbitSurfaceSampler;
  refinedCells?: readonly OrbitSurfaceRefinedCell[];
}

export interface OrbitSurfaceTransition {
  x: number;
  y: number;
  samplesByPeriod: ReadonlyMap<number, OrbitSurfaceSample>;
  pointsByPeriod: ReadonlyMap<number, OrbitSurfaceSamplePoint>;
}

export interface OrbitSurfaceProjectedPoint {
  x: number;
  y: number;
}

export type OrbitSurfaceProjector = (
  gridX: number,
  gridY: number,
  height: number,
) => OrbitSurfaceProjectedPoint;

export interface OrbitSurfaceRefinementPlan {
  cells: OrbitSurfaceRefinedCell[];
  maxErrorPx: number;
  segmentCount: number;
  budgetExhausted: boolean;
}

export type OrbitSurfaceDiagnosticMode = "off" | "flat" | "normals";

export function orbitSurfaceDiagnosticMode(
  value: unknown,
): OrbitSurfaceDiagnosticMode {
  return value === "flat" || value === "normals" ? value : "off";
}

/** Maximum orbit-height span accepted within one surface triangle. */
export const ORBIT_SURFACE_MAX_HEIGHT_JUMP = 0.35;
/** Covers the 1,176,578 triangles of a complete period-1 sheet at 768 squared. */
export const ORBIT_SURFACE_TRIANGLE_LIMIT = 1_199_999;
/** Fixed sampling work for every disagreeing contour edge. */
export const ORBIT_SURFACE_CONTOUR_BISECTION_STEPS = 6;

/** Coverage shared by sheet fading and chaotic cloud-band selection. */
export function orbitSurfaceDissolveCoverage(
  distanceCells: number,
  bandCells: number,
): number {
  const width = Number.isFinite(bandCells) ? Math.max(0, bandCells) : 0;
  if (width === 0) return distanceCells > 0.5 ? 1 : 0;
  return Math.min(1, Math.max(0, distanceCells - 0.5) / width);
}

/** True only for bounded chaotic samples inside the sheet dissolve band. */
export function isOrbitSurfaceCloudBandSample(
  period: number,
  escaped: boolean,
  periodicDistanceCells: number,
  bandCells: number,
): boolean {
  return !escaped && period === 0 &&
    orbitSurfaceDissolveCoverage(periodicDistanceCells, bandCells) < 1;
}

/**
 * Deterministic sub-cell sites matching the cloud path's square refinement
 * lattice. The parent centre is omitted because its coarse sample is already
 * present.
 */
export function orbitSurfaceCloudRefinementOffsets(
  subdivision: number,
): ReadonlyArray<OrbitSurfaceProjectedPoint> {
  const divisions = Math.max(1, Math.floor(subdivision));
  const offsets: OrbitSurfaceProjectedPoint[] = [];
  for (let y = 0; y < divisions; y += 1) {
    for (let x = 0; x < divisions; x += 1) {
      const offsetX = (x + 0.5) / divisions - 0.5;
      const offsetY = (y + 0.5) / divisions - 0.5;
      if (Math.abs(offsetX) <= Number.EPSILON && Math.abs(offsetY) <= Number.EPSILON) {
        continue;
      }
      offsets.push({ x: offsetX, y: offsetY });
    }
  }
  return offsets;
}

/**
 * Refine one coarse boundary quad against the projected contour chord error.
 * Each accepted leaf is compared with one further bisection level, including
 * depth-four leaves, so the reported maximum is the actual acceptance error.
 */
export function planOrbitSurfaceCellRefinement(
  x: number,
  y: number,
  sampler: OrbitSurfaceSampler,
  sampleCount: number,
  project: OrbitSurfaceProjector,
  errorBudgetPx: number,
  maxDepth: number,
  cellBudget: number,
): OrbitSurfaceRefinementPlan {
  const leaves: OrbitSurfaceRefinedCell[] = [];
  const boundedDepth = Math.max(0, Math.min(8, Math.floor(maxDepth)));
  const boundedBudget = Math.max(1, Math.floor(cellBudget));
  const threshold = Number.isFinite(errorBudgetPx)
    ? Math.max(0, errorBudgetPx)
    : 0;
  let leafCount = 1;
  let maxErrorPx = 0;
  let segmentCount = 0;
  let budgetExhausted = false;

  visit(x, y, 1, 0);
  return { cells: leaves, maxErrorPx, segmentCount, budgetExhausted };

  function visit(left: number, top: number, size: number, depth: number): void {
    const parent = projectedContourSegments(
      left,
      top,
      left + size,
      top + size,
      sampler,
      sampleCount,
      project,
    );
    const half = size * 0.5;
    const children = [
      projectedContourSegments(left, top, left + half, top + half, sampler, sampleCount, project),
      projectedContourSegments(left + half, top, left + size, top + half, sampler, sampleCount, project),
      projectedContourSegments(left, top + half, left + half, top + size, sampler, sampleCount, project),
      projectedContourSegments(left + half, top + half, left + size, top + size, sampler, sampleCount, project),
    ];
    const error = projectedContourError(parent, children.flat());
    const canSplit =
      error > threshold &&
      depth < boundedDepth &&
      leafCount + 3 <= boundedBudget;
    if (canSplit) {
      leafCount += 3;
      visit(left, top, half, depth + 1);
      visit(left + half, top, half, depth + 1);
      visit(left, top + half, half, depth + 1);
      visit(left + half, top + half, half, depth + 1);
      return;
    }
    if (error > threshold && depth < boundedDepth) budgetExhausted = true;
    maxErrorPx = Math.max(maxErrorPx, error);
    segmentCount += parent.length;
    leaves.push({ x: left, y: top, depth, size });
  }
}

/** The usable sheet period represented by a sample, or zero when unusable. */
export function orbitSurfaceSamplePeriod(
  sample: OrbitSurfaceSample,
  sampleCount: number,
): number {
  const period = Math.floor(sample.period);
  if (
    sample.escaped ||
    period !== sample.period ||
    period <= 0 ||
    period > sampleCount
  ) {
    return 0;
  }
  const offset = Math.max(0, Math.floor(sample.sampleOffset ?? 0));
  for (let rank = 0; rank < period; rank += 1) {
    if (!Number.isFinite(sample.samples[offset + rank])) return 0;
  }
  return period;
}

/**
 * Locate a categorical period transition on one grid edge. The edge is
 * canonicalised before the fixed-step bisection so callers encounter the same
 * samples and transition coordinate regardless of traversal direction.
 */
export function locateOrbitSurfaceTransition(
  first: OrbitSurfaceSamplePoint,
  second: OrbitSurfaceSamplePoint,
  sampler: OrbitSurfaceSampler,
  sampleCount: number,
): OrbitSurfaceTransition {
  let low = comparePoints(first, second) <= 0 ? first : second;
  let high = low === first ? second : first;
  const lowPeriod = orbitSurfaceSamplePeriod(low.sample, sampleCount);
  const samplesByPeriod = new Map<number, OrbitSurfaceSample>();
  const pointsByPeriod = new Map<number, OrbitSurfaceSamplePoint>();
  const highPeriod = orbitSurfaceSamplePeriod(high.sample, sampleCount);
  if (lowPeriod > 0) {
    samplesByPeriod.set(lowPeriod, low.sample);
    pointsByPeriod.set(lowPeriod, low);
  }
  if (highPeriod > 0) {
    samplesByPeriod.set(highPeriod, high.sample);
    pointsByPeriod.set(highPeriod, high);
  }

  for (let step = 0; step < ORBIT_SURFACE_CONTOUR_BISECTION_STEPS; step += 1) {
    const x = (low.x + high.x) * 0.5;
    const y = (low.y + high.y) * 0.5;
    const sample = sampler(x, y);
    const period = orbitSurfaceSamplePeriod(sample, sampleCount);
    const midpoint = { x, y, sample };
    if (period > 0) {
      samplesByPeriod.set(period, sample);
      pointsByPeriod.set(period, midpoint);
    }
    if (period === lowPeriod) low = midpoint;
    else high = midpoint;
  }

  return {
    x: (low.x + high.x) * 0.5,
    y: (low.y + high.y) * 0.5,
    samplesByPeriod,
    pointsByPeriod,
  };
}

interface ProjectedContourSegment {
  first: OrbitSurfaceProjectedPoint;
  second: OrbitSurfaceProjectedPoint;
  period: number;
}

function projectedContourSegments(
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  sampler: OrbitSurfaceSampler,
  sampleCount: number,
  project: OrbitSurfaceProjector,
): ProjectedContourSegment[] {
  const at = (x: number, y: number): OrbitSurfaceSamplePoint => ({
    x,
    y,
    sample: sampler(x, y),
  });
  const topLeft = at(x0, y0);
  const topRight = at(x1, y0);
  const bottomLeft = at(x0, y1);
  const bottomRight = at(x1, y1);
  const segments: ProjectedContourSegment[] = [];
  appendTriangle([topLeft, bottomLeft, topRight]);
  appendTriangle([topRight, bottomLeft, bottomRight]);
  return segments;

  function appendTriangle(corners: readonly OrbitSurfaceSamplePoint[]): void {
    const periods = Array.from(new Set(corners.map((corner) =>
      orbitSurfaceSamplePeriod(corner.sample, sampleCount))))
      .filter((period) => period > 0)
      .sort((left, right) => left - right);
    for (const period of periods) {
      const intersections: Array<{
        transition: OrbitSurfaceTransition;
        fallback: OrbitSurfaceSample;
      }> = [];
      for (let corner = 0; corner < corners.length; corner += 1) {
        const first = corners[corner];
        const second = corners[(corner + 1) % corners.length];
        const firstInside =
          orbitSurfaceSamplePeriod(first.sample, sampleCount) === period;
        const secondInside =
          orbitSurfaceSamplePeriod(second.sample, sampleCount) === period;
        if (firstInside === secondInside) continue;
        intersections.push({
          transition: locateOrbitSurfaceTransition(first, second, sampler, sampleCount),
          fallback: firstInside ? first.sample : second.sample,
        });
      }
      if (intersections.length !== 2) continue;
      const projected = intersections.map(({ transition, fallback }) => {
        const sample = transition.samplesByPeriod.get(period) ?? fallback;
        const point = transition.pointsByPeriod.get(period) ?? transition;
        return project(
          point.x,
          point.y,
          lowestSurfaceHeight(sample, period),
        );
      });
      segments.push({ first: projected[0], second: projected[1], period });
    }
  }
}

function projectedContourError(
  coarse: readonly ProjectedContourSegment[],
  bisected: readonly ProjectedContourSegment[],
): number {
  let maximum = 0;
  for (const segment of bisected) {
    const candidates = coarse.filter((candidate) => candidate.period === segment.period);
    if (candidates.length === 0) {
      maximum = Math.max(
        maximum,
        Math.hypot(segment.second.x - segment.first.x, segment.second.y - segment.first.y),
      );
      continue;
    }
    const midpoint = {
      x: (segment.first.x + segment.second.x) * 0.5,
      y: (segment.first.y + segment.second.y) * 0.5,
    };
    for (const point of [segment.first, midpoint, segment.second]) {
      let nearest = Number.POSITIVE_INFINITY;
      for (const candidate of candidates) {
        nearest = Math.min(nearest, projectedPointSegmentDistance(point, candidate));
      }
      maximum = Math.max(maximum, nearest);
    }
  }
  return maximum;
}

function projectedPointSegmentDistance(
  point: OrbitSurfaceProjectedPoint,
  segment: ProjectedContourSegment,
): number {
  const dx = segment.second.x - segment.first.x;
  const dy = segment.second.y - segment.first.y;
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared <= Number.EPSILON) {
    return Math.hypot(point.x - segment.first.x, point.y - segment.first.y);
  }
  const amount = Math.max(0, Math.min(1,
    ((point.x - segment.first.x) * dx + (point.y - segment.first.y) * dy)
      / lengthSquared,
  ));
  return Math.hypot(
    point.x - (segment.first.x + amount * dx),
    point.y - (segment.first.y + amount * dy),
  );
}

function lowestSurfaceHeight(sample: OrbitSurfaceSample, period: number): number {
  const offset = Math.max(0, Math.floor(sample.sampleOffset ?? 0));
  let height = Number.POSITIVE_INFINITY;
  for (let rank = 0; rank < period; rank += 1) {
    height = Math.min(height, sample.samples[offset + rank]);
  }
  return Number.isFinite(height) ? height : 0;
}

/**
 * Build open, equal-rank sheets over a regular grid. Every usable cell emits
 * one sorted vertex per detected period rank. Each half of a grid quad is
 * accepted independently, so a discontinuity cannot erase its sound neighbour.
 */
export function buildOrbitSurface(
  cells: OrbitSurfaceCells,
  maxHeightJump: number = ORBIT_SURFACE_MAX_HEIGHT_JUMP,
  options: OrbitSurfaceBuildOptions = {},
): OrbitSurfaceMesh {
  const width = Math.max(0, Math.floor(cells.width));
  const height = Math.max(0, Math.floor(cells.height));
  const sampleCount = Math.max(0, Math.floor(cells.sampleCount));
  const cellCount = width * height;
  const jumpLimit = Number.isFinite(maxHeightJump)
    ? Math.max(0, maxHeightJump)
    : ORBIT_SURFACE_MAX_HEIGHT_JUMP;
  const offsets = new Int32Array(cellCount);
  offsets.fill(-1);
  const validPeriods = new Int16Array(cellCount);
  const positionValues: number[] = [];
  const periodValues: number[] = [];
  const interiorValues: number[] = [];
  const boundaryValues: number[] = [];
  const rankValues: number[] = [];
  const dissolveValues: number[] = [];

  for (let cell = 0; cell < cellCount; cell += 1) {
    const period = cells.periods[cell] ?? 0;
    if (
      cells.escaped[cell] !== 0 ||
      period <= 0 ||
      period > sampleCount ||
      !Number.isInteger(period)
    ) {
      continue;
    }

    const sampleOffset = cell * sampleCount;
    const sorted = new Array<number>(period);
    let usable = true;
    for (let rank = 0; rank < period; rank += 1) {
      const value = cells.samples[sampleOffset + rank];
      if (!Number.isFinite(value)) {
        usable = false;
        break;
      }
      sorted[rank] = value;
    }
    if (!usable) continue;
    sorted.sort((left, right) => left - right);

    const x = cell % width;
    const y = (cell - x) / width;
    offsets[cell] = periodValues.length;
    validPeriods[cell] = period;
    const interior = finiteOr(cells.interiors[cell], 1);
    const boundary = finiteOr(cells.boundaries[cell], 0);
    for (let rank = 0; rank < period; rank += 1) {
      positionValues.push(x, y, sorted[rank]);
      periodValues.push(period);
      interiorValues.push(interior);
      boundaryValues.push(boundary);
      rankValues.push(rank);
      dissolveValues.push(clamp01(cells.dissolves?.[cell] ?? 1));
    }
  }

  const indices: number[] = [];
  const sampler = options.sampler;
  const refinedCoarseCells = new Set<string>();
  const refinedLeaves = new Map<string, OrbitSurfaceRefinedCell[]>();
  if (sampler) {
    for (const cell of options.refinedCells ?? []) {
      const x = Math.floor(cell.x);
      const y = Math.floor(cell.y);
      const depth = Math.max(0, Math.min(8, Math.floor(cell.depth)));
      if (x < 0 || y < 0 || x + 1 >= width || y + 1 >= height) continue;
      if (depth <= 0 && cell.size !== 1) continue;
      const key = pointKey(x, y);
      refinedCoarseCells.add(key);
      const leaves = refinedLeaves.get(key) ?? [];
      if (typeof cell.size === "number" && Number.isFinite(cell.size) && cell.size > 0) {
        leaves.push({ x: cell.x, y: cell.y, depth, size: cell.size });
      } else {
        const divisions = 2 ** depth;
        const size = 1 / divisions;
        for (let subY = 0; subY < divisions; subY += 1) {
          for (let subX = 0; subX < divisions; subX += 1) {
            leaves.push({
              x: x + subX * size,
              y: y + subY * size,
              depth,
              size,
            });
          }
        }
      }
      refinedLeaves.set(key, leaves);
    }
    for (const leaves of refinedLeaves.values()) {
      leaves.sort((left, right) =>
        left.y - right.y || left.x - right.x || left.depth - right.depth);
    }
  }

  const sampledPoints = new Map<string, PreparedSurfacePoint>();
  const extraVertices = new Map<string, number>();
  const transitions = new Map<string, OrbitSurfaceTransition>();
  const transitionVertices = new Map<string, number>();
  const chaosTransitionVertices = new Set<number>();
  const periodTransitionVertices = new Set<number>();

  for (let y = 0; y + 1 < height; y += 1) {
    for (let x = 0; x + 1 < width; x += 1) {
      const leaves = refinedLeaves.get(pointKey(x, y));
      if (leaves && leaves.length > 0) {
        for (const leaf of leaves) {
          const size = leaf.size ?? 1 / 2 ** leaf.depth;
          appendQuad(leaf.x, leaf.y, leaf.x + size, leaf.y + size);
        }
      } else {
        appendBaseQuad(x, y);
      }
    }
  }

  smoothContourChainHeights(
    positionValues,
    periodValues,
    rankValues,
    indices,
    new Set(transitionVertices.values()),
  );

  return {
    positions: new Float32Array(positionValues),
    normals: surfaceNormals(positionValues, indices),
    periods: new Float32Array(periodValues),
    interiors: new Float32Array(interiorValues),
    boundaries: new Float32Array(boundaryValues),
    ranks: new Float32Array(rankValues),
    edgeFades: surfaceEdgeFades(
      periodValues.length,
      indices,
      chaosTransitionVertices,
      periodTransitionVertices,
    ),
    dissolves: new Float32Array(dissolveValues),
    indices: new Uint32Array(indices),
  };

  function appendQuad(x0: number, y0: number, x1: number, y1: number): void {
    const topLeft = pointAt(x0, y0);
    const topRight = pointAt(x1, y0);
    const bottomLeft = pointAt(x0, y1);
    const bottomRight = pointAt(x1, y1);
    appendTriangle(topLeft, bottomLeft, topRight);
    appendTriangle(topRight, bottomLeft, bottomRight);
  }

  function appendBaseQuad(x: number, y: number): void {
    const topLeft = y * width + x;
    const topRight = topLeft + 1;
    const bottomLeft = topLeft + width;
    const bottomRight = bottomLeft + 1;
    appendBaseTriangle(topLeft, bottomLeft, topRight);
    appendBaseTriangle(topRight, bottomLeft, bottomRight);
  }

  function appendBaseTriangle(a: number, b: number, c: number): void {
    const period = validPeriods[a];
    if (period > 0 && validPeriods[b] === period && validPeriods[c] === period) {
      const aOffset = offsets[a];
      const bOffset = offsets[b];
      const cOffset = offsets[c];
      for (let rank = 0; rank < period; rank += 1) {
        appendAcceptedTriangle(aOffset + rank, bOffset + rank, cOffset + rank);
      }
      return;
    }
    if (!sampler) return;
    const ax = a % width;
    const ay = (a - ax) / width;
    const bx = b % width;
    const by = (b - bx) / width;
    const cx = c % width;
    const cy = (c - cx) / width;
    appendTriangle(pointAt(ax, ay), pointAt(bx, by), pointAt(cx, cy));
  }

  function appendTriangle(
    a: PreparedSurfacePoint,
    b: PreparedSurfacePoint,
    c: PreparedSurfacePoint,
  ): void {
    if (indices.length >= ORBIT_SURFACE_TRIANGLE_LIMIT * 3) return;
    if (a.period > 0 && a.period === b.period && a.period === c.period) {
      for (let rank = 0; rank < a.period; rank += 1) {
        appendAcceptedTriangle(
          vertexAtPoint(a, a.period, rank),
          vertexAtPoint(b, a.period, rank),
          vertexAtPoint(c, a.period, rank),
        );
      }
      return;
    }
    if (!sampler) return;

    const periods = Array.from(new Set([a.period, b.period, c.period]))
      .filter((period) => period > 0)
      .sort((left, right) => left - right);
    const corners = [a, b, c] as const;
    for (const period of periods) {
      const polygon: Array<
        | { kind: "point"; point: PreparedSurfacePoint }
        | { kind: "edge"; from: PreparedSurfacePoint; to: PreparedSurfacePoint }
      > = [];
      for (let corner = 0; corner < corners.length; corner += 1) {
        const current = corners[corner];
        const next = corners[(corner + 1) % corners.length];
        const currentInside = current.period === period;
        const nextInside = next.period === period;
        if (currentInside) polygon.push({ kind: "point", point: current });
        if (currentInside !== nextInside) {
          polygon.push({ kind: "edge", from: current, to: next });
        }
      }
      if (polygon.length < 3) continue;

      for (let rank = 0; rank < period; rank += 1) {
        const polygonVertices = polygon.map((vertex) =>
          vertex.kind === "point"
            ? vertexAtPoint(vertex.point, period, rank)
            : vertexAtTransition(vertex.from, vertex.to, period, rank));
        if (polygonVertices.length === 4) {
          const transitionOffsets = polygon
            .map((vertex, offset) => vertex.kind === "edge" ? offset : -1)
            .filter((offset) => offset >= 0);
          if (transitionOffsets.length === 2) {
            const [firstOffset, secondOffset] = transitionOffsets;
            const firstVertex = polygonVertices[firstOffset];
            const secondVertex = polygonVertices[secondOffset];
            const rootOffset = compareVertexPositions(firstVertex, secondVertex) <= 0
              ? firstOffset
              : secondOffset;
            let ordered = rotate(polygonVertices, rootOffset);
            const otherTransition = rootOffset === firstOffset ? secondVertex : firstVertex;
            if (ordered[3] !== otherTransition) {
              ordered = [ordered[0], ordered[3], ordered[2], ordered[1]];
            }
            appendAcceptedTriangle(ordered[0], ordered[1], ordered[2]);
            appendAcceptedTriangle(ordered[0], ordered[2], ordered[3]);
            continue;
          }
        }
        for (let vertex = 1; vertex + 1 < polygonVertices.length; vertex += 1) {
          appendAcceptedTriangle(polygonVertices[0], polygonVertices[vertex], polygonVertices[vertex + 1]);
        }
      }
    }
  }

  function compareVertexPositions(first: number, second: number): number {
    const firstOffset = first * 3;
    const secondOffset = second * 3;
    return positionValues[firstOffset] - positionValues[secondOffset]
      || positionValues[firstOffset + 1] - positionValues[secondOffset + 1];
  }

  function rotate(values: number[], offset: number): number[] {
    return values.slice(offset).concat(values.slice(0, offset));
  }

  function appendAcceptedTriangle(a: number, b: number, c: number): void {
    if (
      a < 0 ||
      b < 0 ||
      c < 0 ||
      indices.length >= ORBIT_SURFACE_TRIANGLE_LIMIT * 3
    ) {
      return;
    }
    const ah = positionValues[a * 3 + 2];
    const bh = positionValues[b * 3 + 2];
    const ch = positionValues[c * 3 + 2];
    if (Math.max(ah, bh, ch) - Math.min(ah, bh, ch) <= jumpLimit) {
      indices.push(a, b, c);
    }
  }

  function pointAt(x: number, y: number): PreparedSurfacePoint {
    const key = pointKey(x, y);
    const existing = sampledPoints.get(key);
    if (existing) return existing;

    const integerX = Number.isInteger(x) ? x : -1;
    const integerY = Number.isInteger(y) ? y : -1;
    const baseCell =
      integerX >= 0 && integerX < width && integerY >= 0 && integerY < height
        ? integerY * width + integerX
        : -1;
    const sample: OrbitSurfaceSample = baseCell >= 0
      ? {
          samples: cells.samples,
          sampleOffset: baseCell * sampleCount,
          period: cells.periods[baseCell] ?? 0,
          interior: finiteOr(cells.interiors[baseCell], 1),
          boundary: finiteOr(cells.boundaries[baseCell], 0),
          dissolve: clamp01(cells.dissolves?.[baseCell] ?? 1),
          escaped: cells.escaped[baseCell] !== 0,
        }
      : sampler
        ? sampler(x, y)
        : {
            samples: [],
            period: 0,
            interior: 1,
            boundary: 0,
            dissolve: 1,
            escaped: true,
          };
    const period = orbitSurfaceSamplePeriod(sample, sampleCount);
    const point: PreparedSurfacePoint = {
      x,
      y,
      key,
      baseCell,
      sample,
      period,
      heights: conformingSurfaceHeights(
        x,
        y,
        period,
        sortedSurfaceHeights(sample, period),
      ),
    };
    sampledPoints.set(key, point);
    return point;
  }

  function vertexAtPoint(
    point: PreparedSurfacePoint,
    period: number,
    rank: number,
  ): number {
    if (point.period !== period || rank < 0 || rank >= period) return -1;
    if (point.baseCell >= 0 && validPeriods[point.baseCell] === period) {
      return offsets[point.baseCell] + rank;
    }
    const key = `${point.key}|${period}|${rank}`;
    const existing = extraVertices.get(key);
    if (existing !== undefined) return existing;
    const vertex = periodValues.length;
    positionValues.push(point.x, point.y, point.heights[rank]);
    periodValues.push(period);
    interiorValues.push(finiteOr(point.sample.interior, 1));
    boundaryValues.push(finiteOr(point.sample.boundary, 0));
    rankValues.push(rank);
    dissolveValues.push(clamp01(point.sample.dissolve ?? 1));
    extraVertices.set(key, vertex);
    return vertex;
  }

  function vertexAtTransition(
    first: PreparedSurfacePoint,
    second: PreparedSurfacePoint,
    period: number,
    rank: number,
  ): number {
    const key = edgeKey(first, second);
    const vertexKey = `${key}|${period}|${rank}`;
    const existing = transitionVertices.get(vertexKey);
    if (existing !== undefined) return existing;
    let transition = transitions.get(key);
    if (!transition) {
      transition = locateOrbitSurfaceTransition(first, second, sampler as OrbitSurfaceSampler, sampleCount);
      transitions.set(key, transition);
    }
    const fallback = first.period === period ? first : second;
    const sample = transition.samplesByPeriod.get(period) ?? fallback.sample;
    const transitionPoint = transition.pointsByPeriod.get(period) ?? transition;
    const heights = sortedSurfaceHeights(sample, period);
    const height = finiteOr(heights[rank], fallback.heights[rank]);
    const vertex = periodValues.length;
    positionValues.push(transitionPoint.x, transitionPoint.y, height);
    periodValues.push(period);
    interiorValues.push(finiteOr(sample.interior, fallback.sample.interior));
    boundaryValues.push(finiteOr(sample.boundary, fallback.sample.boundary));
    rankValues.push(rank);
    const chaosTransition = first.period === 0 || second.period === 0;
    dissolveValues.push(
      chaosTransition ? 0 : clamp01(sample.dissolve ?? fallback.sample.dissolve ?? 1),
    );
    transitionVertices.set(vertexKey, vertex);
    if (chaosTransition) chaosTransitionVertices.add(vertex);
    else periodTransitionVertices.add(vertex);
    return vertex;
  }

  function sortedSurfaceHeights(
    sample: OrbitSurfaceSample,
    period: number,
  ): number[] {
    if (period <= 0) return [];
    const offset = Math.max(0, Math.floor(sample.sampleOffset ?? 0));
    const heights = new Array<number>(period);
    for (let rank = 0; rank < period; rank += 1) {
      heights[rank] = sample.samples[offset + rank];
    }
    heights.sort((left, right) => left - right);
    return heights;
  }

  function conformingSurfaceHeights(
    x: number,
    y: number,
    period: number,
    sampledHeights: number[],
  ): number[] {
    if (period <= 0) return sampledHeights;
    if (Number.isInteger(x) && !Number.isInteger(y)) {
      const row = Math.floor(y);
      const leftRefined = x > 0 && refinedCoarseCells.has(pointKey(x - 1, row));
      const rightRefined = x + 1 < width && refinedCoarseCells.has(pointKey(x, row));
      if (leftRefined !== rightRefined) {
        return interpolateBaseEdge(
          row * width + x,
          (row + 1) * width + x,
          y - row,
          period,
          sampledHeights,
        );
      }
    }
    if (!Number.isInteger(x) && Number.isInteger(y)) {
      const column = Math.floor(x);
      const topRefined = y > 0 && refinedCoarseCells.has(pointKey(column, y - 1));
      const bottomRefined = y + 1 < height && refinedCoarseCells.has(pointKey(column, y));
      if (topRefined !== bottomRefined) {
        return interpolateBaseEdge(
          y * width + column,
          y * width + column + 1,
          x - column,
          period,
          sampledHeights,
        );
      }
    }
    return sampledHeights;
  }

  function interpolateBaseEdge(
    firstCell: number,
    secondCell: number,
    amount: number,
    period: number,
    fallback: number[],
  ): number[] {
    if (
      firstCell < 0 ||
      secondCell < 0 ||
      firstCell >= cellCount ||
      secondCell >= cellCount ||
      validPeriods[firstCell] !== period ||
      validPeriods[secondCell] !== period
    ) {
      return fallback;
    }
    const interpolated = new Array<number>(period);
    for (let rank = 0; rank < period; rank += 1) {
      const firstHeight = positionValues[(offsets[firstCell] + rank) * 3 + 2];
      const secondHeight = positionValues[(offsets[secondCell] + rank) * 3 + 2];
      interpolated[rank] = firstHeight * (1 - amount) + secondHeight * amount;
    }
    return interpolated;
  }
}

interface PreparedSurfacePoint extends OrbitSurfaceSamplePoint {
  key: string;
  baseCell: number;
  period: number;
  heights: number[];
}

function pointKey(x: number, y: number): string {
  return `${Object.is(x, -0) ? 0 : x},${Object.is(y, -0) ? 0 : y}`;
}

function edgeKey(
  first: Pick<OrbitSurfaceSamplePoint, "x" | "y">,
  second: Pick<OrbitSurfaceSamplePoint, "x" | "y">,
): string {
  const firstKey = pointKey(first.x, first.y);
  const secondKey = pointKey(second.x, second.y);
  return firstKey < secondKey
    ? `${firstKey}|${secondKey}`
    : `${secondKey}|${firstKey}`;
}

function comparePoints(
  first: Pick<OrbitSurfaceSamplePoint, "x" | "y">,
  second: Pick<OrbitSurfaceSamplePoint, "x" | "y">,
): number {
  return first.x === second.x ? first.y - second.y : first.x - second.x;
}

/** Area-weighted smooth normals over the accepted half-quad faces. */
function surfaceNormals(
  positions: number[],
  indices: number[],
): Float32Array {
  const normals = new Float32Array(positions.length);
  for (let offset = 0; offset < indices.length; offset += 3) {
    const a = indices[offset] * 3;
    const b = indices[offset + 1] * 3;
    const c = indices[offset + 2] * 3;
    const abx = positions[b] - positions[a];
    const aby = positions[b + 1] - positions[a + 1];
    const abz = positions[b + 2] - positions[a + 2];
    const acx = positions[c] - positions[a];
    const acy = positions[c + 1] - positions[a + 1];
    const acz = positions[c + 2] - positions[a + 2];

    // The mesh winding faces down in grid coordinates, so reverse the cross
    // product to keep the canonical sheet normal pointed towards +height.
    const nx = acy * abz - acz * aby;
    const ny = acz * abx - acx * abz;
    const nz = acx * aby - acy * abx;
    if (!Number.isFinite(nx + ny + nz)) continue;
    normals[a] += nx;
    normals[a + 1] += ny;
    normals[a + 2] += nz;
    normals[b] += nx;
    normals[b + 1] += ny;
    normals[b + 2] += nz;
    normals[c] += nx;
    normals[c + 1] += ny;
    normals[c + 2] += nz;
  }

  for (let offset = 0; offset < normals.length; offset += 3) {
    const nx = normals[offset];
    const ny = normals[offset + 1];
    const nz = normals[offset + 2];
    const length = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(length) || length <= Number.EPSILON) {
      normals[offset] = 0;
      normals[offset + 1] = 0;
      normals[offset + 2] = 1;
      continue;
    }
    normals[offset] = nx / length;
    normals[offset + 1] = ny / length;
    normals[offset + 2] = nz / length;
  }
  return normals;
}

function smoothContourChainHeights(
  positions: number[],
  periods: number[],
  ranks: number[],
  indices: number[],
  transitionVertices: ReadonlySet<number>,
): void {
  const edges = surfaceEdges(indices);
  const neighbours = new Map<number, number[]>();
  for (const edge of edges.values()) {
    if (
      edge.count !== 1 ||
      !transitionVertices.has(edge.first) ||
      !transitionVertices.has(edge.second) ||
      periods[edge.first] !== periods[edge.second] ||
      ranks[edge.first] !== ranks[edge.second]
    ) {
      continue;
    }
    addNeighbour(edge.first, edge.second);
    addNeighbour(edge.second, edge.first);
  }
  const smoothed = new Map<number, number>();
  for (const [vertex, adjacent] of neighbours) {
    if (adjacent.length !== 2) continue;
    const height = positions[vertex * 3 + 2] * 0.5
      + positions[adjacent[0] * 3 + 2] * 0.25
      + positions[adjacent[1] * 3 + 2] * 0.25;
    if (Number.isFinite(height)) smoothed.set(vertex, height);
  }
  for (const [vertex, height] of smoothed) positions[vertex * 3 + 2] = height;

  function addNeighbour(vertex: number, neighbour: number): void {
    const adjacent = neighbours.get(vertex) ?? [];
    if (!adjacent.includes(neighbour)) adjacent.push(neighbour);
    neighbours.set(vertex, adjacent);
  }
}

const EDGE_FEATHER_LEVELS = [0.16, 0.5, 0.82, 1] as const;

/**
 * Fade only exposed topology edges. A complete grid vertex belongs to six
 * triangles; lower incidence identifies sheet outlines and rejected seams.
 * Two synchronous neighbour passes form a short, deterministic inner ramp.
 */
function surfaceEdgeFades(
  vertexCount: number,
  indices: number[],
  chaosTransitionVertices: ReadonlySet<number>,
  periodTransitionVertices: ReadonlySet<number>,
): Float32Array {
  const incidence = new Uint8Array(vertexCount);
  for (const index of indices) incidence[index] += 1;

  let rings = new Uint8Array(vertexCount);
  rings.fill(EDGE_FEATHER_LEVELS.length - 1);
  for (const edge of surfaceEdges(indices).values()) {
    if (edge.count !== 1) continue;
    if (
      (chaosTransitionVertices.has(edge.first) &&
        chaosTransitionVertices.has(edge.second)) ||
      (periodTransitionVertices.has(edge.first) &&
        periodTransitionVertices.has(edge.second))
    ) {
      continue;
    }
    rings[edge.first] = 0;
    rings[edge.second] = 0;
  }

  for (let pass = 1; pass < EDGE_FEATHER_LEVELS.length - 1; pass += 1) {
    const next = new Uint8Array(rings);
    for (let offset = 0; offset < indices.length; offset += 3) {
      relax(indices[offset], indices[offset + 1]);
      relax(indices[offset + 1], indices[offset + 2]);
      relax(indices[offset + 2], indices[offset]);
    }
    rings = next;

    function relax(left: number, right: number): void {
      next[left] = Math.min(next[left], rings[right] + 1);
      next[right] = Math.min(next[right], rings[left] + 1);
    }
  }

  return Float32Array.from(rings, (ring, vertex) =>
    incidence[vertex] === 0
      ? 0
      : periodTransitionVertices.has(vertex)
        ? 1
        : EDGE_FEATHER_LEVELS[ring]);
}

interface SurfaceEdge {
  first: number;
  second: number;
  count: number;
}

function surfaceEdges(indices: number[]): Map<string, SurfaceEdge> {
  const edges = new Map<string, SurfaceEdge>();
  for (let offset = 0; offset < indices.length; offset += 3) {
    add(indices[offset], indices[offset + 1]);
    add(indices[offset + 1], indices[offset + 2]);
    add(indices[offset + 2], indices[offset]);
  }
  return edges;

  function add(left: number, right: number): void {
    const first = Math.min(left, right);
    const second = Math.max(left, right);
    const key = `${first}:${second}`;
    const edge = edges.get(key);
    if (edge) edge.count += 1;
    else edges.set(key, { first, second, count: 1 });
  }
}

function finiteOr(value: number | undefined, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function clamp01(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 1;
}
