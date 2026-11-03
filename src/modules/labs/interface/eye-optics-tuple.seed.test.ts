import { describe, expect, it } from "vitest";
import { eyeOpticsEvidenceSchema } from "../../../../packages/sim/eye-optics";
import { evaluateEyeOpticsActivity, EYE_OPTICS_MODEL } from "../application/evaluators/eye-anatomy-optics.evaluator";
import { labEvaluators } from "../application/evaluators/registry";
import { activitySpecSchema, packInputSchema, packValidation, resolveModel } from "../application/sim-packs";
import { goldenCaseResults, versionErrors, versionInputSchema } from "../application/simulation-versions";
import { EYE_OPTICS_ACTIVITY_SPEC, EYE_OPTICS_GOLDEN_CASES, EYE_OPTICS_LAB_CONFIG, EYE_OPTICS_PACK_TEMPLATE, EYE_OPTICS_RUBRIC_GOLDEN_CASES, EYE_OPTICS_TUPLE } from "./eye-optics-tuple.seed";

describe("FL-16 seed tuple", () => {
  it("rubric golden cases give the recorded verdicts", () => {
    for (const golden of EYE_OPTICS_RUBRIC_GOLDEN_CASES)
      expect(evaluateEyeOpticsActivity(eyeOpticsEvidenceSchema.parse(golden.evidence)).verdict, golden.label).toBe(golden.rubricVerdict);
  });

  it("configuration golden cases are valid model states", () => {
    for (const golden of EYE_OPTICS_GOLDEN_CASES) expect(() => resolveModel(EYE_OPTICS_MODEL).simulate(golden.labState)).not.toThrow();
  });

  it("pins the activity to the registered rubric on its own Lab, separate from legacy eye", () => {
    expect(resolveModel(EYE_OPTICS_MODEL).labId).toBe(EYE_OPTICS_TUPLE.labId);
    expect(EYE_OPTICS_TUPLE.labId).not.toBe("eye");
    expect(labEvaluators.rubricRefForActivity(EYE_OPTICS_ACTIVITY_SPEC.key, 1, EYE_OPTICS_MODEL)).toBe(EYE_OPTICS_LAB_CONFIG.rubricRef);
    expect(EYE_OPTICS_LAB_CONFIG.kitId).toBe("EX-A");
  });

  it("passes the configuration checks the release draft runs (challenge parameters, golden cases)", () => {
    const input = versionInputSchema.parse({ challengeParams: { [EYE_OPTICS_TUPLE.challengeId]: {} }, goldenCases: EYE_OPTICS_GOLDEN_CASES, reason: EYE_OPTICS_LAB_CONFIG.notice });
    expect(versionErrors(EYE_OPTICS_TUPLE.labId, [EYE_OPTICS_TUPLE.challengeId], input, EYE_OPTICS_MODEL)).toEqual([]);
    expect(goldenCaseResults(EYE_OPTICS_TUPLE.labId, input, EYE_OPTICS_MODEL).every((golden) => golden.ok)).toBe(true);
  });

  it("passes the strict activity and pack validators the release review runs", () => {
    expect(activitySpecSchema.omit({ reviews: true }).safeParse(EYE_OPTICS_ACTIVITY_SPEC).success).toBe(true);
    const pack = packInputSchema.parse({
      key: EYE_OPTICS_TUPLE.packKey, labId: EYE_OPTICS_TUPLE.labId, modelRef: EYE_OPTICS_MODEL, activityVersionId: "activity",
      template: EYE_OPTICS_PACK_TEMPLATE, visualAssetVersionId: null,
      semanticMap: { cornea: "cornea", aqueous: "aqueous", pupil: "pupil", lens: "lens", vitreous: "vitreous", retina: "retina", nerve: "nerve", sclera: "sclera" },
      bindings: [], challengeTemplates: [], reason: EYE_OPTICS_LAB_CONFIG.notice,
    });
    const check = packValidation(pack, { labModelRef: EYE_OPTICS_MODEL, activity: { spec: EYE_OPTICS_ACTIVITY_SPEC }, glb: null, visualReady: true });
    expect(check.errors).toEqual([]);
  });
});
