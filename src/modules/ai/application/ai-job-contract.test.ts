import { describe, expect, it } from "vitest";
import { ZodError } from "zod";
import { createAiJobBody, normalizeCreateBody, toAiJobView } from "./ai-job-contract";

const base = { purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: "lesson-circuit", itemCount: 10 };
const fails = (body: unknown) => expect(() => createAiJobBody.parse(body)).toThrow(ZodError);

describe("create body (discriminated union on purpose)", () => {
  it("accepts a minimal GENERATE_RESOURCE body", () => expect(createAiJobBody.parse(base)).toEqual(base));

  it("requires a known purpose", () => {
    const { purpose: _purpose, ...withoutPurpose } = base;
    fails(withoutPurpose);
    fails({ ...base, purpose: "DRAFT_LAB_CHALLENGE" });
    fails({ ...base, purpose: "generate_resource" });
  });

  it("is strict", () => fails({ ...base, provider: "gemini" }));

  it("enforces 1-20 questions and 1-30 cards", () => {
    expect(createAiJobBody.parse({ ...base, itemCount: 20 }).itemCount).toBe(20);
    fails({ ...base, itemCount: 21 });
    fails({ ...base, targetKind: "STUDY_QUIZ", itemCount: 21 });
    expect(createAiJobBody.parse({ ...base, targetKind: "DECK", itemCount: 30 }).itemCount).toBe(30);
    fails({ ...base, targetKind: "DECK", itemCount: 31 });
    fails({ ...base, itemCount: 0 });
    fails({ ...base, itemCount: 2.5 });
  });

  it("bounds outcome codes and instruction", () => {
    fails({ ...base, outcomeCodes: Array.from({ length: 11 }, (_, i) => `C${i}`) });
    fails({ ...base, outcomeCodes: ["A", "A"] });
    fails({ ...base, instruction: "x".repeat(1001) });
    expect(createAiJobBody.parse({ ...base, instruction: `  ${"x".repeat(1000)}  ` }).instruction).toHaveLength(1000);
  });

  it("normalizes empty optionals to null so equivalent bodies hash the same", () => {
    const a = normalizeCreateBody(createAiJobBody.parse({ ...base, instruction: "   ", outcomeCodes: [] }));
    const b = normalizeCreateBody(createAiJobBody.parse(base));
    expect(a).toEqual(b);
    expect(a).toEqual({ ...base, difficulty: null, outcomeCodes: null, instruction: null });
  });
});

describe("toAiJobView", () => {
  const job = {
    id: "j1", classId: "c1", lessonId: "l1", targetKind: "TEST", status: "SUCCEEDED", failureCode: null,
    promptVersion: "generate-resource@1", outputSchemaVersion: "resource-items@1", model: "fake-model",
    request: { itemCount: 3 }, droppedItems: [{ position: 2, reasonCodes: ["X"] }], inputTokens: 5, outputTokens: 7,
    materializedResourceId: null, createdAt: new Date("2026-11-05T00:00:00Z"), completedAt: new Date("2026-11-05T00:00:05Z"),
  };

  it("summarizes counts, usage and the latest decision", () => {
    const view = toAiJobView(job, {
      lessonChangedSinceGeneration: true,
      items: [{ id: "i1", position: 0, payload: { a: 1 }, flags: ["NEGATIVE_STEM"], decisions: [{ decision: "REJECTED", editedPayload: null, reasonCode: "WRONG", createdAt: new Date("2026-11-05T00:01:00Z") }] }],
    });
    expect(view).toMatchObject({ requestedCount: 3, validCount: 1, droppedCount: 1, usage: { inputTokens: 5, outputTokens: 7 }, lessonChangedSinceGeneration: true });
    expect(view.items![0].decision).toEqual({ decision: "REJECTED", editedPayload: null, reasonCode: "WRONG", at: "2026-11-05T00:01:00.000Z" });
  });

  it("leaves counts null while the job is not validated and omits items on list", () => {
    const view = toAiJobView({ ...job, status: "RUNNING", droppedItems: [] }, { lessonChangedSinceGeneration: false, itemCount: 0 });
    expect(view).toMatchObject({ validCount: null, droppedCount: null });
    expect(view).not.toHaveProperty("items");
    expect(toAiJobView(job, { lessonChangedSinceGeneration: false, itemCount: 4 }).validCount).toBe(4);
  });
});
