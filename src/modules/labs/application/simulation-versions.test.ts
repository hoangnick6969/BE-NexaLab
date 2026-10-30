import { describe, expect, it } from "vitest";
import { evaluate, goldenCaseResults, goldenTemplates, packConfigurationErrors, versionErrors, versionInputSchema, versionParams } from "./simulation-versions";
import { validateContentStudioBlueprint } from "./content-studio-validation";
import { MODEL_REGISTRY } from "./sim-packs";

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
  it("keeps the bulb activity independent of the legacy LED parameter ranges", () => {
    const pack = { labId: "circuit", modelRef: "circuit-bulb@1.0.0", engineVersion: "1.0.0", template: { ranges: {} } };
    const config = { labId: "circuit", modelRef: "circuit-bulb@1.0.0" };
    expect(packConfigurationErrors("circuit", pack, config, null)).toEqual([]);
    expect(packConfigurationErrors("circuit", pack, config, { maxCurrentMa: 10 })).toEqual(
      expect.arrayContaining([expect.stringContaining("không dùng tham số")]),
    );
  });

  it("accepts only compatible model and parameter values within reviewed pack ranges", () => {
    const pack = { labId: "circuit", modelRef: "circuit@1.0.0", engineVersion: "1.0.0", template: { ranges: {
      maxCurrentMa: { min: 5, max: 10 }, minLitLeds: { min: 1, max: 3 },
    } } };
    const config = { labId: "circuit", modelRef: "circuit@1.0.0" };
    expect(packConfigurationErrors("circuit", pack, config, { maxCurrentMa: 10, minLitLeds: 1 })).toEqual([]);
    expect(packConfigurationErrors("circuit", pack, config, { maxCurrentMa: 20, minLitLeds: 1 })).toEqual(
      expect.arrayContaining([expect.stringContaining("maxCurrentMa")]),
    );
    expect(packConfigurationErrors("circuit", pack, config, null)).toEqual(
      expect.arrayContaining([expect.stringContaining("mặc định maxCurrentMa")]),
    );
    const missingDefaultRange = { ...pack, template: { ranges: { maxCurrentMa: { min: 5, max: 20 } } } };
    expect(packConfigurationErrors("circuit", missingDefaultRange, config, { maxCurrentMa: 10 })).toEqual(
      expect.arrayContaining([expect.stringContaining("mặc định minLitLeds")]),
    );
    expect(packConfigurationErrors("circuit", pack, { ...config, modelRef: "circuit@2.0.0" }, null)).toEqual(
      expect.arrayContaining([expect.stringContaining("không khớp")]),
    );
  });

  it("accepts allowlisted in-range parameters whose golden cases reproduce", () => {
    const candidate = input();
    expect(versionErrors("circuit", ["circuit_001"], candidate)).toEqual([]);
    expect(goldenCaseResults("circuit", candidate).every((g) => g.ok)).toBe(true);
  });

  it("validates bulb-model configs without applying legacy LED parameter rules", () => {
    const state = (closed: boolean) => ({
      nodes: [{ id: "battery", type: "battery" }, { id: "bulb", type: "bulb" }, { id: "switch", type: "switch", closed }],
      edges: [{ source: "battery", target: "bulb" }, { source: "bulb", target: "switch" }, { source: "switch", target: "battery" }],
    });
    const bulbConfig = input({
      challengeParams: { circuit_001: {} },
      goldenCases: [
        { challengeId: "circuit_001", label: "Công tắc đóng: đèn sáng", labState: state(true), expectedVerdict: "passed" },
        { challengeId: "circuit_001", label: "Công tắc mở: đèn tắt", labState: state(false), expectedVerdict: "passed" },
      ],
    });
    expect(versionErrors("circuit", ["circuit_001"], bulbConfig, "circuit-bulb@1.0.0")).toEqual([]);
    expect(goldenCaseResults("circuit", bulbConfig, "circuit-bulb@1.0.0").every((item) => item.ok)).toBe(true);
    const invalidParams = input({ challengeParams: { circuit_001: { maxCurrentMa: 15 } } });
    expect(versionErrors("circuit", ["circuit_001"], invalidParams, "circuit-bulb@1.0.0").join(" ")).toContain("không dùng tham số thử thách LED");
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

  it("validates an editable Content Studio blueprint without storing or activating it", () => {
    const config = input();
    expect(validateContentStudioBlueprint({ labId: "circuit", modelRef: "circuit@1.0.0", challengeIds: ["circuit_001"], config })).toEqual(
      expect.objectContaining({ ok: true, errors: [], golden: expect.arrayContaining([expect.objectContaining({ ok: true })]) }),
    );
    expect(validateContentStudioBlueprint({ labId: "circuit", modelRef: "chemistry@1.0.0", challengeIds: ["circuit_001"], config })).toEqual(
      expect.objectContaining({ ok: false, errors: expect.arrayContaining([expect.stringContaining("does not match")]) }),
    );
  });

  it("validates a registered successor with that exact model, not the first Lab model", () => {
    const ref = "circuit@fixture-2.0.0";
    MODEL_REGISTRY[ref] = { ...MODEL_REGISTRY["circuit@1.0.0"], simulate: () => ({ verdict: "not_passed" }) };
    try {
      const config = input({ goldenCases: [{ challengeId: "circuit_001", label: "fixture", labState: circuit[2].labState, expectedVerdict: "needs_practice" }] });
      expect(validateContentStudioBlueprint({ labId: "circuit", modelRef: ref, challengeIds: ["circuit_001"], config })).toEqual(
        expect.objectContaining({ ok: true, errors: [], golden: [expect.objectContaining({ actual: "needs_practice", ok: true })] }),
      );
    } finally {
      delete MODEL_REGISTRY[ref];
    }
  });
});
