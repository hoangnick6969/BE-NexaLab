import { describe, expect, it } from "vitest";
import { dioramaExploreSchema, fl16ExploreSchema, fl16PowerResult, fl20ToleranceResult, fl21RemovalResult, fl27ExploreSchema, fl27VariantResult } from "./explore-kits";

const envelope = {
  schema: "explore-lab@1", labId: "x", configVersion: 1, engine: "x@1.0.0", title: "Bài thử", kit: "x",
  outcomeSummary: ["Quan sát một thay đổi."],
  safetyBriefing: { simulation: ["Mô phỏng."], realLab: ["Thận trọng."], acknowledgeRequired: false },
  limitations: ["Giới hạn mô hình."], modes: { explore: true },
  enabledApparatus: [{ id: "a1", kind: "k", slot: "s1" }], measurements: [],
  pedagogy: {}, review: { status: "draft" },
};
const fl21 = { ...envelope, labId: "fl-21-explore", catalogId: "FL-21", kit: "k8-diorama", engine: "food-web@1.0.0",
  spec: { model: "food-web@1.0.0", allowedRemovals: ["ran", "tho"] } };
const fl20 = { ...envelope, labId: "fl-20-explore", catalogId: "FL-20", kit: "k8-diorama", engine: "ecology-tolerance@1.0.0",
  spec: { model: "ecology-tolerance@1.0.0", allowedSpecies: ["ca-ro-phi"], factor: "TEMPERATURE" } };
const fl27 = { ...envelope, labId: "fl-27-explore", catalogId: "FL-27", kit: "k7-molecular", engine: "gene-expression@1.0.0",
  spec: { model: "gene-expression@1.0.0", allowedVariants: ["gene-a-missense", "gene-a-nonsense"] } };
const fl16 = { ...envelope, labId: "fl-16-explore", catalogId: "FL-16", kit: "anatomy", engine: "eye-optics@1.0.0",
  spec: { model: "eye-optics@1.0.0", allowedScenarios: ["normal-near", "myopia-far"] } };

describe("INC-3 Explore configs (D2-3.1, D2-3.2)", () => {
  it("FL-21 and FL-20 share kit k8-diorama and are told apart by catalog id", () => {
    expect(dioramaExploreSchema.parse(fl21).catalogId).toBe("FL-21");
    expect(dioramaExploreSchema.parse(fl20).catalogId).toBe("FL-20");
  });
  it("refuses a decomposer in the FL-21 removal list", () => {
    expect(() => dioramaExploreSchema.parse({ ...fl21, spec: { ...fl21.spec, allowedRemovals: ["nam-vi-khuan"] } })).toThrow();
  });
  it("refuses a tolerance species the model does not carry", () => {
    expect(() => dioramaExploreSchema.parse({ ...fl20, spec: { ...fl20.spec, allowedSpecies: ["fish-a"] } })).toThrow();
  });
  it("accepts the FL-27 and FL-16 configs and refuses unknown variants and scenarios", () => {
    expect(fl27ExploreSchema.parse(fl27).kit).toBe("k7-molecular");
    expect(() => fl27ExploreSchema.parse({ ...fl27, spec: { ...fl27.spec, allowedVariants: ["gene-z"] } })).toThrow();
    expect(fl16ExploreSchema.parse(fl16).kit).toBe("anatomy");
    expect(() => fl16ExploreSchema.parse({ ...fl16, spec: { ...fl16.spec, allowedScenarios: ["unknown"] } })).toThrow();
  });
});

describe("INC-3 answers come from the released models", () => {
  it("FL-21: removing the snake releases its prey", () => {
    expect(fl21RemovalResult("ran").effects.ech.effect).toBe("INCREASE");
  });
  it("FL-20: 25 °C is inside the tolerance of ca-ro-phi", () => {
    expect(fl20ToleranceResult("ca-ro-phi", 250).zone).toBe("WITHIN");
  });
  it("FL-27: a nonsense variant gives a stop codon", () => {
    expect(fl27VariantResult("gene-a-nonsense").mutation.effect).toBe("NONSENSE");
  });
  it("FL-16: the required power follows the released formula", () => {
    expect(fl16PowerResult("normal-near").powerD).toBeCloseTo(1.336 / 0.0226 + 1 / 0.25, 6);
    expect(fl16PowerResult("myopia-far").powerD).toBeCloseTo(1.336 / 0.0234, 6);
  });
});
