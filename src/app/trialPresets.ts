import { defaultColourOptionsFor } from "./colormap.ts";
import { qualityProfileFor } from "./qualityProfiles.ts";
import { getRenderMode } from "./renderModes.ts";
import { findEntry } from "./registry.ts";
import { defaultDisplayOptionsFor, speedProfileFor, type SavedPreset } from "./savedPresets.ts";
import type { SimParams } from "./types.ts";

export interface TrialPreset extends SavedPreset {
  row: string;
  sourceId: string;
}

const SOURCES: readonly { slug: string; name: string; row: string; params: SimParams }[] = [
  {"slug": "physarum", "name": "Slow branching trails", "row": "evaporation0.975_depositAmount0.6_moveSpeed0.5_sensorDistance14_sensorAngle8", "params": {"agentCount": 32000, "turnSpeed": 22.5, "stepsPerFrame": 1, "seed": 144, "evaporation": 0.975, "depositAmount": 0.6, "moveSpeed": 0.5, "sensorDistance": 14, "sensorAngle": 8}},
  {"slug": "physarum", "name": "Wide sensing currents", "row": "evaporation0.8_depositAmount0.6_moveSpeed2.5_sensorDistance14_sensorAngle80", "params": {"agentCount": 32000, "turnSpeed": 22.5, "stepsPerFrame": 1, "seed": 144, "evaporation": 0.8, "depositAmount": 0.6, "moveSpeed": 2.5, "sensorDistance": 14, "sensorAngle": 80}},
  {"slug": "physarum", "name": "Fine restless threads", "row": "evaporation0.975_depositAmount0.06_moveSpeed2.5_sensorDistance3_sensorAngle30", "params": {"agentCount": 32000, "turnSpeed": 22.5, "stepsPerFrame": 1, "seed": 144, "evaporation": 0.975, "depositAmount": 0.06, "moveSpeed": 2.5, "sensorDistance": 3, "sensorAngle": 30}},
  {"slug": "particle-life", "name": "Eight-species attraction", "row": "friction0.97_species8_forceScale140_matrixBias0.35", "params": {"particleCount": 6000, "rmax": 24, "rmin": 12, "seed": 144, "friction": 0.97, "species": 8, "forceScale": 140, "matrixBias": 0.35}},
  {"slug": "particle-life", "name": "Six-species pursuit", "row": "friction0.97_species6_forceScale140_matrixBias-0.35", "params": {"particleCount": 6000, "rmax": 24, "rmin": 12, "seed": 144, "friction": 0.97, "species": 6, "forceScale": 140, "matrixBias": -0.35}},
  {"slug": "particle-life", "name": "Three-species drift", "row": "friction0.1_species3_forceScale10_matrixBias-0.35", "params": {"particleCount": 6000, "rmax": 24, "rmin": 12, "seed": 144, "friction": 0.1, "species": 3, "forceScale": 10, "matrixBias": -0.35}},
  {"slug": "boids", "name": "Twelve flowing flocks", "row": "alignment0.25_cohesion0_initialFlocks12", "params": {"boidCount": 17777, "visualRadius": 36, "separationRadius": 6, "separation": 0.2, "maxSpeed": 16, "pointSize": 6, "obstacleLayout": "none", "alignment": 0.25, "cohesion": 0, "initialFlocks": 12}},
  {"slug": "boids", "name": "Six open flocks", "row": "alignment0.15_cohesion0_initialFlocks6", "params": {"boidCount": 17777, "visualRadius": 36, "separationRadius": 6, "separation": 0.2, "maxSpeed": 16, "pointSize": 6, "obstacleLayout": "none", "alignment": 0.15, "cohesion": 0, "initialFlocks": 6}},
  {"slug": "boids", "name": "One wandering flock", "row": "alignment0.01_cohesion0_initialFlocks1", "params": {"boidCount": 17777, "visualRadius": 36, "separationRadius": 6, "separation": 0.2, "maxSpeed": 16, "pointSize": 6, "obstacleLayout": "none", "alignment": 0.01, "cohesion": 0, "initialFlocks": 1}},
];

let catalogue: Promise<TrialPreset[]> | undefined;

export function trialPresets(): Promise<TrialPreset[]> {
  catalogue ??= Promise.all(SOURCES.map(async (source) => {
    const entry = findEntry(source.slug)!;
    const kernel = await entry.load();
    const params = Object.fromEntries(kernel.paramSchema.map((p) => [p.key, p.default]));
    const colourOptions = defaultColourOptionsFor(source.slug, kernel.channelCount);
    kernel.destroy();
    return {
      id: `trial-144-${source.slug}-${source.row}`,
      name: source.name,
      row: source.row,
      sourceId: `144:${source.slug}:${source.row}:shipped`,
      snapshot: {
        slug: source.slug,
        params: { ...params, ...source.params },
        colourOptions,
        displayOptions: defaultDisplayOptionsFor(source.slug),
        resolution: qualityProfileFor(source.slug, getRenderMode(source.slug), "desktop").defaultPreset,
        stepsPerFrame: speedProfileFor(source.slug).initial,
        autoCycle: false,
      },
    };
  }));
  return catalogue.then((entries) => structuredClone(entries));
}
