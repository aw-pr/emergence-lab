export const REFINE_BUDGET_FRACTION = 0.3;

export function resolveOrbitRefinement(
  tailRefinement: number | boolean | string | undefined,
  gpuSamplerAvailable: boolean,
  realSliceOnly: boolean,
): number {
  if (realSliceOnly) return 0;
  if (typeof tailRefinement !== "number" || !Number.isFinite(tailRefinement)) {
    return REFINE_BUDGET_FRACTION;
  }
  if (!gpuSamplerAvailable && tailRefinement === 0) {
    return REFINE_BUDGET_FRACTION;
  }
  return Math.max(0, Math.min(0.6, tailRefinement));
}
