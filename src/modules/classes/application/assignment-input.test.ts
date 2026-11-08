import { describe, expect, it, vi } from "vitest";
import { AssignmentsService, assignmentInput } from "./assignments.service";

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

describe("assignment grade compatibility", () => {
  it("rejects a published grade 9 Lab for a grade 8 class", async () => {
    const service = new AssignmentsService({} as any);
    const tx = { lab: { findFirst: vi.fn().mockResolvedValue({ id: "em-induction", title: "Cảm ứng điện từ", grade: 9 }) } };
    await expect((service as any).assignableContentOrThrow(tx, "class-8", "lab", "em-induction", "teacher", 8))
      .rejects.toMatchObject({ response: { code: "ASSIGNMENT_GRADE_MISMATCH" } });
  });

  it("rejects a Test linked to a lesson from another grade", async () => {
    const service = new AssignmentsService({} as any);
    const tx = { classResource: { findFirst: vi.fn().mockResolvedValue({ id: "test-9", title: "Kiểm tra", version: 1, lesson: { grade: 9 } }) } };
    await expect((service as any).assignableContentOrThrow(tx, "class-8", "test", "test-9", "teacher", 8))
      .rejects.toMatchObject({ response: { code: "ASSIGNMENT_GRADE_MISMATCH" } });
  });
});
