import { describe, expect, it } from "vitest";
import { parseAssignmentIdQuery } from "./assignment-query";

describe("assignment context query", () => {
  it("accepts an omitted or one non-empty assignment ID", () => {
    expect(parseAssignmentIdQuery({})).toBeUndefined();
    expect(parseAssignmentIdQuery({ assignmentId: "assignment-1" })).toBe("assignment-1");
  });

  it("rejects empty and repeated assignment IDs instead of broadening assignment selection", () => {
    expect(() => parseAssignmentIdQuery({ assignmentId: "" })).toThrow();
    expect(() => parseAssignmentIdQuery({ assignmentId: ["assignment-1", "assignment-2"] })).toThrow();
  });
});
