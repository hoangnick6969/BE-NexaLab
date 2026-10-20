import { describe, expect, it } from "vitest";
import { basicExerciseAttemptRequestSchema, evaluateBasicExercise, sanitizeBasicExerciseConfig } from "./modules/lessons/application/pathway";

const config = {
  passThreshold: 80,
  questions: [
    { id: "q1", prompt: "Q1", options: [{ id: "a", text: "A" }, { id: "b", text: "B" }], correctOptionId: "a" },
    { id: "q2", prompt: "Q2", options: [{ id: "c", text: "C" }, { id: "d", text: "D" }], correctOptionId: "d" },
  ],
};

describe("basic exercise", () => {
  it("uses the configured pass threshold, not the scored-quiz threshold", () => {
    const request = basicExerciseAttemptRequestSchema.parse({
      answers: [{ questionId: "q1", optionId: "a" }, { questionId: "q2", optionId: "c" }],
      idempotencyKey: "4c8ecb4e-890f-4fc1-9c49-fc1ea78bd978",
    });
    expect(evaluateBasicExercise(config, request)).toEqual({ score: 50, passThreshold: 80, passed: false });
    expect(sanitizeBasicExerciseConfig(config)).not.toHaveProperty("questions.0.correctOptionId");
  });

  it("passes only when score reaches the configured threshold", () => {
    const request = basicExerciseAttemptRequestSchema.parse({
      answers: [{ questionId: "q1", optionId: "a" }, { questionId: "q2", optionId: "d" }],
      idempotencyKey: "e6a034b9-6851-4214-a204-4c48071e0361",
    });
    expect(evaluateBasicExercise(config, request).passed).toBe(true);
  });
});
