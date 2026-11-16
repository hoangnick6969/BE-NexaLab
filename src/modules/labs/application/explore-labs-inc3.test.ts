import { describe, expect, it } from "vitest";
import { EXPLORE_BENCHES, exploreActivitySpecSchema } from "./explore-labs";

const envelope = {
  schema: "explore-lab@1", configVersion: 1, title: "Bài thử", outcomeSummary: ["Quan sát một thay đổi."],
  safetyBriefing: { simulation: ["Mô phỏng."], realLab: ["Thận trọng."], acknowledgeRequired: false },
  limitations: ["Giới hạn mô hình."], modes: { explore: true }, enabledApparatus: [{ id: "a1", kind: "k", slot: "s1", labelVi: "Dụng cụ" }],
  measurements: [], pedagogy: {}, review: { status: "draft" },
};
const fl21 = { ...envelope, labId: "fl-21-explore", catalogId: "FL-21", kit: "k8-diorama", engine: "food-web@1.0.0", spec: { model: "food-web@1.0.0", allowedRemovals: ["ran"] } };
const fl20 = { ...envelope, labId: "fl-20-explore", catalogId: "FL-20", kit: "k8-diorama", engine: "ecology-tolerance@1.0.0", spec: { model: "ecology-tolerance@1.0.0", allowedSpecies: ["ca-ro-phi"], factor: "TEMPERATURE" } };
const fl27 = { ...envelope, labId: "fl-27-explore", catalogId: "FL-27", kit: "k7-molecular", engine: "gene-expression@1.0.0", spec: { model: "gene-expression@1.0.0", allowedVariants: ["gene-a-nonsense"] } };
const fl16 = { ...envelope, labId: "fl-16-explore", catalogId: "FL-16", kit: "anatomy", engine: "eye-optics@1.0.0", spec: { model: "eye-optics@1.0.0", allowedScenarios: ["normal-near"] } };

describe("INC-3 benches in the server registry", () => {
  it("registers the three kits next to the existing benches", () => {
    expect(Object.keys(EXPLORE_BENCHES).sort()).toEqual(["anatomy", "k2-safety-scenario@1", "k2-wet-bench@1", "k3-fluid-bench@1", "k4-thermal-bench@1", "k5-lever-bench@1", "k7-molecular", "k8-diorama", "k8-garden"]);
  });

  it("k8-diorama answers with the model of each Lab (food web for FL-21, tolerance for FL-20)", () => {
    const bench = EXPLORE_BENCHES["k8-diorama"];
    const ref = (config: unknown) => bench.modelRefOf?.(config) ?? bench.modelRef;
    const a = bench.validate(fl21), b = bench.validate(fl20);
    expect(a.ok && b.ok).toBe(true);
    if (!a.ok || !b.ok) return;
    expect(ref(a.config)).toBe("food-web@1.0.0");
    expect(ref(b.config)).toBe("ecology-tolerance@1.0.0");
  });

  it("each bench refuses a config from another kit and builds a spec the schema accepts", () => {
    for (const [kit, config] of [["k8-diorama", fl21], ["k7-molecular", fl27], ["anatomy", fl16]] as const) {
      const bench = EXPLORE_BENCHES[kit];
      const checked = bench.validate(config);
      expect(checked.ok).toBe(true);
      if (!checked.ok) continue;
      expect(() => exploreActivitySpecSchema.parse({ ...bench.activitySpec(checked.config), explore: checked.config })).not.toThrow();
      expect(bench.validate({ ...config, kit: "k2-wet-bench@1" }).ok).toBe(false);
    }
  });
});
