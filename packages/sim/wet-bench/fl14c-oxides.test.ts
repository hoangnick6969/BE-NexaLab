import { describe, expect, it } from "vitest";
import type { Bench, ChemistryLabConfig, Operation } from "./contracts";
import { applyOperation, createBench, engineContextFor, observeVessel } from "./engine";
import { validateChemistryLabConfig } from "./validate-config";

/** FL-14c shape: oxide powders by the spoonful, dilute acids and NaOH in test tubes. Draft data. Engine 1.1.0 for the spatula. */
const config: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "oxide-reactions", catalogId: "FL-14c", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.1.0", reactionCatalog: "k2-reactions@1",
  title: "Oxide và acid",
  outcomeSummary: ["Phân loại oxide qua phản ứng với acid và base."],
  safetyBriefing: { simulation: ["Màu là hình minh họa."], realLab: ["Đeo kính và găng tay."], acknowledgeRequired: true },
  limitations: ["Dữ liệu chưa duyệt."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "rack", kind: "test_tube_rack_6", slot: "rack_base" },
    ...([1, 2, 3, 4] as const).map((n) => ({ id: `T${n}`, kind: "test_tube" as const, slot: `rack_${n}` })),
    { id: "waste", kind: "waste_beaker", slot: "waste_slot" },
    { id: "dropper", kind: "dropper_pipette", slot: "tool_1" },
    { id: "spoon", kind: "spatula", slot: "tool_2" },
  ],
  availableReagents: ["CuO_powder", "MgO_powder", "Fe2O3_powder", "HCl_0_1M", "H2SO4_0_1M", "NaOH_0_1M"].map((reagentId, index) => ({ reagentId, shelfPosition: index + 1 })),
  allowedReactions: ["oxide-acid.cuo-h2so4", "oxide-acid.mgo-hcl", "oxide-acid.fe2o3-hcl"],
  measurements: [],
  dispensing: { liquidPresetsMicroliters: [500, 1000] },
  pedagogy: { revealEquations: "after_observation" },
  review: { status: "draft" },
};
const context = engineContextFor(config);
const run = (ops: Operation[]) => {
  let bench: Bench = createBench(config);
  let last: ReturnType<typeof applyOperation> = { status: "applied", bench, transitions: [] };
  for (const op of ops) {
    last = applyOperation(bench, op, context);
    if (last.status === "applied") bench = last.bench;
  }
  return { last, bench };
};
const liquid = (reagentId: string, microliters: number): Operation => ({ type: "add_liquid", vesselId: "T1", reagentId, microliters });
const oxide = (reagentId: string): Operation => ({ type: "add_solid", vesselId: "T1", reagentId, pieces: 1 });

describe("FL-14c config", () => {
  it("is valid on engine 1.1.0 and refused on 1.0.0 (the spatula)", () => {
    const ok = validateChemistryLabConfig(config);
    expect(ok.ok, ok.ok ? "" : ok.errors.join("; ")).toBe(true);
    if (ok.ok) expect(ok.warnings).toEqual([]);
    expect(validateChemistryLabConfig({ ...config, engine: "wet-bench@1.0.0" }).ok).toBe(false);
  });
  it("is refused when a reaction names a species that is not on the bench or is unknown", () => {
    const bad = validateChemistryLabConfig({ ...config, allowedReactions: ["oxide-acid.zno-hcl"] });
    expect(bad.ok).toBe(false);
    const noOxide = validateChemistryLabConfig({ ...config, availableReagents: config.availableReagents.filter((item) => item.reagentId !== "CuO_powder") });
    expect(noOxide.ok && noOxide.warnings.join("\n")).toContain("cannot happen (no CuO");
  });
});

describe("FL-14c golden reactions (draft data)", () => {
  it("CuO + H₂SO₄: the black powder is used up and the solution turns blue", () => {
    const { last, bench } = run([liquid("H2SO4_0_1M", 2000), oxide("CuO_powder")]);
    if (last.status !== "applied") throw new Error(last.status);
    expect(last.transitions[0].fired).toEqual([{ reactionId: "oxide-acid.cuo-h2so4", extentNanomoles: 125_000 }]);
    expect(bench.vessels.T1.dissolved).toMatchObject({ CuSO4: 125_000, H2SO4: 75_000 });
    expect(bench.vessels.T1.solids[0].nanomoles).toBe(0);
    const view = observeVessel(bench.vessels.T1, last.transitions[0]).visual;
    expect(view.liquidTint?.color).toBe("#0284c7");
    expect(view.gasBubbles.intensity).toBe("none");
  });
  it("MgO + HCl: 1 : 2, the acid limits, white powder is left and nothing bubbles", () => {
    const { last, bench } = run([liquid("HCl_0_1M", 1000), oxide("MgO_powder")]);
    if (last.status !== "applied") throw new Error(last.status);
    expect(last.transitions[0].fired).toEqual([{ reactionId: "oxide-acid.mgo-hcl", extentNanomoles: 50_000 }]);
    expect(bench.vessels.T1.solids[0].nanomoles).toBe(200_000);
    expect(bench.vessels.T1.dissolved).toMatchObject({ MgCl2: 50_000, HCl: 0 });
    expect(observeVessel(bench.vessels.T1, last.transitions[0]).visual.gasBubbles.intensity).toBe("none");
  });
  it("Fe₂O₃ + HCl: 1 : 6, the solution turns yellow-brown", () => {
    const { last, bench } = run([liquid("HCl_0_1M", 4000), oxide("Fe2O3_powder")]);
    if (last.status !== "applied") throw new Error(last.status);
    expect(last.transitions[0].fired).toEqual([{ reactionId: "oxide-acid.fe2o3-hcl", extentNanomoles: 62_500 }]);
    expect(bench.vessels.T1.dissolved).toMatchObject({ FeCl3: 125_000, HCl: 25_000 });
    expect(observeVessel(bench.vessels.T1, last.transitions[0]).visual.liquidTint?.color).toBe("#d4a017");
  });
});

describe("FL-14c scope", () => {
  const verdict = (ops: Operation[]) => {
    const { last } = run(ops);
    return last.status === "out_of_scope" ? last.outOfScope.code : last.status === "applied" ? (last.transitions[0].fired.length ? "reaction" : "inert") : last.status;
  };
  it("oxides next to NaOH give no reaction, which classifies them as basic oxides", () => {
    for (const reagentId of ["CuO_powder", "MgO_powder", "Fe2O3_powder"]) expect(verdict([liquid("NaOH_0_1M", 1000), oxide(reagentId)]), reagentId).toBe("inert");
  });
  it("oxide–acid pairs that are not one of the three reactions stay unreviewed", () => {
    expect(verdict([liquid("HCl_0_1M", 1000), oxide("CuO_powder")])).toBe("PAIR_UNREVIEWED");
    expect(verdict([liquid("H2SO4_0_1M", 1000), oxide("MgO_powder")])).toBe("PAIR_UNREVIEWED");
    expect(verdict([liquid("H2SO4_0_1M", 1000), oxide("Fe2O3_powder")])).toBe("PAIR_UNREVIEWED");
  });
  it("the salt made from an oxide, then NaOH, is a FL-14b reaction and out of this Lab's scope", () => {
    expect(verdict([liquid("H2SO4_0_1M", 2000), oxide("CuO_powder"), liquid("NaOH_0_1M", 1000)])).toBe("PAIR_NOT_IN_LAB_SCOPE");
  });
});
