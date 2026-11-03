import { describe, expect, it } from "vitest";
import { eyeParts } from "../../../../../packages/sim";
import { eyeOpticsEvidenceSchema, isAcceptedPartName, requiredPowerD } from "../../../../../packages/sim/eye-optics";
import { evaluateEyeOpticsActivity, EYE_OPTICS_MAXIMUM_SCORE } from "./eye-anatomy-optics.evaluator";

const correctLabels = Object.fromEntries(eyeParts.map((part) => [part.id, part.name]));
const correctPhase2 = [
  { scenarioId: "normal-near", objectDistanceM: 0.25, lensPowerD: 20, glassesPowerD: 0 },
  { scenarioId: "myopia-far", objectDistanceM: null, lensPowerD: 16, glassesPowerD: -2 },
  { scenarioId: "hyperopia-near", objectDistanceM: 0.4, lensPowerD: 18.75, glassesPowerD: 3 },
] as const;

describe("eye-anatomy-optics@1.0.0", () => {
  it("passes every criterion for correct labels and in-focus accommodation with corrective lenses", () => {
    const evidence = eyeOpticsEvidenceSchema.parse({ phase1: { labels: correctLabels }, phase2: correctPhase2 });
    const { verdict, result } = evaluateEyeOpticsActivity(evidence);
    expect(result.assessment).toMatchObject({ score: EYE_OPTICS_MAXIMUM_SCORE, passed: true, phase1Score: 8, phase2Score: 3 });
    expect(verdict).toBe("passed");
  });

  it("scores phase 2 focus errors and wrong glasses sign per scenario", () => {
    const evidence = eyeOpticsEvidenceSchema.parse({
      phase1: { labels: correctLabels },
      phase2: [
        { scenarioId: "normal-near", objectDistanceM: 0.25, lensPowerD: 16, glassesPowerD: 0 },
        { scenarioId: "myopia-far", objectDistanceM: null, lensPowerD: 16, glassesPowerD: 3 },
        { scenarioId: "hyperopia-near", objectDistanceM: 0.4, lensPowerD: 18.75, glassesPowerD: 3 },
      ],
    });
    const { result } = evaluateEyeOpticsActivity(evidence);
    expect(result.assessment).toMatchObject({ phase2Score: 1 });
    expect(result.assessment.unmetCriteria).toEqual([
      "phase2:normal-near:focus",
      "phase2:myopia-far:focus+glasses",
    ]);
  });

  it("requires a relaxed lens when the object is far away", () => {
    const evidence = eyeOpticsEvidenceSchema.parse({
      phase1: { labels: correctLabels },
      phase2: [
        { scenarioId: "normal-near", objectDistanceM: 0.25, lensPowerD: 20, glassesPowerD: 0 },
        { scenarioId: "myopia-far", objectDistanceM: null, lensPowerD: 18, glassesPowerD: -4 },
        { scenarioId: "hyperopia-near", objectDistanceM: 0.4, lensPowerD: 18.75, glassesPowerD: 3 },
      ],
    });
    const { result } = evaluateEyeOpticsActivity(evidence);
    expect(result.assessment.unmetCriteria).toEqual(["phase2:myopia-far:relaxedFar"]);
  });

  it("accepts Màng lưới and Võng mạc for the retina, in any case, with or without diacritics", () => {
    for (const answer of ["Võng mạc", "Màng lưới", "MÀNG LƯỚI", "mang luoi", "  vong  mac ", "Mang Luoi"]) expect(isAcceptedPartName("retina", answer)).toBe(true);
    for (const answer of ["Màng mạch", "Võng", "lưới"]) expect(isAcceptedPartName("retina", answer)).toBe(false);
    // Parts without aliases keep the exact released name.
    expect(isAcceptedPartName("cornea", "giác mạc")).toBe(true);
    expect(isAcceptedPartName("cornea", "giac mac")).toBe(false);
  });

  it("keeps the myopia case in the mild school range (about −1.5 D to −2.5 D)", () => {
    const glassesInFocus = [-1.5, -1.75, -2, -2.25, -2.5, -2.75, -3, -1.25].filter((glassesPowerD) => {
      const evidence = eyeOpticsEvidenceSchema.parse({
        phase1: { labels: correctLabels },
        phase2: [correctPhase2[0], { scenarioId: "myopia-far", objectDistanceM: null, lensPowerD: 16, glassesPowerD }, correctPhase2[2]],
      });
      return evaluateEyeOpticsActivity(evidence).result.assessment.passed;
    });
    expect(glassesInFocus).toEqual([-1.5, -1.75, -2, -2.25]);
  });

  it("uses the reduced-eye power equation", () => {
    expect(requiredPowerD(0.0226, null)).toBeCloseTo(59.12, 1);
    expect(requiredPowerD(0.0226, 0.25)).toBeCloseTo(63.12, 1);
  });

  it("rejects duplicate scenarios and off-step lens powers", () => {
    expect(eyeOpticsEvidenceSchema.safeParse({ phase1: { labels: {} }, phase2: [correctPhase2[0], correctPhase2[0], correctPhase2[2]] }).success).toBe(false);
    expect(eyeOpticsEvidenceSchema.safeParse({ phase1: { labels: {} }, phase2: [{ ...correctPhase2[0], lensPowerD: 20.1 }, correctPhase2[1], correctPhase2[2]] }).success).toBe(false);
  });

  it("returns not_passed with no evidence", () => {
    const evidence = eyeOpticsEvidenceSchema.parse({
      phase1: { labels: {} },
      phase2: correctPhase2.map((attempt) => ({ ...attempt, lensPowerD: 16, glassesPowerD: 0, objectDistanceM: attempt.objectDistanceM })),
    });
    expect(evaluateEyeOpticsActivity(evidence).verdict).toBe("needs_practice");
  });
});
