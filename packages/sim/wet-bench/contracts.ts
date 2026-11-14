/**
 * K2 wet-bench contracts shared by the FE kit and (later) the server.
 * Integer units: µL (Microliters), nmol (Nanomoles; 1 mM × 1 µL = 1 nmol), µg (Micrograms), pH × 100 (CentiPh).
 */
import { z } from "zod";
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

const id = z.string().regex(/^[A-Za-z0-9_.-]{1,64}$/);
const text = z.string().trim().min(1).max(600);

export const operationSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("add_liquid"), vesselId: id, reagentId: id, microliters: z.number().int().min(1).max(100_000) }).strict(),
  z.object({ type: z.literal("add_indicator"), vesselId: id, reagentId: id, drops: z.number().int().min(1).max(20) }).strict(),
  z.object({ type: z.literal("add_solid"), vesselId: id, reagentId: id, pieces: z.number().int().min(1).max(5) }).strict(),
  z.object({ type: z.literal("pour_all"), fromVesselId: id, toVesselId: id }).strict(),
  z.object({ type: z.literal("toggle_stopper"), vesselId: id }).strict(),
  z.object({ type: z.literal("empty_vessel"), vesselId: id }).strict(),
]);
export type Operation = z.infer<typeof operationSchema>;

const promptSchema = z.object({
  id,
  kind: z.enum(["note", "choice", "free_text"]),
  textVi: text,
  challenge: z.boolean().optional(),
  choices: z.array(z.object({ id, labelVi: text }).strict()).min(2).max(6).optional(),
  focus: z.object({ apparatusId: id.optional(), reagentId: id.optional() }).strict().optional(),
  highlightWhen: z.object({ reaction: z.string().optional(), measurement: z.enum(MEASUREMENTS).optional() }).strict().optional(),
}).strict();

export const chemistryLabConfigSchema = z.object({
  schema: z.literal("k2-lab-config/1"),
  labId: id,
  catalogId: z.string().regex(/^FL-\d{2}[a-z]?$/),
  configVersion: z.number().int().positive(),
  kit: z.literal(K2_KIT),
  engine: z.literal(WET_BENCH_ENGINE),
  reactionCatalog: z.literal(K2_REACTION_CATALOG),
  title: text,
  contextLabel: z.string().max(120).optional(),
  outcomeSummary: z.array(text).min(1).max(4),
  safetyBriefing: z.object({ simulation: z.array(text).min(1), realLab: z.array(text).min(1), acknowledgeRequired: z.boolean() }).strict(),
  limitations: z.array(text),
  modes: z.object({ explore: z.literal(true), guided: z.object({ rendererKey: id }).strict().optional() }).strict(),
  enabledApparatus: z.array(z.object({
    id,
    kind: z.enum(APPARATUS_KINDS),
    slot: id,
    labelVi: z.string().max(60).optional(),
    initial: z.object({
      contents: z.array(z.object({ reagentId: id, microliters: z.number().int().positive().optional(), pieces: z.number().int().positive().optional() }).strict()).optional(),
      stoppered: z.boolean().optional(),
    }).strict().optional(),
  }).strict()).min(1).max(24),
  availableReagents: z.array(z.object({ reagentId: id, shelfPosition: z.number().int().min(1).max(8) }).strict()).min(1).max(8),
  allowedReactions: z.array(z.string()).max(20),
  measurements: z.array(z.enum(MEASUREMENTS)),
  dispensing: z.object({ liquidPresetsMicroliters: z.array(z.number().int().positive()).min(1).max(5) }).strict(),
  pedagogy: z.object({
    revealEquations: z.enum(["never", "after_observation", "always"]),
    observationPrompts: z.array(promptSchema).max(8).optional(),
  }).strict(),
  review: z.object({ status: z.enum(["draft", "reviewed"]), notes: z.string().max(600).optional() }).strict(),
}).strict();
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
