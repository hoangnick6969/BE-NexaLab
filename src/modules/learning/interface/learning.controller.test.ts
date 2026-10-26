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

describe("LearningController Open Curriculum basic exercises", () => {
  it("returns authored IDs without exposing the answer key", async () => {
    const db = {
      lesson: {
        findFirst: vi.fn().mockResolvedValue({
          id: "lesson-1",
          subjectId: "physics",
          subject: { id: "physics", name: "Vật lý", ebookUrl: null },
          title: "Mạch nối tiếp",
          chapter: "Điện",
          grade: 8,
          topic: "Mạch nối tiếp",
          learningObjective: "Nhận biết dòng điện",
          prerequisites: "",
          curriculum: "GDPT 2018",
          content: "Read",
          materials: [],
          steps: [{
            id: "step-practice-series-current",
            type: "BASIC_EXERCISE",
            position: 30,
            required: true,
            progress: [],
            basicExerciseAttempts: [],
            config: {
              passThreshold: 60,
              questions: [{
                id: "practice-current-question",
                prompt: "Current?",
                options: [{ id: "same-current", text: "Same" }, { id: "different-current", text: "Different" }],
                correctOptionId: "same-current",
              }],
            },
          }],
          ebookLocators: [],
        }),
      },
      assetVersion: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const controller = new LearningController(db as any, {} as any);

    const result = await controller.openCurriculumLesson("lesson-1", { user: { sub: "student-1" } });

    expect(result.steps[0]).toMatchObject({
      id: "step-practice-series-current",
      type: "BASIC_EXERCISE",
      resource: {
        passThreshold: 60,
        questions: [{
          id: "practice-current-question",
          options: [{ id: "same-current", text: "Same" }, { id: "different-current", text: "Different" }],
        }],
      },
    });
    expect(JSON.stringify(result.steps[0].resource)).not.toContain("correctOptionId");
  });

  it("exposes one digest-matched source PDF and suppresses invalid source pages", async () => {
    const digest = "a".repeat(64);
    const db = {
      lesson: { findFirst: vi.fn().mockResolvedValue({
        id: "lesson-source", subjectId: "science", subject: { id: "science", name: "Khoa học tự nhiên", ebookUrl: null },
        title: "Nguồn", chapter: "Chương 1", grade: 8, topic: "", learningObjective: "", prerequisites: "", curriculum: "", content: "", materials: [], steps: [], ebookLocators: [],
        packVersion: { id: "pack-v1", version: 1, digest: "pack-digest", manifest: {
          kind: "structured-lesson-candidate", book: { title: "KHTN 8", sha256: digest },
          sourceBlocks: [
            { id: "valid", physicalPageIndex: 13, printedPageLabel: "11", sourceSha256: digest },
            { id: "wrong-digest", physicalPageIndex: 14, sourceSha256: "b".repeat(64) },
            { id: "zero", physicalPageIndex: 0, sourceSha256: digest },
          ], learningContent: { sections: [] },
        } },
      }) },
      assetVersion: { findMany: vi.fn().mockResolvedValue([{ id: "assetversion1234567890", bytes: 25_151_587 }]) },
    };
    const result = await new LearningController(db as any, {} as any).openCurriculumLesson("lesson-source", { user: { sub: "student-1" } });
    expect(result.sourceDocument).toEqual({ assetVersionId: "assetversion1234567890", sourceDigest: digest, bytes: 25_151_587 });
    expect(db.assetVersion.findMany).toHaveBeenCalledWith({
      where: {
        sha256: digest,
        status: "READY",
        mime: "application/pdf",
        objectKey: { not: null },
        asset: { scope: "SHARED_LIBRARY", status: "ACTIVE", kind: "pdf" },
      },
      select: { id: true, bytes: true },
      take: 2,
    });
    expect(result.structuredContent?.sourceBlocks).toEqual([
      { id: "valid", physicalPageIndex: 13, printedPageLabel: "11" },
      { id: "wrong-digest", physicalPageIndex: null, printedPageLabel: null },
      { id: "zero", physicalPageIndex: null, printedPageLabel: null },
    ]);
  });

  it("does not look up source documents for a non-structured lesson manifest", async () => {
    const db = {
      lesson: { findFirst: vi.fn().mockResolvedValue({
        id: "lesson-other", subjectId: "science", subject: { id: "science", name: "Khoa học tự nhiên", ebookUrl: null },
        title: "Khác", chapter: "", grade: 8, topic: "", learningObjective: "", prerequisites: "", curriculum: "", content: "", materials: [], steps: [], ebookLocators: [],
        packVersion: { id: "pack-v1", version: 1, digest: "pack", manifest: { kind: "other", book: { sha256: "a".repeat(64) }, sourceBlocks: [] } },
      }) },
      assetVersion: { findMany: vi.fn() },
    };
    const result = await new LearningController(db as any, {} as any).openCurriculumLesson("lesson-other", { user: { sub: "student-1" } });
    expect(result.sourceDocument).toBeNull();
    expect(db.assetVersion.findMany).not.toHaveBeenCalled();
  });

  it("fails closed when more than one shared PDF has the source digest", async () => {
    const digest = "a".repeat(64);
    const db = {
      lesson: { findFirst: vi.fn().mockResolvedValue({
        id: "lesson-source", subjectId: "science", subject: { id: "science", name: "Khoa học tự nhiên", ebookUrl: null }, title: "Nguồn", chapter: "", grade: 8, topic: "", learningObjective: "", prerequisites: "", curriculum: "", content: "", materials: [], steps: [], ebookLocators: [],
        packVersion: { id: "pack-v1", version: 1, digest: "pack", manifest: { kind: "structured-lesson-candidate", book: { sha256: digest }, sourceBlocks: [], learningContent: {} } },
      }) },
      assetVersion: { findMany: vi.fn().mockResolvedValue([{ id: "one", bytes: 1 }, { id: "two", bytes: 1 }]) },
    };
    const result = await new LearningController(db as any, {} as any).openCurriculumLesson("lesson-source", { user: { sub: "student-1" } });
    expect(result.sourceDocument).toBeNull();
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

  it("keeps I3 test status while returning I1 catalog metadata for assigned lessons", async () => {
    const dueAt = new Date("2026-11-01T00:00:00Z");
    const assignmentRows = [
      {
        id: "lesson-assignment", title: "Bài được giao", contentId: "lesson-1", contentType: "lesson",
        dueDate: dueAt, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
      {
        id: "test-assignment", title: "Bài kiểm tra", contentId: "test-1", contentType: "test",
        classId: "class-1", dueDate: dueAt, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
      {
        id: "test-no-link", title: "Bài kiểm tra chưa xếp môn", contentId: "test-no-link", contentType: "test",
        classId: "class-1", dueDate: dueAt, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
      {
        id: "test-wrong-class", title: "Bài kiểm tra lớp khác", contentId: "test-wrong-class", contentType: "test",
        classId: "class-1", dueDate: dueAt, createdAt: new Date("2026-10-19T00:00:00Z"), classroom: { id: "class-1", name: "8A" },
      },
    ];
    const lesson = {
      id: "lesson-1", status: "published", title: "Mạch điện", subject: { id: "physics", name: "Vật lý" },
      grade: 8, chapter: "Điện học", topic: "Mạch điện", curriculumOrder: 12,
      curriculumChapter: { officialOrder: 3 }, curriculumTopic: { officialOrder: 2 },
    };
    const db = {
      assignment: { findMany: vi.fn().mockResolvedValue(assignmentRows) },
      lesson: { findMany: vi.fn().mockResolvedValue([lesson]), findUnique: vi.fn() },
      lab: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn() },
      classResource: { findMany: vi.fn().mockResolvedValue([
        { id: "test-1", classId: "class-1", lessonId: "lesson-1" },
        { id: "test-no-link", classId: "class-1", lessonId: null },
        { id: "test-wrong-class", classId: "class-2", lessonId: "lesson-1" },
      ]) },
      assignmentDeadlineRevision: { findMany: vi.fn().mockResolvedValue([{ id: "deadline-1", assignmentId: "test-assignment", revision: 1, dueAt }]) },
      assignmentSubmission: { findMany: vi.fn().mockResolvedValue([]) },
    };
    const controller = new LearningController(db as any, {} as any);

    const result = await controller.assignments({ user: { sub: "student-1" } });

    expect(result).toHaveLength(3);
    expect(result[0]).toMatchObject({ subject: { id: "physics", name: "Vật lý" }, grade: 8, chapterOrder: 3 });
    expect(result[1]).toMatchObject({
      id: "test-assignment", contentType: "test", subject: { id: "physics", name: "Vật lý" }, grade: 8,
      chapter: "Điện học", chapterOrder: 3, testStatus: { status: "UPCOMING", revision: 1 },
    });
    expect(result[2]).toMatchObject({ id: "test-no-link", contentType: "test", contentState: "AVAILABLE", canOpen: true });
    expect(result[2]).not.toHaveProperty("subject");
    expect(result.some((item: any) => item.id === "test-wrong-class")).toBe(false);
    expect(db.lesson.findMany).toHaveBeenCalledTimes(1);
    expect(db.classResource.findMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: { in: ["test-1", "test-no-link", "test-wrong-class"] }, kind: "TEST", status: { not: "DRAFT" } },
    }));
    expect(db.assignmentDeadlineRevision.findMany).toHaveBeenCalledTimes(1);
    expect(db.assignmentSubmission.findMany).toHaveBeenCalledTimes(1);
  });
});
