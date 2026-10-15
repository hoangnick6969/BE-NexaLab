import { describe, expect, it } from "vitest";
import { supportFlags } from "./b2-support";

const day = 24 * 3600_000;
const now = new Date("2026-10-15T00:00:00.000Z");
const base = { now, dueDate: null, completed: false, assignmentCreatedAt: new Date(now.getTime() - 6 * day), progressAt: [], quizzes: [], practicals: [] };

describe("B2 deterministic support boundaries", () => {
  it("flags the overdue boundary only after the due instant", () => {
    expect(supportFlags({ ...base, dueDate: now })).toHaveLength(0);
    expect(supportFlags({ ...base, dueDate: new Date(now.getTime() - 1) }).map((f) => f.code)).toContain("OVERDUE_INCOMPLETE");
  });
  it("flags exactly on the second failed quiz", () => {
    const q = (id: string) => ({ id, at: now, passed: false });
    expect(supportFlags({ ...base, quizzes: [q("1")] }).map((f) => f.code)).not.toContain("QUIZ_FAILED_TWICE");
    expect(supportFlags({ ...base, quizzes: [q("1"), q("2")] }).map((f) => f.code)).toContain("QUIZ_FAILED_TWICE");
  });
  it("flags three practical failures but not two or a sequence containing a pass", () => {
    const p = (id: string, verdict = "partial") => ({ id, at: now, verdict });
    expect(supportFlags({ ...base, practicals: [p("1"), p("2")] }).map((f) => f.code)).not.toContain("PRACTICAL_NOT_PASSED");
    expect(supportFlags({ ...base, practicals: [p("1"), p("2"), p("3")] }).map((f) => f.code)).toContain("PRACTICAL_NOT_PASSED");
    expect(supportFlags({ ...base, practicals: [p("1"), p("2"), p("3", "passed")] }).map((f) => f.code)).not.toContain("PRACTICAL_NOT_PASSED");
  });
  it("uses a rolling seven-day boundary and resets on qualifying activity", () => {
    expect(supportFlags({ ...base, assignmentCreatedAt: new Date(now.getTime() - 7 * day) }).map((f) => f.code)).toContain("NO_ACTIVITY_7_DAYS");
    expect(supportFlags({ ...base, progressAt: [new Date(now.getTime() - 6 * day)] }).map((f) => f.code)).not.toContain("NO_ACTIVITY_7_DAYS");
  });
});
