import { describe, expect, it } from "vitest";
import {
  attribution,
  challengeObjective,
  challengeParamErrors,
  evaluateChallenge,
  isStructureChange,
  labVersion,
  lessonVersion,
  publishBlockers,
  variantChallengeId,
} from "./lesson-content";
import { circuit } from "../../../../packages/sim";

const review = {
  sources: "SGK KHTN 8 và tài liệu tự biên soạn",
  license: "ORIGINAL" as const,
  outcome: "Lắp mạch điện an toàn",
  answerKeyChecked: true,
  safetyChecked: true,
  accessibilityChecked: true,
};
const lesson = {
  title: "Mạch điện",
  subjectId: "physics",
  chapter: "Điện",
  grade: 8,
  topic: "Định luật Ohm",
  learningObjective: "Lắp mạch kín",
  content: "<p>Nội dung</p>",
  materials: [],
  questions: [{ prompt: "?", options: ["a", "b"], answer: 0 }],
  labId: "circuit",
  review,
};
const ledCircuit = (ohms: number, leds = 1) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    { id: "r", type: "resistor", value: ohms },
    ...Array.from({ length: leds }, (_, i) => ({ id: "l" + i, type: "led" })),
  ],
  edges: [
    { source: "b", target: "r" },
    { source: "r", target: "l0" },
    ...Array.from({ length: leds - 1 }, (_, i) => ({ source: "l" + i, target: "l" + (i + 1) })),
    { source: "l" + (leds - 1), target: "b" },
  ],
});

describe("challenge parameters (B1-T4)", () => {
  it("accepts in-range values and rejects out-of-range, off-step, unknown and lab-less parameters", () => {
    expect(challengeParamErrors("circuit", { maxCurrentMa: 10, minLitLeds: 2 })).toEqual([]);
    expect(challengeParamErrors("circuit", { maxCurrentMa: 25 })[0]).toMatch(/5 đến 20 mA/);
    expect(challengeParamErrors("circuit", { maxCurrentMa: 10.5 })[0]).toMatch(/bước/);
    expect(challengeParamErrors("circuit", { voltage: 30 })[0]).toMatch(/không được phép/);
    expect(challengeParamErrors("chemistry", { reactionId: "nope" })[0]).toMatch(/danh sách/);
    expect(challengeParamErrors(null, { maxCurrentMa: 10 })[0]).toMatch(/phòng thực hành/);
    expect(challengeParamErrors("circuit", {})).toHaveLength(1);
    expect(challengeParamErrors("circuit", null)).toEqual([]);
  });

  it("tightens success without changing the scientific model output", () => {
    // 9 V, 1 LED, 470 Ω → (9 − 2) / 470 ≈ 14.9 mA: passes the default 20 mA model.
    const result = circuit(ledCircuit(470));
    expect(result.verdict).toBe("passed");
    expect(evaluateChallenge("circuit", null, result, { maxCurrentMa: 20 }).verdict).toBe("passed");
    const strict = evaluateChallenge("circuit", null, result, { maxCurrentMa: 10 });
    expect(strict).toMatchObject({ verdict: "partial", check: { unmet: ["maxCurrentMa"] } });
    expect(evaluateChallenge("circuit", null, result, { minLitLeds: 2 }).check?.unmet).toEqual(["minLitLeds"]);
    expect(evaluateChallenge("circuit", null, circuit(ledCircuit(330, 2)), { minLitLeds: 2 }).verdict).toBe("passed");
    expect(evaluateChallenge("circuit", null, result, null)).toEqual({ verdict: "passed", check: null });
    expect(result.currentMa).toBe(circuit(ledCircuit(470)).currentMa);
  });

  it("applies chemistry reaction and eye score parameters", () => {
    const passed = { verdict: "passed" };
    expect(evaluateChallenge("chemistry", { reactionId: "mg-hcl" }, passed, { reactionId: "mg-hcl" }).verdict).toBe("passed");
    expect(evaluateChallenge("chemistry", { reactionId: "naoh-hcl" }, passed, { reactionId: "mg-hcl" }).verdict).toBe("not_passed");
    expect(evaluateChallenge("eye", null, { verdict: "partial", score: 80 }, { minScore: 80 }).verdict).toBe("passed");
    expect(evaluateChallenge("eye", null, { verdict: "partial", score: 60 }, { minScore: 80 }).verdict).toBe("partial");
  });

  it("names objectives from parameters and keeps the lab prefix in variant challenge IDs", () => {
    expect(challengeObjective("circuit", { maxCurrentMa: 12, minLitLeds: 2 })).toMatch(/2 LED.*12 mA/);
    expect(variantChallengeId("circuit", "abc")).toBe("circuit_v-abc");
  });
});

