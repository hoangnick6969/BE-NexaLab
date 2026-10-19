import { describe, expect, it, vi } from "vitest";
import { FoundationalProgressService } from "./foundational-progress.service";

describe("FoundationalProgressService", () => {
  it("derives fixed-course evidence only from unassigned source records", async () => {
    const createdAt = new Date("2026-10-19T00:00:00.000Z");
    const db = {
      foundationalCourseVersion: {
        findMany: vi.fn().mockResolvedValue([{
          id: "course-v1",
          version: "v1",
          sourceVersion: "official-2026",
          grade: 8,
          subject: { id: "science", name: "Khoa học tự nhiên" },
          lessons: [{
            officialOrder: 1,
            foundationalLabId: "lab-1",
            lesson: {
              id: "lesson-1",
              title: "Bài 1",
              steps: [
                { id: "reading-1", type: "READING", basicExerciseAttempts: [] },
                { id: "video-1", type: "VIDEO", basicExerciseAttempts: [] },
                { id: "exercise-1", type: "BASIC_EXERCISE", basicExerciseAttempts: [{ id: "exercise-attempt-1", score: 60, passThreshold: 80, passed: false, createdAt }] },
              ],
            },
          }],
        }]),
      },
      stepProgress: { findMany: vi.fn().mockResolvedValue([
        { id: "reading-evidence", stepId: "reading-1", status: "COMPLETED", progressValue: 100, updatedAt: createdAt },
        { id: "video-evidence", stepId: "video-1", status: "IN_PROGRESS", progressValue: 40, updatedAt: createdAt },
      ]) },
      attempt: { findMany: vi.fn().mockResolvedValue([
        { id: "lab-attempt", challenge: { labId: "lab-1" }, verdict: "passed", createdAt },
      ]) },
    };
    const service = new FoundationalProgressService(db as any);

    const result = await service.forStudent("student-1", 8);
    const course = result.courses[0];

    expect(result.courseVersionConfigured).toBe(true);
    expect(course.summary).toMatchObject({ totalEvidenceItems: 4, completedEvidenceItems: 2, content: 1, video: 0, basicExercise: 0, requiredLabs: 1, percent: 50 });
    expect(course.lessons[0].evidence.map((item: any) => item.state)).toEqual(["COMPLETED", "IN_PROGRESS", "IN_PROGRESS"]);
    expect(course.lessons[0].evidence[2]).toMatchObject({ score: 60, passThreshold: 80, passed: false, sourceId: "exercise-attempt-1" });
    expect(db.stepProgress.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignmentId: null }) }));
    expect(db.attempt.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ assignmentId: null, lessonStepId: null }) }));
    const includedStepQuery = db.foundationalCourseVersion.findMany.mock.calls[0][0].include.lessons.include.lesson.include.steps.include.basicExerciseAttempts;
    expect(includedStepQuery.where).toEqual({ studentId: "student-1" });
  });

  it("returns an unconfigured empty state when the student has no grade or active course version", async () => {
    const db = { foundationalCourseVersion: { findMany: vi.fn().mockResolvedValue([]) }, stepProgress: { findMany: vi.fn() }, attempt: { findMany: vi.fn() } };
    const service = new FoundationalProgressService(db as any);

    const noGrade = await service.forStudent("student-1", null);
    const noVersion = await service.forStudent("student-1", 8);

    expect(noGrade.courseVersionConfigured).toBe(false);
    expect(noVersion).toMatchObject({ courses: [], courseVersionConfigured: false });
  });
});
