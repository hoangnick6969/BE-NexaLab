import { describe, expect, it } from "vitest";
import {
  buildPathwaySteps,
  materializeLegacySteps,
  reconcileVideoProgress,
  stepProgressActionSchema,
  validateLessonSteps,
} from "./pathway";

describe("lesson pathway", () => {
  it("materializes legacy content in deterministic order", () => {
    const steps = materializeLegacySteps({
      content: "<p>Read</p>",
      materials: [{ type: "video", url: "https://example.test/video", title: "Watch" }],
      questions: [{ prompt: "Safe server-only answer" }],
      labId: "circuit",
    });
    expect(steps.map((step) => [step.type, step.position])).toEqual([
      ["READING", 10], ["VIDEO", 20], ["QUIZ", 40], ["LAB", 50],
    ]);
  });

  it("rejects empty resources and duplicate positions", () => {
    expect(() => materializeLegacySteps({ content: " ", materials: [], questions: [] })).toThrow();
    expect(() => validateLessonSteps([
      { type: "READING" as const, position: 1, config: { html: "A" } },
      { type: "READING" as const, position: 1, config: { html: "B" } },
    ])).toThrow("unique positive positions");
  });

  it("uses the lesson text as the approved video equivalent when no video exists", () => {
    const steps = materializeLegacySteps({ content: "Equivalent", materials: [], questions: [] });
    expect(steps[1]).toMatchObject({
      type: "VIDEO",
      position: 20,
      config: { title: "Nội dung thay thế", equivalentText: "Equivalent" },
    });
  });

  it("normalizes historical null video URLs and exposes resume evidence", () => {
    const pathway = buildPathwaySteps([
      {
        id: "video",
        type: "VIDEO",
        position: 20,
        required: true,
        config: { url: null, title: "Equivalent", equivalentText: "Read this" },
        progress: [{ status: "IN_PROGRESS", progressValue: 40, lastPosition: 24 }],
      },
    ]);
    expect(pathway.steps[0]).toMatchObject({ lastPosition: 24, progressValue: 40 });
    expect(pathway.steps[0].resource).toEqual({ title: "Equivalent", equivalentText: "Read this" });
  });

  it("validates strict video timing and reconciles monotonic high-water evidence", () => {
    expect(() => stepProgressActionSchema.parse({
      action: "heartbeat",
      positionSeconds: 11,
      durationSeconds: 10,
    })).toThrow();
    expect(() => stepProgressActionSchema.parse({
      action: "ended",
      positionSeconds: Number.NaN,
      durationSeconds: 10,
    })).toThrow();

    const completedAt = new Date("2026-01-01T00:00:00.000Z");
    const result = reconcileVideoProgress(
      { title: "Watch", url: "https://example.test/video.mp4" },
      {
        status: "COMPLETED",
        progressValue: 92,
        lastPosition: 92,
        startedAt: completedAt,
        completedAt,
      },
      { action: "heartbeat", positionSeconds: 12, durationSeconds: 100 },
      new Date("2026-01-02T00:00:00.000Z"),
    );
    expect(result).toMatchObject({
      status: "COMPLETED",
      progressValue: 100,
      lastPosition: 92,
      startedAt: completedAt,
      completedAt,
    });
  });

  it("completes media at the precise 90 percent threshold or ended and gates fallback", () => {
    const now = new Date("2026-01-01T00:00:00.000Z");
    const config = { title: "Watch", url: "https://example.test/video.mp4", equivalentText: "Read this" };
    expect(reconcileVideoProgress(config, undefined, {
      action: "heartbeat", positionSeconds: 89, durationSeconds: 100,
    }, now).status).toBe("IN_PROGRESS");
    expect(reconcileVideoProgress(config, undefined, {
      action: "heartbeat", positionSeconds: 9, durationSeconds: 10,
    }, now).status).toBe("COMPLETED");
    expect(reconcileVideoProgress(config, undefined, {
      action: "ended", positionSeconds: 1, durationSeconds: 10,
    }, now)).toMatchObject({ status: "COMPLETED", progressValue: 100, lastPosition: 1 });
    expect(reconcileVideoProgress(config, undefined, { action: "complete-fallback" }, now)).toMatchObject({
      progressValue: 100,
      lastPosition: null,
    });
    expect(() => reconcileVideoProgress(
      { title: "Watch", url: "https://example.test/video.mp4" },
      undefined,
      { action: "complete-fallback" },
      now,
    )).toThrow("VIDEO_EQUIVALENT_UNAVAILABLE");
  });

  it("returns only the first core step as actionable and hides locked resources", () => {
    const pathway = buildPathwaySteps([
      { id: "read", type: "READING", position: 10, required: true, config: { html: "Read" } },
      { id: "cards", type: "STUDY_CARDS", position: 30, required: true, config: { cards: [{ id: "1", front: "F", back: "B" }] } },
      { id: "quiz", type: "QUIZ", position: 40, required: true, config: { questions: [{ answer: 1 }] } },
    ]);
    expect(pathway.nextStepId).toBe("read");
    expect(pathway.steps.map((step) => step.state)).toEqual(["IN_PROGRESS", "LOCKED", "LOCKED"]);
    expect(pathway.steps[1].resource).toBeNull();
    expect(JSON.stringify(pathway)).not.toContain("answer");
  });

  it("advances from completed evidence and rejects invalid high-water values", () => {
    const pathway = buildPathwaySteps([
      {
        id: "read",
        type: "READING",
        position: 10,
        required: true,
        config: { html: "Read" },
        progress: [{ status: "COMPLETED", progressValue: 100 }],
      },
      {
        id: "cards",
        type: "STUDY_CARDS",
        position: 30,
        required: true,
        config: { cards: [{ id: "1", front: "F", back: "B" }] },
      },
    ]);
    expect(pathway.steps.map((step) => step.state)).toEqual(["COMPLETED", "IN_PROGRESS"]);
    expect(pathway.nextStepId).toBe("cards");
    expect(() => buildPathwaySteps([
      {
        id: "read",
        type: "READING",
        position: 10,
        required: true,
        config: { html: "Read" },
        progress: [{ status: "IN_PROGRESS", progressValue: 101 }],
      },
    ])).toThrow("between 0 and 100");
    expect(() => buildPathwaySteps([
      {
        id: "video",
        type: "VIDEO",
        position: 20,
        required: true,
        config: { title: "Watch", url: "https://example.test/video.mp4" },
        progress: [{ status: "IN_PROGRESS", progressValue: 10, lastPosition: -1 }],
      },
    ])).toThrow("valid integer second");
  });
});

