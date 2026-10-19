import { describe, expect, it, vi } from "vitest";
import { LearningController } from "./learning.controller";

describe("LearningController assignment context", () => {
  it("forwards the explicitly selected assignment to the student pathway authorization", async () => {
    const access = { studentPathway: vi.fn().mockResolvedValue({ assignment: { id: "assignment-2" } }) };
    const controller = new LearningController({} as any, access as any);

    await expect(controller.pathway("lesson-1", { assignmentId: "assignment-2" }, { user: { sub: "student-1" } }))
      .resolves.toEqual({ assignment: { id: "assignment-2" } });
    expect(access.studentPathway).toHaveBeenCalledWith("lesson-1", "student-1", expect.anything(), "assignment-2");
  });

  it("rejects malformed assignment selectors before asking access rules to choose a pathway", async () => {
    const access = { studentPathway: vi.fn() };
    const controller = new LearningController({} as any, access as any);

    await expect(controller.pathway("lesson-1", { assignmentId: ["assignment-1", "assignment-2"] }, { user: { sub: "student-1" } }))
      .rejects.toMatchObject({ response: { code: "INVALID_ASSIGNMENT_CONTEXT" } });
    expect(access.studentPathway).not.toHaveBeenCalled();
  });
});

describe("LearningController assignment catalog summaries", () => {
  it("returns hierarchy metadata from a batch content read and omits unavailable items", async () => {
    const assignmentRows = [
      {
        id: "assignment-1", title: "Bài 1", contentId: "lesson-1", contentType: "lesson",
        dueDate: null, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
      {
        id: "assignment-2", title: "Bài không khả dụng", contentId: "lesson-missing", contentType: "lesson",
        dueDate: null, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
    ];
    const lessonFindMany = vi.fn().mockResolvedValue([{
      id: "lesson-1", status: "published", title: "Mạch điện", subject: { id: "physics", name: "Vật lý" },
      grade: 8, chapter: "Điện học", topic: "Mạch điện", curriculumOrder: 12,
      curriculumChapter: { officialOrder: 3 }, curriculumTopic: { officialOrder: 2 },
    }]);
    const db = {
      assignment: { findMany: vi.fn().mockResolvedValue(assignmentRows) },
      lesson: { findMany: lessonFindMany, findUnique: vi.fn() },
      lab: { findMany: vi.fn(), findUnique: vi.fn() },
    };
    const controller = new LearningController(db as any, {} as any);

    await expect(controller.assignments({ user: { sub: "student-1" } })).resolves.toEqual([
      expect.objectContaining({
        id: "assignment-1", subject: { id: "physics", name: "Vật lý" }, grade: 8,
        chapter: "Điện học", topic: "Mạch điện", curriculumOrder: 12, chapterOrder: 3, topicOrder: 2,
        contentState: "AVAILABLE", canOpen: true,
      }),
    ]);
    expect(lessonFindMany).toHaveBeenCalledTimes(1);
    expect(lessonFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["lesson-1", "lesson-missing"] } } }));
    expect(db.lesson.findUnique).not.toHaveBeenCalled();
    expect(db.lab.findMany).not.toHaveBeenCalled();
  });
});
