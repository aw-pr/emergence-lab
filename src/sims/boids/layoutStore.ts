export interface CustomObstacleLayoutSlot {
  name: string;
  layout: string;
}

export function upsertObstacleLayoutSlot(
  slots: readonly CustomObstacleLayoutSlot[],
  name: string,
  layout: string,
): CustomObstacleLayoutSlot[] {
  const next = slots.map((slot) => ({ ...slot }));
  const existing = next.findIndex((slot) => slot.name === name);
  if (existing >= 0) {
    next[existing] = { name, layout };
  } else {
    next.push({ name, layout });
  }
  return next;
}

export function removeObstacleLayoutSlot(
  slots: readonly CustomObstacleLayoutSlot[],
  name: string,
): CustomObstacleLayoutSlot[] {
  return slots
    .filter((slot) => slot.name !== name)
    .map((slot) => ({ ...slot }));
}
