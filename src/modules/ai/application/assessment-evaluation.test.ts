import { describe, expect, it } from "vitest";
import { ASSESSMENT_EVALUATION_GATE } from "../../../config/ai-assessment";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { ASSESS_SUBMISSION_PROMPT_VERSION } from "./assess-submission-prompt";
import { anchorStep, evaluateShadow, type EvalRow } from "./assessment-evaluation";
import { generateSyntheticSet, runSyntheticShadow, SYNTHETIC_TASKS } from "./assessment-synthetic-shadow";

/**
 * TAI2-T5: the report metrics against a hand-computed fixture of 10 submissions, and the recorded SYNTHETIC gate entry
 * re-computed from the synthetic set through the real pipeline (so the record in src/config cannot drift).
 */
const RUBRIC = [
  { promptId: "p1", criterionCode: "A", maxPoints: 2, anchors: [0, 1, 2] },
  { promptId: "p1", criterionCode: "B", maxPoints: 2, anchors: [0, 2] },
];
type Fixture = { task: string; status: "VALID" | "PARTIAL" | "SUPPRESSED"; ai: [number | null, number | null]; teacher: [number, number]; quotes?: Partial<Record<"A" | "B", [number, number]>> };
const row = (index: number, f: Fixture): EvalRow => ({
  submissionId: `s${index}`,
  taskId: f.task,
  rubric: RUBRIC,
  suggestion: {
    status: f.status,
    criterionResults: (["A", "B"] as const).map((code, i) => {
      const points = f.ai[i];
      const [returned, verified] = f.quotes?.[code] ?? (points === null ? [0, 0] : [1, 1]);
      return { promptId: "p1", criterionCode: code, valid: points !== null, suggestedPoints: points, returnedQuotes: returned, verifiedQuotes: verified };
    }),
  },
  teacher: [{ promptId: "p1", criterionCode: "A", points: f.teacher[0] }, { promptId: "p1", criterionCode: "B", points: f.teacher[1] }],
});

// Hand computation (max total 4, 10-point scale = total / 4 * 10):
//  VALID rows 1-8 errors: 0, 2.5, 0, 5, 1.25, 1.25, 0, 0 -> MAE 10 / 8 = 1.25; within ±1: 4 / 8 = 0.5.
//  Criteria compared: 16 (rows 1-8) + 1 (row 9, criterion A) = 17; only row 4 A (step 2 vs 0) disagrees -> 16 / 17.
//  Quotes: 19 returned (row 2 A returns 2; row 9 B returns 1), 17 verified -> 17 / 19.
const FIXTURE: Fixture[] = [
  { task: "t1", status: "VALID", ai: [2, 2], teacher: [2, 2] },
  { task: "t1", status: "VALID", ai: [1, 2], teacher: [2, 2], quotes: { A: [2, 1] } },
  { task: "t1", status: "VALID", ai: [0, 0], teacher: [0, 0] },
  { task: "t2", status: "VALID", ai: [2, 0], teacher: [0, 0] },
  { task: "t2", status: "VALID", ai: [1, 0], teacher: [1, 0.5] },
  { task: "t2", status: "VALID", ai: [2, 2], teacher: [2, 1.5] },
  { task: "t3", status: "VALID", ai: [0, 2], teacher: [0, 2] },
  { task: "t3", status: "VALID", ai: [1, 2], teacher: [1, 2] },
  { task: "t3", status: "PARTIAL", ai: [1, null], teacher: [2, 0], quotes: { B: [1, 0] } },
  { task: "t3", status: "SUPPRESSED", ai: [null, null], teacher: [1, 1] },
];

describe("TAI2-T5 shadow metrics (hand-computed fixture of 10 submissions)", () => {
  const report = evaluateShadow(FIXTURE.map((f, i) => row(i + 1, f)), { promptVersion: "assess-submission@1", model: "fake-model" });

  it("matches the hand computation", () => {
    expect(report).toMatchObject({
      responses: 10, tasks: 3, statusCounts: { VALID: 8, PARTIAL: 1, SUPPRESSED: 1 }, suppressionRate: 0.1, partialRate: 0.1,
      scoredResponses: 8, mae: 1.25, withinOneRate: 0.5, criteriaCompared: 17, perCriterionAgreement: 0.9412,
      returnedQuotes: 19, verifiedQuotes: 17, evidenceVerificationRate: 0.8947,
    });
  });

  it("applies the gate thresholds (this fixture fails every quality check and the size check)", () => {
    expect(report.pass).toBe(false);
    expect(Object.fromEntries(report.checks.map((c) => [c.name, c.pass]))).toEqual({
      responses: false, "written tasks": true, "MAE (10-point)": false, "within ±1": false, "evidence verification rate": false,
    });
  });

  it("anchor steps use the highest anchor at or below the value", () => {
    expect([0, 0.5, 1, 1.5, 2].map((v) => anchorStep([0, 1, 2], v))).toEqual([0, 0, 1, 1, 2]);
    expect([0, 1.5, 2].map((v) => anchorStep([0, 2], v))).toEqual([0, 0, 1]);
  });

  it("an empty set yields null metrics and fails", () => {
    const empty = evaluateShadow([], { promptVersion: "assess-submission@1" });
    expect(empty).toMatchObject({ responses: 0, mae: null, withinOneRate: null, evidenceVerificationRate: null, pass: false });
  });
});

describe("TAI2-T5 SYNTHETIC shadow run (no real shadow data is collected)", () => {
  it("is deterministic, covers >= 100 responses across >= 3 tasks, and the recorded gate entry equals the computed verdict", async () => {
    const set = generateSyntheticSet();
    expect(set.length).toBeGreaterThanOrEqual(100);
    expect(new Set(set.map((r) => r.task.id)).size).toBe(SYNTHETIC_TASKS.length);
    expect(JSON.stringify(generateSyntheticSet())).toBe(JSON.stringify(set));

    const provider = new FakeAiProvider();
    const run = await runSyntheticShadow(provider, { promptVersion: ASSESS_SUBMISSION_PROMPT_VERSION, model: "fake-model" }, set);
    const recorded = ASSESSMENT_EVALUATION_GATE[ASSESS_SUBMISSION_PROMPT_VERSION];
    expect(recorded.source).toBe("SYNTHETIC");
    expect(run.report.responses).toBe(recorded.responses);
    expect(run.report.pass ? "PASS" : "FAIL").toBe(recorded.verdict);
    // Injection responses never reached the provider; every other response did, exactly once.
    expect(run.providerCalls).toBe(run.report.responses - run.report.statusCounts.SUPPRESSED);
    expect(provider.calls).toHaveLength(run.providerCalls);
    // No synthetic student name or username reached the provider.
    const sent = JSON.stringify(provider.calls);
    for (const person of set.flatMap((r) => r.identities.people).slice(0, 40)) {
      expect(sent).not.toContain(person.username);
      expect(sent).not.toContain(person.fullName);
    }
  }, 30_000); // runs the real pipeline over 120 responses (about 3 s alone, over 5 s under a parallel full run)
});
