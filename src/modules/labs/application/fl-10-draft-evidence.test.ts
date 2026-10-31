import { describe, expect, it } from "vitest";
import { evaluateFl10Activity, evaluateFl10DraftEvidence } from "./fl-10-draft-evidence";
import { evaluateMassConservation } from "../../../../packages/sim";

const model = { beforeScaleMilligrams: 435000, afterScaleMilligrams: 435000 };
const evidence = {
  comparison: "compare.same", explanationAttempts: ["explain.rearrange"], calculation: "35-and-35",
  applicationV1: "decrease", applicationV2: "same",
};
const events = [
  { type: "PREDICTED", prediction: "predict.decrease", reason: "Sai hoàn toàn" },
  { type: "READ_BEFORE" }, { type: "MIXED" }, { type: "READ_AFTER" },
] as const;

describe("FL-10 draft criterion check", () => {
  it("does not grade prediction or free text", () => {
    const first = evaluateFl10DraftEvidence(evidence, model, events);
    const second = evaluateFl10DraftEvidence(evidence, model, [
      { type: "PREDICTED", prediction: "predict.same", reason: "Khác" }, ...events.slice(1),
    ]);
    expect(first).toEqual(second);
    expect(first).toMatchObject({ ok: true, criteria: { C1: true, C2: true, C3: true, C4: true, C5: true, C6: true } });
  });

  it("uses server model output for comparison and rejects forged fields", () => {
    expect(evaluateFl10DraftEvidence(evidence, { ...model, afterScaleMilligrams: 434000 }, events))
      .toMatchObject({ ok: true, criteria: { C3: false } });
    expect(evaluateFl10DraftEvidence({ ...evidence, beforeScaleMilligrams: 435000 }, model, events))
      .toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(evaluateFl10DraftEvidence(evidence, { ...model, afterScaleMilligrams: Number.NaN }, events))
      .toEqual({ ok: false, code: "INVALID_MODEL_OUTPUT" });
    expect(evaluateFl10DraftEvidence(evidence, model, events.slice(0, 2)))
      .toMatchObject({ ok: true, criteria: { C2: false } });
    expect(evaluateFl10DraftEvidence({ ...evidence, prediction: "predict.same" }, model, events))
      .toEqual({ ok: false, code: "INVALID_EVIDENCE" });
    expect(evaluateFl10DraftEvidence({ ...evidence, explanationAttempts: ["explain.solid_not_weighed", "explain.rearrange"] }, model, events))
      .toMatchObject({ ok: true, criteria: { C4: true } });
  });

  it("produces a versioned rubric result from pinned model output and server events", () => {
    const mass = evaluateMassConservation({ fixtureId: "barium-precipitation-reference-v1",
      cup1Milligrams: 100000, cup2Milligrams: 100000, solvent1Milligrams: 100000, solvent2Milligrams: 100000 });
    expect(mass.ok).toBe(true);
    if (!mass.ok) return;
    const passed = evaluateFl10Activity(evidence, mass.value, events);
    expect(passed).toMatchObject({ verdict: "passed", result: {
      version: "1.0.0", scientificObservation: { beforeScaleMilligrams: 435000, afterScaleMilligrams: 435000 },
      assessment: { explanationAttempts: 1, passed: true },
    } });
    expect(evaluateFl10Activity({ ...evidence, comparison: "compare.increase" }, mass.value, events).verdict).toBe("needs_practice");
    expect(() => evaluateFl10Activity(evidence, mass.value, events.slice(0, 3))).toThrow(/incomplete/);
  });
});
