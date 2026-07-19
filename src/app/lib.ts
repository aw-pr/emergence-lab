/**
 * Library entry for host sites (built by vite.lib.config.ts, published next to
 * the static app). Exposes the lab as a web component plus the imperative
 * mount and the canonical registry, so a host page can embed simulations
 * inline instead of framing the app.
 */
export { defineLabElement, LAB_ELEMENT_TAG } from "./element.ts";
export { mountLab } from "./mount.ts";
export type { LabMountHandle, MountLabOptions } from "./mount.ts";
export { REGISTRY, findEntry } from "./registry.ts";
export type { SimEntry, SimVariant } from "./registry.ts";
