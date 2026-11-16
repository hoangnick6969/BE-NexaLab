import { z } from "zod";
import { eyeParts } from "./eye-parts";

/**
 * eye-optics@1.0.0 — deterministic reduced-eye model for the FL-16 Lab.
 *
 * Power bookkeeping (thin-element approximation, vertex distance ignored):
 *   required power for an image on the retina  P_req = n / L + 1 / d
 *     n = 1.336 (vitreous), L = axial length (m), d = object distance (m), 1/∞ = 0
 *   provided power  P = P_glasses + P_cornea + P_lens
 *   defocus         D = P - P_req   (|D| ≤ tolerance means the image falls on the retina)
 *
 * The model only reports observations. The rubric (eye-anatomy-optics@1.0.0)
 * decides what they are worth, so scientific output and scoring stay separate.
 * Constants are software assumptions for a reduced eye, not expert-approved data.
 */

export const EYE_OPTICS_MODEL_VERSION = "1.0.0" as const;
export const VITREOUS_INDEX = 1.336;
export const CORNEA_POWER_D = 43;
export const LENS_POWER_RANGE_D = { min: 16, max: 26 } as const;
export const RELAXED_LENS_MAX_D = 16.5;
export const FOCUS_TOLERANCE_D = 0.5;
export const DISTANCE_TOLERANCE_M = 0.02;
export const DISTANCE_RANGE_M = { min: 0.1, max: 6 } as const;
export const POWER_STEP_D = 0.25;
export const GLASSES_POWER_RANGE_D = { min: -10, max: 10 } as const;

export const EYE_OPTICS_SCENARIOS = [
  { id: "normal-near", label: "Mắt bình thường, nhìn vật gần 25 cm", axialLengthM: 0.0226, objectDistanceM: 0.25, ametropia: "none" },
  // Mild school myopia: about −1.9 D with a relaxed lens; −1.50 D to −2.25 D passes (−2.75 D if the lens is at its 16.5 D limit).
  { id: "myopia-far", label: "Mắt cận thị nhẹ (khoảng −2 D), nhìn vật ở xa vô cực", axialLengthM: 0.0234, objectDistanceM: null, ametropia: "myopia" },
  { id: "hyperopia-near", label: "Mắt viễn thị, nhìn vật gần 40 cm", axialLengthM: 0.0215, objectDistanceM: 0.4, ametropia: "hyperopia" },
] as const;

export type EyeOpticsScenarioId = (typeof EYE_OPTICS_SCENARIOS)[number]["id"];
export const EYE_OPTICS_PART_IDS = eyeParts.map((part) => part.id);

const onStep = (value: number) => Math.abs(Math.round(value / POWER_STEP_D) * POWER_STEP_D - value) < 1e-9;

/** Phase 1 labels are keyed by part id; phase 2 submits one attempt per scenario. */
export const eyeOpticsEvidenceSchema = z.object({
  phase1: z.object({ labels: z.record(z.string().max(100)) }).strict(),
  phase2: z.array(z.object({
    scenarioId: z.enum(["normal-near", "myopia-far", "hyperopia-near"]),
    objectDistanceM: z.number().min(DISTANCE_RANGE_M.min).max(DISTANCE_RANGE_M.max).nullable(),
    lensPowerD: z.number().min(LENS_POWER_RANGE_D.min).max(LENS_POWER_RANGE_D.max).refine(onStep, "bước 0,25 D"),
    glassesPowerD: z.number().min(GLASSES_POWER_RANGE_D.min).max(GLASSES_POWER_RANGE_D.max).refine(onStep, "bước 0,25 D"),
  }).strict()).length(EYE_OPTICS_SCENARIOS.length),
}).strict()
  .refine((evidence) => new Set(evidence.phase2.map((attempt) => attempt.scenarioId)).size === EYE_OPTICS_SCENARIOS.length, "Each scenario must be answered once")
  .refine((evidence) => JSON.stringify(evidence).length <= 20000, "Evidence is too large");

export type EyeOpticsEvidence = z.infer<typeof eyeOpticsEvidenceSchema>;

export function requiredPowerD(axialLengthM: number, objectDistanceM: number | null) {
  return VITREOUS_INDEX / axialLengthM + (objectDistanceM === null ? 0 : 1 / objectDistanceM);
}

/**
 * Accepted textbook synonyms. A part listed here is matched against every alias,
 * ignoring case and Vietnamese diacritics; other parts keep the exact
 * (case-insensitive) name of the released eye@1.0.0 check.
 */
export const EYE_OPTICS_ANSWER_ALIASES: Readonly<Record<string, readonly string[]>> = {
  retina: ["Võng mạc", "Màng lưới"],
};

const normalize = (value: string) => value.trim().toLocaleLowerCase("vi").normalize("NFC");
/** Lower case without diacritics: "Màng Lưới", "mang luoi" and "MÀNG LƯỚI" all fold to "mang luoi". */
export const foldVietnamese = (value: string) =>
  normalize(value).normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/đ/g, "d").replace(/\s+/g, " ");

export function isAcceptedPartName(partId: string, answer: string) {
  const aliases = EYE_OPTICS_ANSWER_ALIASES[partId];
  if (aliases) return aliases.some((alias) => foldVietnamese(alias) === foldVietnamese(answer));
  const part = eyeParts.find((item) => item.id === partId);
  return Boolean(part) && normalize(answer) === normalize(part!.name);
}

/** Phase 1: one criterion per part; see isAcceptedPartName for the matching rule. */
export function observePhase1(labels: Record<string, string>) {
  const correct = eyeParts
    .filter((part) => isAcceptedPartName(part.id, labels[part.id] ?? ""))
    .map((part) => part.id);
  return { correct, total: eyeParts.length };
}

/** Phase 2: optical observations for each submitted attempt. */
export function observePhase2(attempts: EyeOpticsEvidence["phase2"]) {
  return attempts.map((attempt) => {
    const scenario = EYE_OPTICS_SCENARIOS.find((item) => item.id === attempt.scenarioId)!;
    const requiredPower = requiredPowerD(scenario.axialLengthM, scenario.objectDistanceM);
    const providedPower = attempt.glassesPowerD + CORNEA_POWER_D + attempt.lensPowerD;
    const defocusD = providedPower - requiredPower;
    return {
      scenarioId: attempt.scenarioId,
      requiredPowerD: round(requiredPower),
      providedPowerD: round(providedPower),
      defocusD: round(defocusD),
      inFocus: Math.abs(defocusD) <= FOCUS_TOLERANCE_D + 1e-9,
      distanceMatches: attempt.objectDistanceM === scenario.objectDistanceM
        || (attempt.objectDistanceM !== null && scenario.objectDistanceM !== null && Math.abs(attempt.objectDistanceM - scenario.objectDistanceM) <= DISTANCE_TOLERANCE_M),
      relaxedWhenFar: scenario.objectDistanceM !== null || attempt.lensPowerD <= RELAXED_LENS_MAX_D,
      glassesMatchAmetropia: scenario.ametropia === "none"
        ? Math.abs(attempt.glassesPowerD) <= POWER_STEP_D
        : scenario.ametropia === "myopia" ? attempt.glassesPowerD <= -POWER_STEP_D : attempt.glassesPowerD >= POWER_STEP_D,
    };
  });
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export function eyeOptics(raw: unknown) {
  const evidence = eyeOpticsEvidenceSchema.parse(raw);
  return {
    version: EYE_OPTICS_MODEL_VERSION,
    phase1: observePhase1(evidence.phase1.labels),
    phase2: observePhase2(evidence.phase2),
  };
}
