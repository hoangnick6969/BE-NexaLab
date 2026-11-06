import { describe, expect, it } from "vitest";
import {
  applyPatternVisibility, CURRENT_INSIGHT_VERSION, engineFor, evaluateInsightsV1, FORBIDDEN_INSIGHT_WORDS, INSIGHT_MESSAGES,
  insightFingerprint, type InsightEvidence,
} from "./index";

const now = new Date("2026-11-06T00:00:00.000Z");
const day = 24 * 3600_000;
const at = (n: number) => new Date(Date.UTC(2026, 9, 1) + n * day);
const quiz = (id: string, n: number, score: number, outcomeCodes: string[] = []): InsightEvidence => ({ kind: "QUIZ", id, at: at(n), score, passed: score >= 50, outcomeCodes });
const test = (id: string, n: number, score: number, outcomeCodes: string[] = []): InsightEvidence => ({ kind: "TEST", id, at: at(n), score, outcomeCodes });
const practical = (id: string, n: number, hint: number, verdict = "needs_practice", outcomeCodes: string[] = []): InsightEvidence => ({ kind: "PRACTICAL", id, at: at(n), verdict, maxHintLevel: hint, outcomeCodes });
const run = (evidence: InsightEvidence[]) => evaluateInsightsV1({ classId: "c1", studentId: "s1", evidence, now });
const codes = (evidence: InsightEvidence[]) => run(evidence).map((i) => i.ruleCode);
const scores = (values: number[]) => values.map((v, i) => quiz(`q${i}`, i, v));

describe("INSUFFICIENT_EVIDENCE boundary", () => {
  it("fires with 2 scored items and not with 3", () => {
    expect(codes(scores([60, 60]))).toEqual(["INSUFFICIENT_EVIDENCE"]);
    expect(codes(scores([60, 60, 60]))).not.toContain("INSUFFICIENT_EVIDENCE");
  });
  it("uses the existing scored items as evidence, so the fingerprint is fixed at 0 items and changes with the first item", () => {
    const empty = run([]);
    expect(empty).toHaveLength(1);
    expect(empty[0]!.evidence).toEqual([]);
    expect(empty[0]!.status).toBe("NEEDS_MORE_EVIDENCE");
    expect(run([])[0]!.fingerprint).toBe(empty[0]!.fingerprint);
    expect(run(scores([60]))[0]!.fingerprint).not.toBe(empty[0]!.fingerprint);
  });
  it("does not count practicals as scored and suppresses SCORE_CHANGE_UNUSUAL", () => {
    expect(codes([...scores([60, 60]), practical("p1", 5, 0, "passed")])).toContain("INSUFFICIENT_EVIDENCE");
    expect(codes(scores([60, 60, 90]))).not.toContain("SCORE_CHANGE_UNUSUAL");
  });
});

describe("SCORE_CHANGE_UNUSUAL boundaries", () => {
  it("fires at a 25 point change from a flat baseline and not at 24", () => {
    expect(codes(scores([60, 60, 60, 85]))).toEqual(["SCORE_CHANGE_UNUSUAL"]);
    expect(codes(scores([60, 60, 60, 84]))).toEqual([]);
  });
  it("lets the sigma term govern for baseline [40, 60, 80]", () => {
    expect(codes(scores([40, 60, 80, 92]))).toEqual([]);
    const hit = run(scores([40, 60, 80, 93]));
    expect(hit.map((i) => i.ruleCode)).toEqual(["SCORE_CHANGE_UNUSUAL"]);
    expect(hit[0]!.values).toMatchObject({ latest: 93, mean: 60, delta: 33, direction: "UP" });
    expect(hit[0]!.values.standardDeviation).toBeCloseTo(16.3299, 3);
  });
  it("fires downwards too", () => {
    const hit = run(scores([80, 80, 80, 55]));
    expect(hit[0]!.values.direction).toBe("DOWN");
    expect(hit[0]!.status).toBe("TEACHER_REVIEW_RECOMMENDED");
  });
  it("needs a baseline of 3 and never fires with only 2 baseline items", () => {
    expect(codes(scores([10, 10, 100]))).toEqual([]);
  });
  it("uses the newest 10 items before the latest as baseline and lists baseline plus latest as evidence", () => {
    const evidence = scores([0, 60, 60, 60, 60, 60, 60, 60, 60, 60, 60, 90]);
    const hit = run(evidence).find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL")!;
    expect(hit.evidence.map((e) => e.id)).toEqual(["q1", "q2", "q3", "q4", "q5", "q6", "q7", "q8", "q9", "q10", "q11"]);
  });
  it("merges QUIZ and TEST by time, with the id as tie-breaker", () => {
    const evidence = [quiz("q1", 1, 60), test("t1", 2, 60), quiz("q2", 3, 60), test("a-late", 4, 90), quiz("z-late", 4, 40)];
    const hit = run(evidence).find((i) => i.ruleCode === "SCORE_CHANGE_UNUSUAL")!;
    expect(hit.values.latest).toBe(40);
    expect(hit.evidence.map((e) => e.id)).toEqual(["q1", "t1", "q2", "a-late", "z-late"]);
  });
  it("tolerates float noise at the exact threshold", () => {
    expect(codes(scores([60.1, 60.1, 60.1, 85.1]))).toEqual(["SCORE_CHANGE_UNUSUAL"]);
  });
});

