import { describe, expect, it } from "vitest";
import type { Bench, ChemistryLabConfig, Operation } from "./contracts";
import { applyOperation, createBench, engineContextFor, observeVessel } from "./engine";
import { validateChemistryLabConfig } from "./validate-config";

/** FL-14b shape: seven 0,1 M solutions in four test tubes, no solids. Draft data. */
const config: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "salt-reactions", catalogId: "FL-14b", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.0.0", reactionCatalog: "k2-reactions@1",
  title: "Phản ứng của muối",
  outcomeSummary: ["Quan sát muối phản ứng với acid, base và muối khác."],
  safetyBriefing: { simulation: ["Màu và kết tủa là hình minh họa."], realLab: ["Đeo kính và găng tay."], acknowledgeRequired: true },
  limitations: ["Dữ liệu chưa duyệt."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "rack", kind: "test_tube_rack_6", slot: "rack_base" },
    ...([1, 2, 3, 4] as const).map((n) => ({ id: `T${n}`, kind: "test_tube" as const, slot: `rack_${n}` })),
    { id: "waste", kind: "waste_beaker", slot: "waste_slot" },
    { id: "dropper", kind: "dropper_pipette", slot: "tool_1" },
  ],
  availableReagents: ["Na2CO3_0_1M", "HCl_0_1M", "AgNO3_0_1M", "NaCl_0_1M", "FeCl3_0_1M", "NaOH_0_1M", "CuSO4_0_1M"].map((reagentId, index) => ({ reagentId, shelfPosition: index + 1 })),
  allowedReactions: ["gas.na2co3-hcl", "precip.agno3-nacl", "precip.fecl3-naoh", "precip.cuso4-naoh"],
  measurements: [],
  dispensing: { liquidPresetsMicroliters: [500, 1000] },
  pedagogy: { revealEquations: "after_observation" },
  review: { status: "draft" },
};
const context = engineContextFor(config);

/** Adds the parts in order to one tube; `last` is the result of the final addition. */
const outcome = (tube: string, parts: Array<[string, number]>) => {
  let bench: Bench = createBench(config);
  let last: ReturnType<typeof applyOperation> = { status: "applied", bench, transitions: [] };
  for (const [reagentId, microliters] of parts) {
    const op: Operation = { type: "add_liquid", vesselId: tube, reagentId, microliters };
    last = applyOperation(bench, op, context);
    if (last.status === "applied") bench = last.bench;
  }
  return { last, bench };
};

describe("FL-14b config", () => {
  it("is valid on engine 1.0.0 with no warnings", () => {
    const result = validateChemistryLabConfig(config);
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
    if (result.ok) expect(result.warnings).toEqual([]);
  });
  it("is refused when the shelf is full, a reaction is unknown, a reagent is missing or the data is not reviewed", () => {
    const errors = (patch: Partial<ChemistryLabConfig>) => { const r = validateChemistryLabConfig({ ...config, ...patch }); return r.ok ? [] : r.errors; };
    expect(errors({ availableReagents: [...config.availableReagents, { reagentId: "CaCO3_chips", shelfPosition: 8 }, { reagentId: "Zn_granule", shelfPosition: 9 }] }).length).toBeGreaterThan(0);
    expect(errors({ allowedReactions: ["precip.agno3-kcl"] }).join("\n")).toContain("unknown precip.agno3-kcl");
    expect(errors({ availableReagents: [{ reagentId: "Mg_ribbon", shelfPosition: 1 }] }).join("\n")).toContain("unknown reagent Mg_ribbon");
    expect(errors({ review: { status: "reviewed" } }).join("\n")).toContain("unreviewed inputs");
  });
});

