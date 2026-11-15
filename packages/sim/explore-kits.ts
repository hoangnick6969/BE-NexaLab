import { z } from "zod";
import { exploreLabEnvelopeSchema } from "./explore/envelope";
import { ecologyTolerance } from "./ecology-tolerance";
import { FOOD_WEB_SPECIES, foodWeb } from "./food-web";
import { GENE_VARIANT_IDS, geneExpression } from "./gene-expression";

/**
 * Explore configs for the INC-3 benches (D2-3.1, D2-3.2). Each bench is the Explore envelope plus one
 * `spec` block that limits what a student may pick; the answers come from the released models above,
 * never from the config. Models: food-web@1.0.0 (FL-21), ecology-tolerance@1.0.0 (FL-20),
 * gene-expression@1.0.0 (FL-27), eye-optics@1.0.0 (FL-16, Explore studio). All values stay
 * PROPOSED_UNAPPROVED until a reviewer signs the release digest.
 */

const removable = Object.keys(FOOD_WEB_SPECIES).filter((id) => FOOD_WEB_SPECIES[id as keyof typeof FOOD_WEB_SPECIES].role !== "DECOMPOSER") as [string, ...string[]];
import { EYE_OPTICS_SCENARIOS, requiredPowerD } from "./eye-optics";
const scenarioIds = EYE_OPTICS_SCENARIOS.map((scenario) => scenario.id) as [string, ...string[]];

const removalSpec = z.object({
  model: z.literal("food-web@1.0.0"),
  allowedRemovals: z.array(z.enum(removable as [string, ...string[]])).min(1).max(10),
}).strict();
const toleranceSpec = z.object({
  model: z.literal("ecology-tolerance@1.0.0"),
  // The released tolerance model is pinned to the bundled species (spec-fl-20 D-7).
  allowedSpecies: z.array(z.literal("ca-ro-phi")).length(1),
  factor: z.literal("TEMPERATURE"),
}).strict();
const variantSpec = z.object({
  model: z.literal("gene-expression@1.0.0"),
  allowedVariants: z.array(z.enum(GENE_VARIANT_IDS)).min(1).max(8),
}).strict();
const scenarioSpec = z.object({
  model: z.literal("eye-optics@1.0.0"),
  allowedScenarios: z.array(z.enum(scenarioIds)).min(1).max(3),
}).strict();

/** FL-21 food web and FL-20 ecology tolerance share kit `k8-diorama`; the catalog id picks the model. */
export const fl21ExploreSchema = exploreLabEnvelopeSchema.extend({ catalogId: z.literal("FL-21"), kit: z.literal("k8-diorama"), spec: removalSpec }).strict();
export const fl20ExploreSchema = exploreLabEnvelopeSchema.extend({ catalogId: z.literal("FL-20"), kit: z.literal("k8-diorama"), spec: toleranceSpec }).strict();
export const dioramaExploreSchema = z.discriminatedUnion("catalogId", [fl20ExploreSchema, fl21ExploreSchema]);
export const fl27ExploreSchema = exploreLabEnvelopeSchema.extend({ catalogId: z.literal("FL-27"), kit: z.literal("k7-molecular"), spec: variantSpec }).strict();
export const fl16ExploreSchema = exploreLabEnvelopeSchema.extend({ catalogId: z.literal("FL-16"), kit: z.literal("anatomy"), spec: scenarioSpec }).strict();

export type DioramaExploreConfig = z.infer<typeof dioramaExploreSchema>;
export type MolecularExploreConfig = z.infer<typeof fl27ExploreSchema>;
export type AnatomyExploreConfig = z.infer<typeof fl16ExploreSchema>;

/** FL-21: the result of removing one species, from the released food-web model. */
export const fl21RemovalResult = (speciesId: string) => foodWeb({ setup: "remove", webId: "W1", speciesId });

/** FL-20: the zone of one temperature for a species, from the released ecology model (values in tenths of °C). */
export const fl20ToleranceResult = (speciesId: string, valueDeciC: number) =>
  ecologyTolerance({ setup: "tolerance", speciesId, factor: "TEMPERATURE", valueDeciC });

/** FL-27: the gene, its mRNA and the amino-acid effect of the chosen variant, from the released gene model. */
export const fl27VariantResult = (variantId: string) => geneExpression({ variantId });

/** FL-16: the power the lens needs for one scenario, from the eye-optics@1.0.0 formula (dioptres). */
export function fl16PowerResult(scenarioId: string) {
  const scenario = EYE_OPTICS_SCENARIOS.find((item) => item.id === scenarioId);
  if (!scenario) throw new Error(`Không có kịch bản ${scenarioId}`);
  return { scenarioId, powerD: requiredPowerD(scenario.axialLengthM, scenario.objectDistanceM) };
}
