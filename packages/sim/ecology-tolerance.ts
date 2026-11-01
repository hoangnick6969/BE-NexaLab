import { z } from "zod";

// FL-20 ecology-tolerance@1.0.0: one factor (water temperature) at a time,
// population density and age-structure classification. Temperatures are
// integers in tenths of a degree Celsius (5,6 °C = 56) so limits compare
// exactly; densities and ratios are reduced fractions, never floats.
// Data marked ILLUSTRATIVE is not SGK data (spec-fl-20 D-4).

type Range = { minDeciC: number; maxDeciC: number };
const SGK_B41 = "sgk-khtn8-nxbgd-2026-p0174-b0009";
const SGK_B42_TABLE = "sgk-khtn8-nxbgd-2026-p0177-b0008";

export const ECOLOGY_SPECIES = {
  "ca-ro-phi": { limits: { minDeciC: 56, maxDeciC: 420 }, source: SGK_B41 },
  "fish-a": { limits: { minDeciC: 100, maxDeciC: 400 }, source: "ILLUSTRATIVE" },
  "fish-b": { limits: { minDeciC: 20, maxDeciC: 380 }, source: "ILLUSTRATIVE" },
  "fish-c": { limits: { minDeciC: 50, maxDeciC: 300 }, source: "ILLUSTRATIVE" },
} as const;
export const ECOLOGY_SITES = {
  "site-demo": { range: { minDeciC: 80, maxDeciC: 360 }, candidates: ["fish-a", "fish-b", "fish-c"], source: "ILLUSTRATIVE" },
} as const;
export const ECOLOGY_POPULATIONS = {
  "lim-xanh": { count: 11250, amount: 15, unit: "ha", source: SGK_B42_TABLE },
  "bap-cai": { count: 3000, amount: 750, unit: "m2", source: SGK_B42_TABLE },
  "ca-chep": { count: 120000, amount: 60000, unit: "m3", source: SGK_B42_TABLE },
} as const;
export const ECOLOGY_AGE_SAMPLES = {
  P1: { pre: 50, reproductive: 35, post: 15, source: "ILLUSTRATIVE" },
  P2: { pre: 38, reproductive: 40, post: 22, source: "ILLUSTRATIVE" },
  P3: { pre: 20, reproductive: 45, post: 35, source: "ILLUSTRATIVE" },
} as const;

const ids = <T extends object>(table: T) => Object.keys(table) as [Extract<keyof T, string>, ...Extract<keyof T, string>[]];
const toleranceSpecies = z.literal("ca-ro-phi");
export const ecologyToleranceSchema = z.discriminatedUnion("setup", [
  z.object({ setup: z.literal("tolerance"), speciesId: toleranceSpecies, factor: z.literal("TEMPERATURE"), valueDeciC: z.number().int().min(0).max(500) }).strict(),
  z.object({ setup: z.literal("tolerance-sweep"), speciesId: toleranceSpecies, factor: z.literal("TEMPERATURE") }).strict(),
  z.object({ setup: z.literal("import-comparison"), siteId: z.enum(ids(ECOLOGY_SITES)), factor: z.literal("TEMPERATURE") }).strict(),
  z.object({ setup: z.literal("density"), populationId: z.enum(ids(ECOLOGY_POPULATIONS)) }).strict(),
  z.object({ setup: z.literal("age-structure"), sampleId: z.enum(ids(ECOLOGY_AGE_SAMPLES)) }).strict(),
]);
export type EcologyToleranceState = z.infer<typeof ecologyToleranceSchema>;
export type Fraction = { num: number; den: number };

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
export const fraction = (num: number, den: number): Fraction => {
  const divisor = gcd(num, den) || 1;
  return { num: num / divisor, den: den / divisor };
};
/** a ≥ b for non-negative fractions, by cross-multiplication. */
const atLeast = (a: Fraction, b: Fraction) => a.num * b.den >= b.num * a.den;
const copy = (range: Range): Range => ({ minDeciC: range.minDeciC, maxDeciC: range.maxDeciC });

/** Age-pyramid thresholds on pre-reproductive / reproductive (spec-fl-20 D-5). */
export const PYRAMID_GROWING_AT: Fraction = { num: 6, den: 5 };
export const PYRAMID_DECLINING_AT: Fraction = { num: 4, den: 5 };
export const pyramidFor = (ratio: Fraction) =>
  atLeast(ratio, PYRAMID_GROWING_AT) ? "GROWING" as const : atLeast(PYRAMID_DECLINING_AT, ratio) ? "DECLINING" as const : "STABLE" as const;

export function ecologyTolerance(raw: unknown) {
  const state = ecologyToleranceSchema.parse(raw);
  if (state.setup === "tolerance") {
    const limits = ECOLOGY_SPECIES[state.speciesId].limits;
    // Both limits are inside the tolerance range (spec-fl-20 D-7).
    const zone = state.valueDeciC < limits.minDeciC ? "BELOW_MIN" as const : state.valueDeciC > limits.maxDeciC ? "ABOVE_MAX" as const : "WITHIN" as const;
    return { version: "1.0.0", setup: "tolerance" as const, zone, canPersist: zone === "WITHIN", limits: copy(limits) };
  }
  if (state.setup === "tolerance-sweep") {
    const limits = ECOLOGY_SPECIES[state.speciesId].limits;
    return { version: "1.0.0", setup: "tolerance-sweep" as const, limits: copy(limits), widthDeciC: limits.maxDeciC - limits.minDeciC };
  }
  if (state.setup === "import-comparison") {
    const site = ECOLOGY_SITES[state.siteId];
    return {
      version: "1.0.0",
      setup: "import-comparison" as const,
      site: copy(site.range),
      candidates: site.candidates.map((speciesId) => {
        const limits = ECOLOGY_SPECIES[speciesId].limits;
        const cold = site.range.minDeciC < limits.minDeciC, heat = site.range.maxDeciC > limits.maxDeciC;
        return { speciesId, limits: copy(limits), suitable: !cold && !heat, failsOn: cold && heat ? "BOTH" as const : cold ? "COLD" as const : heat ? "HEAT" as const : null };
      }),
    };
  }
  if (state.setup === "density") {
    const population = ECOLOGY_POPULATIONS[state.populationId];
    return { version: "1.0.0", setup: "density" as const, count: population.count, amount: population.amount, unit: population.unit, density: fraction(population.count, population.amount) };
  }
  const sample = ECOLOGY_AGE_SAMPLES[state.sampleId];
  const ratio = fraction(sample.pre, sample.reproductive);
  return {
    version: "1.0.0",
    setup: "age-structure" as const,
    counts: { pre: sample.pre, reproductive: sample.reproductive, post: sample.post },
    ratio,
    pyramid: pyramidFor(ratio),
  };
}
