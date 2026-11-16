import { describe, expect, it } from "vitest";
import { parseFl26MendelConfig } from "./mendel-config";

const base = {
  schema: "fl26-mendel-config@1",
  labId: "fl-26-explore",
  catalogId: "FL-26",
  configVersion: 1,
  kit: "k8-garden",
  engine: "mendel-cross@1.0.0",
  title: "Lai Mendel một tính trạng",
  outcomeSummary: ["Dự đoán tỉ lệ kiểu gen và kiểu hình của đời con"],
  safetyBriefing: { simulation: ["Mô phỏng, không dùng cây thật"], realLab: ["Trồng cây đậu thật cần theo dõi"], acknowledgeRequired: false },
  limitations: ["Chỉ một tính trạng, trội hoàn toàn"],
  modes: { explore: true },
  enabledApparatus: [{ id: "garden-pot", kind: "pot", slot: "bench-1" }],
  measurements: ["genotypeRatio", "phenotypeRatio"],
  pedagogy: { observationPrompts: [{ id: "p1", kind: "note", textVi: "Quan sát tỉ lệ con lai" }] },
  review: { status: "draft" },
  spec: { model: "mendel-cross@1.0.0", cross: "monohybrid", allowedParents: [["Aa", "Aa"], ["AA", "aa"]] },
};

describe("FL-26 mendel config (D2-1.3)", () => {
  it("accepts a valid monohybrid config", () => {
    expect(parseFl26MendelConfig(base).spec.allowedParents).toHaveLength(2);
  });

  it("rejects a config on another kit", () => {
    expect(() => parseFl26MendelConfig({ ...base, kit: "k2-wet-bench" })).toThrow();
  });

  it("rejects a parent pair the model cannot read", () => {
    expect(() => parseFl26MendelConfig({ ...base, spec: { ...base.spec, allowedParents: [["Ab", "Aa"]] } })).toThrow();
  });

  it("rejects an unknown model version", () => {
    expect(() => parseFl26MendelConfig({ ...base, spec: { ...base.spec, model: "mendel-cross@2.0.0" } })).toThrow();
  });
});
