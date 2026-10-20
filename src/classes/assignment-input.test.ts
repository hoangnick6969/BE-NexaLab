import { describe, expect, it } from "vitest";
import { assignmentInput } from "./assignments.controller";

describe("assignment audience validation", () => {
  const base = { contentType: "lesson", contentId: "lesson-circuit" };
  it("rejects an explicitly empty group before resolving class recipients", () => {
    const result = assignmentInput.safeParse({ ...base, audience: "SUBSET", studentIds: [] });
    expect(result.success).toBe(false);
    if (!result.success) expect(result.error.issues[0].message).toBe("Hãy chọn ít nhất một học sinh.");
  });
  it("accepts a chosen group and an explicit whole class", () => {
    expect(assignmentInput.parse({ ...base, audience: "SUBSET", studentIds: ["student-a"] }).studentIds).toEqual(["student-a"]);
    expect(assignmentInput.parse({ ...base, audience: "CLASS" }).studentIds).toEqual([]);
  });
  it("rejects conflicting audience and recipients while keeping older clients compatible", () => {
    expect(assignmentInput.safeParse({ ...base, audience: "CLASS", studentIds: ["student-a"] }).success).toBe(false);
    expect(assignmentInput.parse(base).studentIds).toEqual([]);
    expect(assignmentInput.parse({ ...base, studentIds: ["student-a"] }).studentIds).toEqual(["student-a"]);
  });
});
