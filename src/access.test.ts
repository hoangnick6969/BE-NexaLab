import { describe, expect, it } from "vitest";
import { applicableLessonAssignmentWhere } from "./classes/class-access";

describe("applicable lesson assignment query", () => {
  it("binds a requested assignment to the student, lesson, and lesson content type", () => {
    expect(applicableLessonAssignmentWhere("student-1", "lesson-1", "assignment-2")).toEqual({
      status: "ACTIVE",
      classroom: { status: "ACTIVE", enrollments: { some: { studentId: "student-1", status: "approved" } } },
      targets: { some: { studentId: "student-1" } },
      id: "assignment-2",
      contentId: "lesson-1",
      contentType: "lesson",
    });
  });

  it("keeps the existing eligible-assignment query when no assignment is requested", () => {
    expect(applicableLessonAssignmentWhere("student-1", "lesson-1")).not.toHaveProperty("id");
  });
});