describe("publish gates (B1-T4)", () => {
  it("lets a complete teacher-private variant publish and blocks invalid parameters", () => {
    expect(publishBlockers(lesson, "TEACHER_PRIVATE")).toEqual([]);
    expect(publishBlockers({ ...lesson, challengeParams: { maxCurrentMa: 10 } }, "TEACHER_PRIVATE")).toEqual([]);
    expect(publishBlockers({ ...lesson, challengeParams: { maxCurrentMa: 50 } }, "TEACHER_PRIVATE").join()).toMatch(/5 đến 20/);
    expect(publishBlockers({ ...lesson, review: null }, "TEACHER_PRIVATE").join()).toMatch(/phiếu kiểm duyệt/);
  });

  it("requires outcome mapping and every named review, with distinct subject and rights reviewers, for the shared library", () => {
    const at = new Date().toISOString();
    const reviews = (subjectReviewer: string) => ({
      editorial: { reviewerId: "a1", at },
      subject: { reviewerId: subjectReviewer, at },
      rights: { reviewerId: "a2", at },
      safety: { reviewerId: "a1", at },
      model: { reviewerId: "a1", at },
    });
    const missing = publishBlockers(lesson, "SHARED_LIBRARY");
    expect(missing).toEqual(
      expect.arrayContaining([
        "yêu cầu cần đạt trong bản đồ chương trình",
        "duyệt biên tập",
        "duyệt chuyên môn",
        "duyệt bản quyền",
        "duyệt an toàn",
        "duyệt mô hình khoa học",
      ]),
    );
    const ready = { ...lesson, outcomeCodes: ["FX8-ENERGY-01"], releaseReview: reviews("a1") };
    expect(publishBlockers(ready, "SHARED_LIBRARY")).toEqual([]);
    expect(publishBlockers({ ...ready, releaseReview: reviews("a2") }, "SHARED_LIBRARY")).toEqual([
      "người duyệt chuyên môn và người duyệt bản quyền phải khác nhau",
    ]);
    expect(publishBlockers({ ...ready, labId: null, releaseReview: { ...reviews("a1"), model: undefined } }, "SHARED_LIBRARY")).toEqual([]);
    // Pending Q-C2-04 ranges block shared release of a parameterised challenge.
    expect(publishBlockers({ ...ready, challengeParams: { maxCurrentMa: 10 } }, "SHARED_LIBRARY").join()).toMatch(/Q-C2-04/);
  });
});

describe("content versions and attribution (B1-T4/T5)", () => {
  it("changes the version when structure or challenge parameters change, not on metadata edits", () => {
    expect(lessonVersion(lesson)).toBe(lessonVersion({ ...lesson, title: "Khác" } as any));
    expect(lessonVersion(lesson)).not.toBe(lessonVersion({ ...lesson, content: "<p>Khác</p>" }));
    expect(isStructureChange(lesson, { ...lesson, challengeParams: { maxCurrentMa: 10 } })).toBe(true);
    expect(labVersion({ simulationModelRef: "circuit@1.0.0", config: {} })).not.toBe(
      labVersion({ simulationModelRef: "circuit@1.1.0", config: {} }),
    );
  });

  it("renders sources and license, and labels synthetic fixtures", () => {
    expect(attribution({ review })).toMatchObject({
      sources: review.sources,
      license: "ORIGINAL",
      licenseLabel: "Tự biên soạn",
      synthetic: false,
      note: null,
    });
    expect(attribution({ review: null, synthetic: true })).toMatchObject({
      sources: null,
      synthetic: true,
      note: expect.stringMatching(/minh họa/),
    });
  });
});
