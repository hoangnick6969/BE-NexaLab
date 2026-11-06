import { describe, expect, it } from "vitest";
import { CHECKPOINT_HINT_CATALOGS } from "../../labs/application/checkpoint-hint-rules";
import { MISCONCEPTION_LABELS } from "../../labs/application/misconception-labels";
import { buildHintInsight } from "./hint-insight";

const FW = "food-web-checkpoints@1.0.0";
const result = (hunt: string, unmet: string[]) => ({
  assessment: { unmetCriteria: unmet },
  observations: [{ id: "HUNT", prediction: hunt, predictionCorrect: hunt === "INCREASE" }],
});

describe("SAI-02A hint insight", () => {
  it("every misconception id a catalog can detect has a teacher label", () => {
    const ids = Object.values(CHECKPOINT_HINT_CATALOGS).flatMap((catalog) => Object.values(catalog.criteria).flatMap((hints) => [
      ...Object.keys(hints.misconceptions ?? {}), ...Object.keys(hints.reflections ?? {}),
    ]));
    expect(ids.length).toBeGreaterThan(0);
    for (const id of new Set(ids)) expect(MISCONCEPTION_LABELS[id], id).toBeTruthy();
  });

  it("counts stuck students, hints and misconceptions per step from the latest attempts, with evidence IDs", () => {
    const out = buildHintInsight({
      targeted: 4,
      latest: [
        { attemptId: "a1", studentId: "s1", verdict: "needs_practice", rubricRef: FW, result: result("DECREASE", ["prediction:HUNT", "explanation"]) },
        { attemptId: "a2", studentId: "s2", verdict: "needs_practice", rubricRef: FW, result: result("DECREASE", ["prediction:HUNT"]) },
        { attemptId: "a3", studentId: "s3", verdict: "passed", rubricRef: FW, result: result("INCREASE", []) },
      ],
      hints: [
        { studentId: "s1", rubricRef: FW, criterion: "prediction:HUNT", level: 1 },
        { studentId: "s1", rubricRef: FW, criterion: "prediction:HUNT", level: 2 },
        { studentId: "s2", rubricRef: FW, criterion: "prediction:HUNT", level: 0 },
        { studentId: "s3", rubricRef: FW, criterion: "explanation", level: 1 },
      ],
      disagreements: [{ rubricRef: FW, criterion: "prediction:HUNT", misconception: "FW_ALL_DECREASE", note: "Em hiểu đúng, chọn nhầm", at: "2026-11-05T00:00:00.000Z" }],
    });
    expect(out.totals).toEqual({ targeted: 4, submitted: 3, passed: 1, notPassed: 2, notStarted: 1 });
    expect(out).toMatchObject({ ruleVersion: "hint-insights@1", hintRules: "checkpoint-hints@5", misconceptionRules: "checkpoint-misconceptions@2", provider: "rules" });
    const steps = out.rubrics[0].steps;
    expect(steps.map((step) => step.criterion)).toEqual(CHECKPOINT_HINT_CATALOGS[FW].order);
    const hunt = steps.find((step) => step.criterion === "prediction:HUNT")!;
    expect(hunt).toMatchObject({
      label: "Khi mất rắn", studentsUnmet: 2, evidence: ["a1", "a2"],
      hints: { total: 3, students: 2, byLevel: { 1: 1, 2: 1, 3: 0, 4: 0 }, reflections: 1 },
    });
    expect(hunt.misconceptions).toEqual([{
      id: "FW_ALL_DECREASE", label: MISCONCEPTION_LABELS.FW_ALL_DECREASE, students: 2, evidence: ["a1", "a2"],
      disagreement: { note: "Em hiểu đúng, chọn nhầm", at: "2026-11-05T00:00:00.000Z" },
    }]);
    expect(steps.find((step) => step.criterion === "explanation")).toMatchObject({ studentsUnmet: 1, evidence: ["a1"], misconceptions: [] });
    // No student identifiers beyond evidence attempt IDs.
    expect(JSON.stringify(out)).not.toMatch(/"s[123]"/);
  });

  it("ignores attempts and hints of rubrics without a catalog", () => {
    const out = buildHintInsight({
      targeted: 1,
      latest: [{ attemptId: "x", studentId: "s1", verdict: "needs_practice", rubricRef: "legacy@1", result: {} }],
      hints: [{ studentId: "s1", rubricRef: "", criterion: null, level: 2 }],
      disagreements: [],
    });
    expect(out.rubrics).toEqual([]);
    expect(out.totals).toMatchObject({ submitted: 0, notStarted: 1 });
  });
});
