/**
 * Serialise the canonical sim registry to JSON on stdout. Published into the
 * host site (src/vendor/emergence-lab/registry.json) so its build can fail on
 * slug drift instead of shipping dead deep links. Node's native type
 * stripping executes registry.ts directly; kernel imports are dynamic and
 * never run here.
 */
import { REGISTRY } from "../src/app/registry.ts";

const entries = REGISTRY.map((entry) => ({
  slug: entry.slug,
  name: entry.name,
  family: entry.family ?? null,
  subtitle: entry.subtitle ?? null,
  description: entry.description ?? null,
  variants: (entry.variants ?? []).map((variant) => ({
    variant: variant.variant,
    name: variant.name,
    subtitle: variant.subtitle ?? null,
    description: variant.description ?? null,
  })),
}));

process.stdout.write(`${JSON.stringify({ sims: entries }, null, 2)}\n`);