describe("FL-14b golden reactions (draft data)", () => {
  it("Na₂CO₃ + HCl: CO₂ bubbles escape from the open tube, NaCl stays dissolved", () => {
    const { last, bench } = outcome("T1", [["Na2CO3_0_1M", 1000], ["HCl_0_1M", 1000]]);
    if (last.status !== "applied") throw new Error(last.status);
    expect(last.transitions[0].fired).toEqual([{ reactionId: "gas.na2co3-hcl", extentNanomoles: 50_000 }]);
    expect(last.transitions[0].gasProducedNanomoles).toEqual({ CO2: 50_000 });
    expect(last.transitions[0].gasEscapedMicrograms).toBe(2200);
    expect(bench.vessels.T1.dissolved).toMatchObject({ Na2CO3: 50_000, HCl: 0, NaCl: 100_000 });
    expect(observeVessel(bench.vessels.T1, last.transitions[0]).visual.gasBubbles).toEqual({ intensity: "medium", gasId: "CO2" });
  });
  it("1 mL carbonate meets 2 mL acid exactly: nothing is left over", () => {
    const { bench } = outcome("T1", [["Na2CO3_0_1M", 1000], ["HCl_0_1M", 2000]]);
    expect(bench.vessels.T1.dissolved).toMatchObject({ Na2CO3: 0, HCl: 0, NaCl: 200_000 });
  });
  it("AgNO₃ + NaCl: white AgCl precipitate", () => {
    const { last, bench } = outcome("T1", [["AgNO3_0_1M", 1000], ["NaCl_0_1M", 1000]]);
    if (last.status !== "applied") throw new Error(last.status);
    expect(last.transitions[0].fired).toEqual([{ reactionId: "precip.agno3-nacl", extentNanomoles: 100_000 }]);
    expect(bench.vessels.T1.precipitates).toEqual({ AgCl: 100_000 });
    expect(observeVessel(bench.vessels.T1).visual.precipitate).toMatchObject({ species: "AgCl", color: "#f5f5f0" });
  });
  it("FeCl₃ + NaOH: brown-red Fe(OH)₃, 1 : 3 stoichiometry (NaOH limits)", () => {
    const { bench } = outcome("T1", [["FeCl3_0_1M", 1000], ["NaOH_0_1M", 1000]]);
    expect(bench.vessels.T1.precipitates).toEqual({ FeOH3: 33_333 });
    expect(observeVessel(bench.vessels.T1).visual.precipitate).toMatchObject({ species: "FeOH3", color: "#9a3412" });
  });
  it("CuSO₄ + NaOH: blue Cu(OH)₂, 1 : 2 stoichiometry", () => {
    const { bench } = outcome("T1", [["CuSO4_0_1M", 1000], ["NaOH_0_1M", 1000]]);
    expect(bench.vessels.T1.precipitates).toEqual({ CuOH2: 50_000 });
    expect(observeVessel(bench.vessels.T1).visual.precipitate).toMatchObject({ species: "CuOH2", color: "#4f9fd6" });
  });
});

describe("FL-14b scope", () => {
  const verdict = (a: string, b: string) => {
    const { last } = outcome("T1", [[a, 1000], [b, 1000]]);
    return last.status === "out_of_scope" ? last.outOfScope.code : last.status === "applied" ? (last.transitions[0].fired.length ? "reaction" : "inert") : last.status;
  };
  it("pairs with no observable reaction say so, they are not errors", () => {
    expect(verdict("NaCl_0_1M", "CuSO4_0_1M")).toBe("inert");
    expect(verdict("NaCl_0_1M", "Na2CO3_0_1M")).toBe("inert");
    expect(verdict("FeCl3_0_1M", "CuSO4_0_1M")).toBe("inert");
    expect(verdict("HCl_0_1M", "FeCl3_0_1M")).toBe("inert");
  });
  it("pairs that may react but are not reviewed are reported out of scope, never guessed", () => {
    for (const [a, b] of [["Na2CO3_0_1M", "AgNO3_0_1M"], ["Na2CO3_0_1M", "FeCl3_0_1M"], ["Na2CO3_0_1M", "CuSO4_0_1M"], ["AgNO3_0_1M", "HCl_0_1M"],
      ["AgNO3_0_1M", "FeCl3_0_1M"], ["AgNO3_0_1M", "NaOH_0_1M"], ["AgNO3_0_1M", "CuSO4_0_1M"]]) {
      expect(verdict(a, b), `${a} + ${b}`).toBe("PAIR_UNREVIEWED");
    }
  });
  it("acid with base needs the acid–base reaction, which this Lab does not allow", () => {
    expect(verdict("HCl_0_1M", "NaOH_0_1M")).toBe("PAIR_NOT_IN_LAB_SCOPE");
  });
  it("a spectator salt added to a precipitate is fine, an unreviewed one is reported", () => {
    const ok = outcome("T2", [["AgNO3_0_1M", 1000], ["NaCl_0_1M", 2000]]);
    expect(ok.last.status).toBe("applied");
    expect(ok.bench.vessels.T2.precipitates).toEqual({ AgCl: 100_000 });
    // Silver nitrate is used up here, so the carbonate meets only spectators: applied. With silver nitrate left over it is unreviewed.
    expect(outcome("T1", [["AgNO3_0_1M", 1000], ["NaCl_0_1M", 2000], ["Na2CO3_0_1M", 100]]).last.status).toBe("applied");
    expect(outcome("T1", [["AgNO3_0_1M", 2000], ["NaCl_0_1M", 1000], ["Na2CO3_0_1M", 100]]).last.status).toBe("out_of_scope");
  });
});
