/**
 * K2 wet-bench contracts shared by the FE kit and (later) the server.
 * Integer units: µL (Microliters), nmol (Nanomoles; 1 mM × 1 µL = 1 nmol), µg (Micrograms), pH × 100 (CentiPh).
 */
import { z } from "zod";
import { exploreIdSchema as id, exploreLabEnvelopeSchema, observationPromptSchema } from "../explore/envelope";
import type { IndicatorId, SolidShape } from "./reagents";
import type { SpeciesId } from "./species";

export const WET_BENCH_ENGINE = "wet-bench@1.0.0" as const;
export const K2_KIT = "k2-wet-bench@1" as const;
export const K2_REACTION_CATALOG = "k2-reactions@1" as const;

export const VESSEL_KINDS = ["test_tube", "beaker_100ml", "erlenmeyer_flask_100ml", "waste_beaker"] as const;
export type VesselKind = (typeof VESSEL_KINDS)[number];

export const APPARATUS_KINDS = [
  ...VESSEL_KINDS,
  "test_tube_rack_6", "dropper_pipette", "litmus_strip_dispenser", "digital_ph_meter", "tongs", "stopper", "electronic_scale",
] as const;
export type ApparatusKind = (typeof APPARATUS_KINDS)[number];

export const MEASUREMENTS = ["ph_meter", "litmus_paper", "scale"] as const;
export type MeasurementKind = (typeof MEASUREMENTS)[number];
/** The apparatus a measurement needs on the bench. */
export const MEASUREMENT_TOOL: Record<MeasurementKind, ApparatusKind> = {
  ph_meter: "digital_ph_meter", litmus_paper: "litmus_strip_dispenser", scale: "electronic_scale",
};

export type VesselSpec = { capacityMicroliters: number; tareMicrograms: number; stopperable: boolean };
/** Technical presentation assumptions for K2 glassware (not reviewed laboratory data). */
export const VESSEL_SPECS: Record<VesselKind, VesselSpec> = {
  test_tube: { capacityMicroliters: 10_000, tareMicrograms: 15_000_000, stopperable: false },
  beaker_100ml: { capacityMicroliters: 100_000, tareMicrograms: 50_000_000, stopperable: false },
  erlenmeyer_flask_100ml: { capacityMicroliters: 100_000, tareMicrograms: 60_000_000, stopperable: true },
  waste_beaker: { capacityMicroliters: 500_000, tareMicrograms: 80_000_000, stopperable: false },
};

export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_liquid"), vesselId: id, reagentId: id, microliters: z.number().int().min(1).max(100_000) }).strict(),
  z.object({ type: z.literal("add_indicator"), vesselId: id, reagentId: id, drops: z.number().int().min(1).max(20) }).strict(),
  z.object({ type: z.literal("add_solid"), vesselId: id, reagentId: id, pieces: z.number().int().min(1).max(5) }).strict(),
  z.object({ type: z.literal("pour_all"), fromVesselId: id, toVesselId: id }).strict(),
  z.object({ type: z.literal("toggle_stopper"), vesselId: id }).strict(),
  z.object({ type: z.literal("empty_vessel"), vesselId: id }).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;

const promptSchema = observationPromptSchema.extend({
  focus: z.object({ apparatusId: id.optional(), reagentId: id.optional() }).strict().optional(),
  highlightWhen: z.object({ reaction: z.string().optional(), measurement: z.enum(MEASUREMENTS).optional() }).strict().optional(),
});

/**
 * Class Explore template (P0 C3.1): what a teacher may choose when assigning this Lab. NexaLab authors it and it is
 * pinned with the Lab version; the teacher only picks inside it, by id.
 */
export const classTemplateSchema = z.object({
  id,
  titleVi: z.string().trim().min(1).max(120),
  /** Apparatus (by config id) that is always on the bench; nothing else is. */
  requiredApparatusIds: z.array(id).min(1).max(24),
  /** Allow-lists of reagents: the teacher picks exactly `count` of `options` per group. */
  reagentGroups: z.array(z.object({
    id, labelVi: z.string().trim().min(1).max(120), options: z.array(id).min(1).max(8), count: z.number().int().min(1).max(8),
  }).strict()).min(1).max(2),
  /** Prompts the teacher may attach (ids of `pedagogy.observationPrompts`). `onlyWithReagents` limits a prompt whose wording names substances. */
  promptChoices: z.array(z.object({ promptId: id, onlyWithReagents: z.array(id).max(8).optional() }).strict()).min(1).max(4),
  /** `measure`: the pH of each reagent picked in `perGroup`; `explain`: one free-text explanation. */
  requirements: z.object({
    measure: z.object({ measurement: z.literal("ph_meter"), perGroup: id }).strict().optional(),
    explain: z.boolean(),
  }).strict(),
  /** Reactions the requirements need to be able to happen; strict validation turns "cannot happen" into an error for these. */
  requiresReactions: z.array(z.string()).max(8).optional(),
}).strict();
export type ClassTemplate = z.infer<typeof classTemplateSchema>;

