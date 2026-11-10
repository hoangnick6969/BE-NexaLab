import { describe, expect, it } from "vitest";
import { evaluateInsightsV2, INSIGHT_MESSAGES, SIMILARITY_V2_THRESHOLDS, type SimilarityFact } from "./index";

const now = new Date("2026-11-07T00:00:00.000Z");
const fact = (over: Partial<SimilarityFact> = {}): SimilarityFact => ({
  assignmentId: "a1", assignmentTitle: "Bài tự luận 1", submissionId: "w1", submittedAt: new Date("2026-11-01T00:00:00.000Z"),
  matchId: "m1", runAt: new Date("2026-11-05T00:00:00.000Z"), level: "HIGH", reviewed: false, ...over,
});
const run = (similarity: SimilarityFact[] | undefined, studentId = "s1") => evaluateInsightsV2({ classId: "c1", studentId, evidence: [], similarity, now });

describe("evaluateInsightsV2 (SUBMISSION_SIMILARITY_HIGH)", () => {
  it("returns nothing without facts", () => {
    expect(run(undefined)).toEqual([]);
    expect(run([])).toEqual([]);
  });
  it("counts only HIGH matches that are not reviewed", () => {
    expect(run([fact({ level: "ELEVATED" })])).toEqual([]);
    expect(run([fact({ level: "SOMETHING_NEW" })])).toEqual([]);
    expect(run([fact({ reviewed: true })])).toEqual([]);
    expect(run([fact()])).toHaveLength(1);
  });
  it("builds one insight with the own submission and the match as evidence", () => {
    const [insight] = run([fact()]);
    expect(insight).toMatchObject({
      ruleVersion: "insights@2", ruleCode: "SUBMISSION_SIMILARITY_HIGH", status: "TEACHER_REVIEW_RECOMMENDED", studentId: "s1",
      message: INSIGHT_MESSAGES.SUBMISSION_SIMILARITY_HIGH, thresholds: { ...SIMILARITY_V2_THRESHOLDS }, computedAt: now.toISOString(),
      values: { assignmentId: "a1", assignmentTitle: "Bài tự luận 1", level: "HIGH", pairCount: 1 },
    });
    expect(insight!.evidence).toEqual([
      { kind: "WRITTEN", id: "w1", at: "2026-11-01T00:00:00.000Z" },
      { kind: "SIMILARITY_MATCH", id: "m1", at: "2026-11-05T00:00:00.000Z" },
    ]);
    expect(insight!.fingerprint).toMatch(/^[a-f0-9]{64}$/);
  });
  it("groups the matches of one assignment into one insight, ordered by match id, and counts the unreviewed ones", () => {
    const [insight] = run([fact({ matchId: "m3" }), fact({ matchId: "m2" }), fact({ matchId: "m9", reviewed: true }), fact({ matchId: "m2" })]);
    expect(insight!.values.pairCount).toBe(2);
    expect(insight!.evidence.map((e) => e.id)).toEqual(["w1", "m2", "m3"]);
  });
  it("gives one insight per assignment, ordered by assignment id", () => {
    const list = run([fact({ assignmentId: "b", submissionId: "wb", matchId: "mb" }), fact({ assignmentId: "a", submissionId: "wa", matchId: "ma", assignmentTitle: "A" })]);
    expect(list.map((i) => i.values.assignmentId)).toEqual(["a", "b"]);
    expect(list.map((i) => i.values.assignmentTitle)).toEqual(["A", "Bài tự luận 1"]);
    expect(list[0]!.fingerprint).not.toBe(list[1]!.fingerprint);
  });
  it("has a fingerprint that is stable, input-order independent and changes with the matches, the student, the class and the submission", () => {
    const base = run([fact({ matchId: "m1" }), fact({ matchId: "m2" })])[0]!.fingerprint;
    expect(run([fact({ matchId: "m2" }), fact({ matchId: "m1" })])[0]!.fingerprint).toBe(base);
    expect(run([fact({ matchId: "m1" })])[0]!.fingerprint).not.toBe(base);
    expect(run([fact({ matchId: "m1" }), fact({ matchId: "m2" }), fact({ matchId: "m3" })])[0]!.fingerprint).not.toBe(base);
    expect(run([fact({ matchId: "m1" }), fact({ matchId: "m2" })], "s2")[0]!.fingerprint).not.toBe(base);
    expect(run([fact({ matchId: "m1", submissionId: "w9" }), fact({ matchId: "m2", submissionId: "w9" })])[0]!.fingerprint).not.toBe(base);
    expect(evaluateInsightsV2({ classId: "c2", studentId: "s1", evidence: [], similarity: [fact({ matchId: "m1" }), fact({ matchId: "m2" })], now })[0]!.fingerprint).not.toBe(base);
  });
  it("is the same across time (computedAt aside) and does not mutate its input", () => {
    const facts = [fact(), fact({ matchId: "m2" })];
    const copy = JSON.stringify(facts);
    const a = run(facts);
    expect(JSON.stringify(facts)).toBe(copy);
    expect(JSON.parse(JSON.stringify(run([...facts].reverse())))).toEqual(JSON.parse(JSON.stringify(a)));
  });
  it("carries nothing about another student: the payload has only own ids and counts", () => {
    const json = JSON.stringify(run([fact()]));
    for (const leak of ["other", "partner", "studentB", "submissionB"]) expect(json).not.toContain(leak);
    expect(Object.keys(run([fact()])[0]!.values).sort()).toEqual(["assignmentId", "assignmentTitle", "level", "pairCount"]);
  });
  it("uses the TAI-03 high thresholds", () => {
    expect(SIMILARITY_V2_THRESHOLDS).toEqual({ highContainmentPercent: 80, minSharedShingles: 8 });
  });
});
