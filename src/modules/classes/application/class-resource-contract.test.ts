import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { normalizeResourceContent, parseResourceCsv, studentResource } from "./class-resource-contract";

describe("Class Space resource contract", () => {
  it("stores direct study quizzes without grading keys and rejects unknown fields", () => {
    const content = normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "Nước sôi ở?", options: ["100°C", "0°C"] }] });
    expect(content.questions[0].options).toHaveLength(2);
    expect(content.questions[0]).not.toHaveProperty("correctOption");
    expect(() => normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "x", options: ["a", "b"], correctOption: 0 }] })).toThrow();
  });

  it("keeps test answers out of member content", () => {
    const content = normalizeResourceContent("TEST", { questions: [{ prompt: "q", options: ["a", "b"], correctOption: 1 }] });
    expect(content.questions[0].correctOption).toBe(1);
    expect(studentResource("TEST", content).questions[0]).not.toHaveProperty("correctOption");
  });

  it("keeps optional custom covers and rejects insecure image links", () => {
    const questions = [{ prompt: "q", options: ["a", "b"], correctOption: 1 }];
    expect(normalizeResourceContent("TEST", { questions, thumbnailUrl: "https://example.test/cover.webp" }).thumbnailUrl).toBe("https://example.test/cover.webp");
    expect(() => normalizeResourceContent("TEST", { questions, thumbnailUrl: "http://example.test/cover.webp" })).toThrow();
  });

  it("rejects test keys that point past the available options", () => {
    expect(() => normalizeResourceContent("TEST", { questions: [{ prompt: "q", options: ["a", "b"], correctOption: 2 }] })).toThrow(BadRequestException);
  });

  it("parses CSV with quoted commas and creates an ungraded practice draft payload", () => {
    const result = parseResourceCsv("STUDY_QUIZ", 'prompt,optionA,optionB,optionC,optionD,explanation\n"Cộng 1, 2?",3,4,,,');
    expect(result.errors).toEqual([]);
    expect(result.data?.questions[0].prompt).toBe("Cộng 1, 2?");
    expect(result.data?.questions[0].options).toHaveLength(2);
    expect(result.data?.questions[0]).not.toHaveProperty("correctOption");
  });

  it("does not return partial data when a CSV row is invalid or duplicated", () => {
    const invalid = parseResourceCsv("DECK", "front,back\na,b\nc,");
    expect(invalid.data).toBeNull();
    expect(invalid.errors[0]).toMatchObject({ row: 3, field: "back" });
    const duplicate = parseResourceCsv("DECK", "front,back\na,b\na,b");
    expect(duplicate.data).toBeNull();
    expect(duplicate.errors[0]).toMatchObject({ row: 3, field: "row" });
  });
});