export const chemistryLabConfigSchema = exploreLabEnvelopeSchema.extend({
  schema: z.literal("k2-lab-config/1"),
  kit: z.literal(K2_KIT),
  engine: z.literal(WET_BENCH_ENGINE),
  reactionCatalog: z.literal(K2_REACTION_CATALOG),
  enabledApparatus: z.array(exploreLabEnvelopeSchema.shape.enabledApparatus.element.extend({
    kind: z.enum(APPARATUS_KINDS),
    initial: z.object({
      contents: z.array(z.object({ reagentId: id, microliters: z.number().int().positive().optional(), pieces: z.number().int().positive().optional() }).strict()).optional(),
      stoppered: z.boolean().optional(),
    }).strict().optional(),
  })).min(1).max(24),
  availableReagents: z.array(z.object({ reagentId: id, shelfPosition: z.number().int().min(1).max(8) }).strict()).min(1).max(8),
  allowedReactions: z.array(z.string()).max(20),
  measurements: z.array(z.enum(MEASUREMENTS)),
  dispensing: z.object({ liquidPresetsMicroliters: z.array(z.number().int().positive()).min(1).max(5) }).strict(),
  pedagogy: exploreLabEnvelopeSchema.shape.pedagogy.extend({
    revealEquations: z.enum(["never", "after_observation", "always"]),
    observationPrompts: z.array(promptSchema).max(8).optional(),
  }),
  classTemplates: z.array(classTemplateSchema).max(4).optional(),
});
export type ChemistryLabConfig = z.infer<typeof chemistryLabConfigSchema>;
export type ObservationPrompt = NonNullable<ChemistryLabConfig["pedagogy"]["observationPrompts"]>[number];

export type SolidPiece = {
  pieceId: string;
  species: SpeciesId;
  shape: SolidShape;
  nanomoles: number;
  initialNanomoles: number;
  coating: { species: SpeciesId; nanomoles: number } | null;
};

export type VesselState = {
  vesselId: string;
  kind: VesselKind;
  capacityMicroliters: number;
  tareMicrograms: number;
  stopperable: boolean;
  stoppered: boolean;
  solutionMicroliters: number;
  /** Formal (analytical) amounts in nmol. */
  dissolved: Partial<Record<SpeciesId, number>>;
  solids: SolidPiece[];
  precipitates: Partial<Record<SpeciesId, number>>;
  trappedGas: Partial<Record<SpeciesId, number>>;
  indicatorDrops: Partial<Record<IndicatorId, number>>;
  /** Mass bookkeeping: everything added, minus gas that escaped an open vessel. */
  contentMicrograms: number;
  /** What the learner put in, by bottle (shown without revealing products). */
  added: Record<string, { microliters: number; pieces: number; drops: number }>;
};

export type Bench = { vessels: Record<string, VesselState>; nextPiece: number };

export type OutOfScope = {
  code: "PAIR_NOT_IN_LAB_SCOPE" | "PAIR_UNREVIEWED";
  vesselId: string;
  species: [SpeciesId, SpeciesId];
  reasonVi?: string;
};

export type Transition = {
  vesselId: string;
  fired: Array<{ reactionId: string; extentNanomoles: number }>;
  gasProducedNanomoles: Partial<Record<SpeciesId, number>>;
  gasEscapedMicrograms: number;
};

export type ApplyResult =
  | { status: "applied"; bench: Bench; transitions: Transition[] }
  | { status: "out_of_scope"; bench: Bench; outOfScope: OutOfScope }
  | { status: "rejected"; code: "INVALID_OPERATION" | "UNKNOWN_VESSEL" | "UNKNOWN_REAGENT" | "REAGENT_NOT_AVAILABLE" | "WRONG_REAGENT_FORM" | "VESSEL_FULL" | "NOT_STOPPERABLE" | "EMPTY_SOURCE" | "SAME_VESSEL" };

export type MeasurementResult =
  | { kind: "ph_meter"; ok: true; tenthsPh: number; centiPh: number }
  | { kind: "litmus_paper"; ok: true; colour: "red" | "purple" | "blue"; centiPh: number }
  | { kind: "ph_meter" | "litmus_paper"; ok: false; code: "NO_SOLUTION" | "PH_UNMODELED" };

export type VesselVisualState = {
  liquidLevel: number;
  liquidTint: { color: string; opacity: number } | null;
  indicator: { id: IndicatorId; band: "colourless" | "light_pink" | "deep_pink" | "unknown" } | null;
  gasBubbles: { intensity: "none" | "low" | "medium" | "vigorous"; gasId: SpeciesId | null };
  precipitate: { color: string; amount: number; species: SpeciesId } | null;
  solids: Array<{ pieceId: string; species: SpeciesId; shape: SolidShape; remainingRatio: number; coatingColor: string | null }>;
  stoppered: boolean;
};

export type ReactionObservation = {
  vesselId: string;
  visual: VesselVisualState;
  contentMicrograms: number;
  totalMicrograms: number;
  engine: typeof WET_BENCH_ENGINE;
};
