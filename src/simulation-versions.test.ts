import { describe, expect, it } from "vitest";
import { evaluate, goldenCaseResults, goldenTemplates, versionErrors, versionInputSchema, versionParams } from "./simulation-versions";

const circuit = goldenTemplates("circuit");
const input = (overrides: Record<string, unknown> = {}) =>
  versionInputSchema.parse({
    challengeParams: { circuit_001: { maxCurrentMa: 10, minLitLeds: 1 } },
    goldenCases: [
      { challengeId: "circuit_001", label: "470 Ω", labState: circuit[2].labState, expectedVerdict: "partial" },
      { challengeId: "circuit_001", label: "1000 Ω", labState: circuit[3].labState, expectedVerdict: "passed" },
    ],
    reason: "Siết dòng tối đa cho lớp nâng cao",
    ...overrides,
  });

describe("simulation configuration versions (C2-T3)", () => {
  it("accepts allowlisted in-range parameters whose golden cases reproduce", () => {
    const candidate = input();
    expect(versionErrors("circuit", ["circuit_001"], candidate)).toEqual([]);
    expect(goldenCaseResults("circuit", candidate).every((g) => g.ok)).toBe(true);
  });

  it("rejects unknown models, mismatched challenges, out-of-range and unknown parameters", () => {
    expect(versionErrors("plasma", ["plasma_001"], input())).toEqual([expect.stringContaining("không nằm trong danh sách cho phép")]);
    expect(versionErrors("circuit", ["circuit_002"], input()).join(" ")).toContain("không thuộc phòng thực hành này");
    const bad = input({ challengeParams: { circuit_001: { maxCurrentMa: 50, script: "process.exit()" } } });
    const errors = versionErrors("circuit", ["circuit_001"], bad).join(" ");
    expect(errors).toContain("5 đến 20 mA");
    expect(errors).toContain('"script" không được phép');
  });

  it("rejects extra fields and requires a golden case for every configured challenge", () => {
    expect(() => versionInputSchema.parse({ ...input(), binding: "eval()" })).toThrow();
    const candidate = input({
      challengeParams: { circuit_002: { maxCurrentMa: 10 } },
      goldenCases: [{ challengeId: "circuit_001", label: "x", labState: circuit[0].labState, expectedVerdict: "needs_practice" }],
    });
    expect(versionErrors("circuit", ["circuit_001", "circuit_002"], candidate)).toEqual(['Thử thách "circuit_002" cần ít nhất một ca mẫu']);
  });

  it("reports a golden-case mismatch instead of storing it", () => {
    const wrong = input({
      goldenCases: [{ challengeId: "circuit_001", label: "470 Ω", labState: circuit[2].labState, expectedVerdict: "passed" }],
    });
    expect(goldenCaseResults("circuit", wrong)).toEqual([expect.objectContaining({ ok: false, expected: "passed", actual: "partial" })]);
  });

  it("evaluates the same state differently only through the pinned version's parameters", () => {
    const state = circuit[2].labState;
    expect(evaluate("circuit", state, null).verdict).toBe("passed");
    const v2 = { challengeParams: { circuit_001: { maxCurrentMa: 10 } } };
    expect(evaluate("circuit", state, versionParams(v2, "circuit_001")).verdict).toBe("partial");
    expect(versionParams(v2, "circuit_002")).toBeNull();
    expect(evaluate("eye", goldenTemplates("eye")[0].labState, null).verdict).toBe("needs_practice");
  });
});
