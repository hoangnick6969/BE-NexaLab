import { describe, expect, it } from "vitest";
import { BadRequestException } from "@nestjs/common";
import { normalizeResourceContent, parseResourceCsv, studentResource } from "./class-resource-contract";

describe("Class Space resource contract", () => {
  it("stores study quizzes with an optional answer key, shown to students as feedback, and rejects unknown fields", () => {
    const content = normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "Nước sôi ở?", options: ["100°C", "0°C"] }] });
    expect(content.questions[0].options).toHaveLength(2);
    expect(content.questions[0]).not.toHaveProperty("correctOption");
    const keyed = normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "x", options: ["a", "b"], correctOption: 1, explanation: "vì b" }] });
    expect(keyed.questions[0]).toMatchObject({ correctOption: 1, explanation: "vì b" });
    // Practice is unscored, so the key reaches the student for instant right/wrong feedback (TEST still strips it).
    expect(studentResource("STUDY_QUIZ", keyed).questions[0].correctOption).toBe(1);
    expect(() => normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "x", options: ["a", "b"], correctOption: 2 }] })).toThrow();
    expect(() => normalizeResourceContent("STUDY_QUIZ", { questions: [{ prompt: "x", options: ["a", "b"], answer: 0 }] })).toThrow();
  });

  it("imports a study quiz CSV with or without the correctOption column", () => {
    const keyHeader = "prompt,optionA,optionB,optionC,optionD,correctOption,explanation";
    const withKey = parseResourceCsv("STUDY_QUIZ", `${keyHeader}\nq?,a,b,,,B,vì b\n`);
    expect(withKey.errors).toEqual([]);
    expect(withKey.data!.questions[0]).toMatchObject({ correctOption: 1, explanation: "vì b" });
    const withoutKey = parseResourceCsv("STUDY_QUIZ", "prompt,optionA,optionB,optionC,optionD,explanation\nq?,a,b,,,\n");
    expect(withoutKey.errors).toEqual([]);
    expect(withoutKey.data!.questions[0]).not.toHaveProperty("correctOption");
    expect(parseResourceCsv("STUDY_QUIZ", `${keyHeader}\nq?,a,b,,,D,\n`).errors[0]).toMatchObject({ field: "correctOption" });
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