describe("HIGH_HINT_DEPENDENCE and SUDDEN_UNAIDED_PASS boundaries", () => {
  const hints = (levels: number[]) => levels.map((l, i) => practical(`p${i}`, i, l));
  it("fires at 2 of 3 and 4 of 6 and not at 1 of 3 or 3 of 6", () => {
    expect(codes(hints([3, 3, 0]))).toContain("HIGH_HINT_DEPENDENCE");
    expect(codes(hints([3, 0, 0]))).not.toContain("HIGH_HINT_DEPENDENCE");
    expect(codes(hints([3, 4, 3, 3, 0, 0]))).toContain("HIGH_HINT_DEPENDENCE");
    expect(codes(hints([3, 4, 3, 0, 0, 0]))).not.toContain("HIGH_HINT_DEPENDENCE");
  });
  it("needs at least 3 practicals", () => {
    expect(codes(hints([4, 4]))).not.toContain("HIGH_HINT_DEPENDENCE");
  });
  it("is INFORMATIONAL without the pattern and lists every practical as evidence", () => {
    const hit = run(hints([3, 3, 0]))[0]!;
    expect(hit.status).toBe("INFORMATIONAL");
    expect(hit.pattern).toBeUndefined();
    expect(hit.message).toBe(INSIGHT_MESSAGES.HIGH_HINT_DEPENDENCE);
    expect(hit.evidence.map((e) => e.id)).toEqual(["p0", "p1", "p2"]);
  });
  const withPass = (levels: number[], finalHint: number, verdict = "passed") => [...hints(levels), practical("last", 50, finalHint, verdict)];
  it("flags the pattern when the 3 preceding practicals used level 3+ and the latest passed with no hint", () => {
    const hit = run(withPass([3, 4, 3], 0))[0]!;
    expect(hit.pattern).toBe("SUDDEN_UNAIDED_PASS");
    expect(hit.status).toBe("TEACHER_REVIEW_RECOMMENDED");
    expect(hit.message).toBe(INSIGHT_MESSAGES.SUDDEN_UNAIDED_PASS);
  });
  it("does not flag the pattern when the latest used level 1, did not pass, or a preceding one used level 2", () => {
    expect(run(withPass([3, 4, 3], 1))[0]!.pattern).toBeUndefined();
    expect(run(withPass([3, 4, 3], 0, "needs_practice"))[0]!.pattern).toBeUndefined();
    expect(run(withPass([3, 4, 2], 0))[0]?.pattern).toBeUndefined();
  });
  it("uses the 3 practicals immediately before the latest, not earlier ones", () => {
    expect(run([...hints([3, 3, 3]), practical("mid", 10, 0), practical("last", 11, 0, "passed")]).find((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE")?.pattern).toBeUndefined();
  });
  it("can hold the pattern without the base rule, and the visibility flag then drops it or downgrades it", () => {
    const early = Array.from({ length: 6 }, (_, i) => practical(`e${i}`, i, 0));
    const patternOnly = run([...early, ...withPass([3, 3, 3], 0).slice(0, 3).map((p, i) => ({ ...p, id: `h${i}`, at: at(20 + i) })), practical("last", 30, 0, "passed")]);
    const hint = patternOnly.filter((i) => i.ruleCode === "HIGH_HINT_DEPENDENCE");
    expect(hint).toHaveLength(1);
    expect(hint[0]!.pattern).toBe("SUDDEN_UNAIDED_PASS");
    expect(hint[0]!.values.baseRuleMet).toBe(0);
    expect(applyPatternVisibility(hint, false)).toEqual([]);
    expect(applyPatternVisibility(hint, true)).toEqual(hint);
  });
  it("downgrades to INFORMATIONAL when hidden and the base rule holds, keeping the fingerprint", () => {
    const [shown] = run(withPass([3, 4, 3], 0));
    const [hidden] = applyPatternVisibility([shown!], false);
    expect(hidden!.pattern).toBeUndefined();
    expect(hidden!.status).toBe("INFORMATIONAL");
    expect(hidden!.message).toBe(INSIGHT_MESSAGES.HIGH_HINT_DEPENDENCE);
    expect(hidden!.fingerprint).toBe(shown!.fingerprint);
    expect(hidden!.evidence).toEqual(shown!.evidence);
  });
});

describe("OBJECTIVE_MASTERY_INCONSISTENT boundaries", () => {
  const O = ["OUT-1"];
  it("does not fire with 1 pass and 1 non-pass of the other kind, and fires with 1 + 2", () => {
    expect(codes([quiz("q1", 1, 80, O), practical("p1", 2, 0, "needs_practice", O)])).not.toContain("OBJECTIVE_MASTERY_INCONSISTENT");
    const hit = run([quiz("q1", 1, 80, O), practical("p1", 2, 0, "needs_practice", O), practical("p2", 3, 0, "needs_practice", O)]).filter((i) => i.ruleCode === "OBJECTIVE_MASTERY_INCONSISTENT");
    expect(hit).toHaveLength(1);
    expect(hit[0]!.values).toEqual({ outcomeCode: "OUT-1", passingKind: "QUIZ", nonPassingKind: "PRACTICAL" });
    expect(hit[0]!.evidence.map((e) => e.id)).toEqual(["q1", "p1", "p2"]);
  });
  it("does not fire for passes and failures of the same kind only", () => {
    expect(codes([quiz("q1", 1, 80, O), quiz("q2", 2, 20, O), quiz("q3", 3, 10, O)])).not.toContain("OBJECTIVE_MASTERY_INCONSISTENT");
  });
  it("needs at least 3 items for the outcome and ignores items of other outcomes", () => {
    expect(codes([quiz("q1", 1, 80, O), test("t1", 2, 10, O), test("t2", 3, 10, ["OUT-2"])])).not.toContain("OBJECTIVE_MASTERY_INCONSISTENT");
  });
  it("treats TEST as passing from 50 and a practical as passing only with verdict passed", () => {
    expect(codes([test("t1", 1, 50, O), practical("p1", 2, 0, "partial", O), practical("p2", 3, 0, "failed", O)])).toContain("OBJECTIVE_MASTERY_INCONSISTENT");
    expect(codes([test("t1", 1, 49, O), practical("p1", 2, 0, "passed", O), quiz("q1", 3, 10, O), quiz("q2", 4, 10, O)])).toContain("OBJECTIVE_MASTERY_INCONSISTENT");
  });
  it("emits one insight per outcome and picks the first (passingKind, nonPassingKind) pair alphabetically", () => {
    const evidence = [
      practical("p1", 1, 0, "passed", O), quiz("q1", 2, 80, O), quiz("q2", 3, 10, O), test("t1", 4, 10, O), test("t2", 5, 10, O),
    ];
    const hit = run(evidence).find((i) => i.ruleCode === "OBJECTIVE_MASTERY_INCONSISTENT")!;
    expect(hit.values).toMatchObject({ passingKind: "PRACTICAL", nonPassingKind: "TEST" });
    expect(hit.evidence.map((e) => e.id)).toEqual(["p1", "t1", "t2"]);
  });
  it("gives two outcomes that share one evidence set different fingerprints", () => {
    const both = ["OUT-A", "OUT-B"];
    const hits = run([quiz("q1", 1, 80, both), practical("p1", 2, 0, "needs_practice", both), practical("p2", 3, 0, "needs_practice", both)])
      .filter((i) => i.ruleCode === "OBJECTIVE_MASTERY_INCONSISTENT");
    expect(hits.map((i) => i.values.outcomeCode)).toEqual(["OUT-A", "OUT-B"]);
    expect(hits[0]!.evidence).toEqual(hits[1]!.evidence);
    expect(hits[0]!.fingerprint).not.toBe(hits[1]!.fingerprint);
  });
});

describe("fingerprints and determinism", () => {
  const evidence = [...scores([60, 60, 60, 90]), practical("p1", 1, 3), practical("p2", 2, 3), practical("p3", 3, 0)];
  it("returns identical insights and fingerprints for identical input, in any input order", () => {
    const a = run(evidence);
    expect(run(evidence)).toEqual(a);
    expect(run([...evidence].reverse())).toEqual(a);
  });
  it("does not mutate the input", () => {
    const copy = evidence.map((e) => ({ ...e, outcomeCodes: [...e.outcomeCodes] }));
    run(evidence);
    expect(evidence).toEqual(copy);
  });
  it("changes with the class, the student or the evidence, and not with the evidence order", () => {
    const base = { ruleVersion: "insights@1" as const, ruleCode: "SCORE_CHANGE_UNUSUAL" as const, classId: "c1", studentId: "s1", evidenceIds: ["a", "b"] };
    const f = insightFingerprint(base);
    expect(insightFingerprint({ ...base, evidenceIds: ["b", "a"] })).toBe(f);
    expect(insightFingerprint({ ...base, classId: "c2" })).not.toBe(f);
    expect(insightFingerprint({ ...base, studentId: "s2" })).not.toBe(f);
    expect(insightFingerprint({ ...base, evidenceIds: ["a", "b", "c"] })).not.toBe(f);
  });
  it("produces a new SCORE_CHANGE_UNUSUAL fingerprint when another attempt arrives", () => {
    const first = run(scores([60, 60, 60, 90]))[0]!;
    const second = run(scores([60, 60, 60, 90, 20]))[0]!;
    expect(second.fingerprint).not.toBe(first.fingerprint);
  });
  it("orders insights by rule code then outcome code and stamps version, student and time", () => {
    const list = run([...scores([60, 60, 60, 90]), practical("p1", 1, 3), practical("p2", 2, 3), practical("p3", 3, 0)]);
    expect(list.map((i) => i.ruleCode)).toEqual(["HIGH_HINT_DEPENDENCE", "SCORE_CHANGE_UNUSUAL"]);
    expect(list.every((i) => i.ruleVersion === "insights@1" && i.studentId === "s1" && i.computedAt === now.toISOString())).toBe(true);
  });
  it("keeps insights@1 callable through the registry", () => {
    expect(CURRENT_INSIGHT_VERSION).toBe("insights@1");
    expect(engineFor("insights@1")).toBe(evaluateInsightsV1);
    expect(engineFor("insights@9")).toBeUndefined();
  });
});

describe("neutral vocabulary", () => {
  const everything = run([
    ...scores([60, 60, 60, 90]), ...scores([]),
    practical("p1", 1, 3, "needs_practice", ["O"]), practical("p2", 2, 3, "needs_practice", ["O"]), practical("p3", 3, 3, "needs_practice", ["O"]), practical("p4", 4, 0, "passed", ["O"]),
    quiz("oq", -1, 60, ["O"]),
  ]);
  const texts = [...Object.values(INSIGHT_MESSAGES), ...everything.map((i) => i.message)];
  const ruleCodes = ["INSUFFICIENT_EVIDENCE", "SCORE_CHANGE_UNUSUAL", "HIGH_HINT_DEPENDENCE", "OBJECTIVE_MASTERY_INCONSISTENT", "SUDDEN_UNAIDED_PASS"];
  it("keeps every template and rule code free of forbidden words", () => {
    for (const text of [...texts, ...ruleCodes]) for (const word of FORBIDDEN_INSIGHT_WORDS) expect(text.toLowerCase()).not.toContain(word);
  });
  it("never shows a raw rule code in a message", () => {
    for (const text of texts) for (const code of ruleCodes) expect(text).not.toContain(code);
  });
  it("covers every first-wave rule so the scan sees each template", () => {
    expect(new Set(everything.map((i) => i.ruleCode)).size).toBe(3);
  });
});
