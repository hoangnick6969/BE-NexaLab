import { describe, expect, it } from "vitest";
import { projectJourney } from "./learning-journey";

const row = (id: string, order: number, position: number, coveragePercent: number) => ({
  id, studentId: "s", assignmentId: "a", durationSeconds: 100, watchedRanges: [{ startSecond: 0, endSecond: coveragePercent }], watchedSeconds: coveragePercent, replaySeconds: 0, coveragePercent, lastPosition: coveragePercent, completionMethod: coveragePercent === 100 ? "VIDEO_COVERAGE" : null, startedAt: new Date("2026-01-01"), completedAt: coveragePercent === 100 ? new Date("2026-01-02") : null, lastObservedAt: new Date("2026-01-02"), step: { id, type: "VIDEO", position, config: { title: id }, lesson: { id: `l${order}`, title: `Lesson ${order}`, curriculumOrder: order } },
});

describe("projectJourney", () => {
  it("orders by curriculum and step and exposes server coverage", () => {
    const result = projectJourney([row("b", 2, 20, 10), row("a", 1, 30, 100)]);
    expect(result.map((item) => item.evidenceId)).toEqual(["a", "b"]);
    expect(result[0]).toMatchObject({ state: "COMPLETED", video: { coveragePercent: 100 } });
    expect(result[1]).toMatchObject({ state: "IN_PROGRESS", step: { title: "b" } });
  });
  it("does not expose malformed watched ranges", () => {
    expect(projectJourney([{ ...row("a", 1, 1, 0), watchedRanges: {} }])[0].video.watchedRanges).toEqual([]);
  });
});
