import { describe, expect, it } from "vitest";
import { buildPathwaySteps, materializeLegacySteps, validateLessonSteps } from "./pathway";

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
  });
});

