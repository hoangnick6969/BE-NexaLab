import { describe, expect, it } from "vitest";
import { lessonSubjectMatchesLab } from "./lab-release-bindings";

describe("release Lesson subject binding", () => {
  it("accepts exact subject IDs and the KHTN umbrella subject for the legacy Physics Lab", () => {
    expect(lessonSubjectMatchesLab("physics", "physics")).toBe(true);
    expect(lessonSubjectMatchesLab("physics", "khtn")).toBe(true);
  });

  it("keeps unrelated cross-subject bindings invalid", () => {
    expect(lessonSubjectMatchesLab("physics", "chemistry")).toBe(false);
    expect(lessonSubjectMatchesLab("biology", "khtn")).toBe(false);
  });
});
