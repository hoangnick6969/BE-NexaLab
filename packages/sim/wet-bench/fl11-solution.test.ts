import { describe, expect, it } from "vitest";
import type { Bench, ChemistryLabConfig, Operation, SolutionTarget } from "./contracts";
import { applyOperation, assessSolution, createBench, engineContextFor, isDissolved, readVolume, scaleReadingMicrograms } from "./engine";
import { validateChemistryLabConfig } from "./validate-config";

/** FL-11 shape: two goals (molarity with the flask, mass percent with beaker and cylinder), solubility at 20 °C. Draft data. */
const config: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "solution-concentration", catalogId: "FL-11", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.1.0", reactionCatalog: "k2-reactions@1",
  title: "Dung dịch và nồng độ",
  outcomeSummary: ["Pha dung dịch theo nồng độ cho trước."],
  safetyBriefing: { simulation: ["Số liệu mô phỏng lý tưởng."], realLab: ["Đeo kính và găng tay."], acknowledgeRequired: true },
  limitations: ["Thể tích chất rắn được bỏ qua."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "B1", kind: "beaker_100ml", slot: "bench_1", labelVi: "Cốc 100 mL" },
    { id: "G1", kind: "graduated_cylinder_100ml", slot: "bench_2", labelVi: "Ống đong 100 mL" },
    { id: "V1", kind: "volumetric_flask_100ml", slot: "bench_3", labelVi: "Bình định mức 100 mL" },
    { id: "waste", kind: "waste_beaker", slot: "waste_slot", labelVi: "Cốc thải" },
    { id: "rod", kind: "glass_rod", slot: "tool_1", labelVi: "Đũa thủy tinh" },
    { id: "spoon", kind: "spatula", slot: "tool_2", labelVi: "Thìa" },
    { id: "scale", kind: "electronic_scale", slot: "scale_1", labelVi: "Cân điện tử" },
  ],
  availableReagents: [
    { reagentId: "NaCl_powder", shelfPosition: 1 }, { reagentId: "CuSO4_powder", shelfPosition: 2 }, { reagentId: "H2O_pour", shelfPosition: 3 },
  ],
  allowedReactions: [],
  measurements: ["scale", "volume"],
  dispensing: { liquidPresetsMicroliters: [500, 1000, 5000, 10_000, 25_000] },
  pedagogy: { revealEquations: "never" },
  solutes: [
    { reagentId: "NaCl_powder", maxMilligramsPerMilliliter: 360, atCelsius: 20 },
    { reagentId: "CuSO4_powder", maxMilligramsPerMilliliter: 200, atCelsius: 20 },
  ],
  targets: [
    { kind: "molarity", id: "nacl-0-1m", titleVi: "100 mL NaCl 0,10 M", reagentId: "NaCl_powder", volumeMicroliters: 100_000, millimolar: 100, toleranceMillimolar: 5 },
    { kind: "mass_percent", id: "cuso4-5pct", titleVi: "50 g CuSO₄ 5%", reagentId: "CuSO4_powder", solutionMilligrams: 50_000, tenthsPercent: 50, toleranceTenthsPercent: 2 },
  ],
  review: { status: "draft" },
};
const context = engineContextFor(config);
const [molarity, percent] = config.targets as [SolutionTarget, SolutionTarget];

const run = (ops: Operation[], start?: Bench) => ops.reduce((current, op) => {
  const result = applyOperation(current, op, context);
  if (result.status !== "applied") throw new Error(`${op.type}: ${result.status}${"code" in result ? " " + result.code : ""}`);
  return result.bench;
}, start ?? createBench(config));
const addPowder = (vesselId: string, reagentId: string, milligrams: number): Operation => ({ type: "add_solid_mass", vesselId, reagentId, milligrams });
const water = (vesselId: string, microliters: number): Operation => ({ type: "add_liquid", vesselId, reagentId: "H2O_pour", microliters });
const flask = (bench: Bench) => bench.vessels.V1;
const beaker = (bench: Bench) => bench.vessels.B1;

describe("FL-11 config", () => {
  it("is valid on engine 1.1.0", () => {
    const result = validateChemistryLabConfig(config);
    expect(result.ok).toBe(true);
  });

  it("is refused on engine 1.0.0, which has none of these parts", () => {
    const result = validateChemistryLabConfig({ ...config, engine: "wet-bench@1.0.0" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("wet-bench@1.1.0");
  });

  it("needs a solubility constant, a spatula and a powder target", () => {
    const noSolute = validateChemistryLabConfig({ ...config, solutes: [config.solutes![0]] });
    expect(noSolute.ok).toBe(false);
    if (!noSolute.ok) expect(noSolute.errors).toContain("solutes: powder CuSO4_powder needs a solubility constant");
    const noSpatula = validateChemistryLabConfig({ ...config, enabledApparatus: config.enabledApparatus.filter((item) => item.kind !== "spatula") });
    expect(noSpatula.ok).toBe(false);
    const badTarget = validateChemistryLabConfig({ ...config, targets: [{ ...(molarity as object), reagentId: "H2O_pour" } as SolutionTarget] });
    expect(badTarget.ok).toBe(false);
  });

  it("needs a graduated cylinder to read volume", () => {
    const result = validateChemistryLabConfig({ ...config, enabledApparatus: config.enabledApparatus.filter((item) => item.kind !== "graduated_cylinder_100ml") });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors.join("\n")).toContain("volume needs graduated_cylinder_100ml");
  });

  it("does not allow powder as initial contents", () => {
    const apparatus = config.enabledApparatus.map((item) => (item.id === "B1" ? { ...item, initial: { contents: [{ reagentId: "NaCl_powder", microliters: 1 }] } } : item));
    expect(validateChemistryLabConfig({ ...config, enabledApparatus: apparatus }).ok).toBe(false);
  });
});

describe("FL-11 molarity: 100 mL of NaCl 0,10 M", () => {
  const prepare = (milligrams: number) => run([
    addPowder("B1", "NaCl_powder", milligrams), water("B1", 60_000), { type: "stir", vesselId: "B1" },
    { type: "pour_all", fromVesselId: "B1", toVesselId: "V1" }, { type: "fill_to_mark", vesselId: "V1", reagentId: "H2O_pour" },
  ]);

  it("585 mg gives exactly 0,100 M and a mass fraction of 0,6 %", () => {
    const result = assessSolution(flask(prepare(585)), molarity);
    expect(result).toMatchObject({ ok: true, millimolar: 100, tenthsPercent: 6, solutionMicroliters: 100_000, withinTarget: true });
  });

  it("the tolerance edges are ±5 %: 556 mg passes, 555 mg does not (0,0949 M)", () => {
    expect(assessSolution(flask(prepare(556)), molarity)).toMatchObject({ ok: true, withinTarget: true });
    expect(assessSolution(flask(prepare(555)), molarity)).toMatchObject({ ok: true, withinTarget: false });
    expect(assessSolution(flask(prepare(614)), molarity)).toMatchObject({ ok: true, withinTarget: true });
    expect(assessSolution(flask(prepare(615)), molarity)).toMatchObject({ ok: true, withinTarget: false });
  });

  it("fill_to_mark adds the missing water so the solution is 100 mL and 100 g of water", () => {
    const bench = prepare(585);
    expect(flask(bench).solutionMicroliters).toBe(100_000);
    // Scale: tare of the flask + 100 g of water + 585 mg of salt.
    expect(scaleReadingMicrograms([flask(bench)])).toBe(75_000_000 + 100_000_000 + 585_000);
  });

  it("fill_to_mark is only for the volumetric flask and only with water", () => {
    const start = run([water("B1", 10_000)]);
    expect(applyOperation(start, { type: "fill_to_mark", vesselId: "B1", reagentId: "H2O_pour" }, context)).toMatchObject({ status: "rejected", code: "NO_MARK" });
    expect(applyOperation(start, { type: "fill_to_mark", vesselId: "V1", reagentId: "NaCl_powder" }, context)).toMatchObject({ status: "rejected", code: "WRONG_REAGENT_FORM" });
    const full = run([{ type: "fill_to_mark", vesselId: "V1", reagentId: "H2O_pour" }], start);
    expect(applyOperation(full, { type: "fill_to_mark", vesselId: "V1", reagentId: "H2O_pour" }, context)).toMatchObject({ status: "rejected", code: "VESSEL_FULL" });
  });
});

describe("FL-11 mass percent: 50 g of CuSO₄ 5 %", () => {
  const prepare = (milligrams: number, millilitres: number) => run([
    addPowder("B1", "CuSO4_powder", milligrams), water("G1", millilitres * 1000), { type: "pour_all", fromVesselId: "G1", toVesselId: "B1" }, { type: "stir", vesselId: "B1" },
  ]);

  it("2 500 mg in 47,5 mL of water is exactly 5,0 % (50 g of solution)", () => {
    const result = assessSolution(beaker(prepare(2500, 47.5)), percent);
    expect(result).toMatchObject({ ok: true, tenthsPercent: 50, solutionMicrograms: 50_000_000, withinTarget: true });
  });

  it("reading the cylinder to 48 mL still passes (4,95 %), 60 mL does not (4,0 %)", () => {
    expect(assessSolution(beaker(prepare(2500, 48)), percent)).toMatchObject({ ok: true, withinTarget: true });
    expect(assessSolution(beaker(prepare(2500, 60)), percent)).toMatchObject({ ok: true, tenthsPercent: 40, withinTarget: false });
  });

  it("also reports the molarity of the same beaker", () => {
    const result = assessSolution(beaker(prepare(2500, 47.5)), percent);
    // 2,5 g / 160,0 g/mol = 15,625 mmol in 47,5 mL = 0,329 M
    expect(result).toMatchObject({ ok: true, millimolar: 329 });
  });

  it("the cylinder is read to the nearest millilitre", () => {
    expect(readVolume(run([water("G1", 47_500)]).vessels.G1)).toEqual({ ok: true, milliliters: 48 });
    expect(readVolume(run([water("G1", 47_400)]).vessels.G1)).toEqual({ ok: true, milliliters: 47 });
    expect(readVolume(createBench(config).vessels.G1)).toEqual({ ok: false, code: "NO_SOLUTION" });
  });
});

describe("FL-11 dissolving", () => {
  it("powder stays undissolved until stirred, and moving or concluding is refused", () => {
    const bench = run([addPowder("B1", "NaCl_powder", 585), water("B1", 60_000)]);
    expect(beaker(bench).powders.NaCl).toBe(585_000);
    expect(isDissolved(beaker(bench))).toBe(false);
    expect(assessSolution(beaker(bench), molarity)).toEqual({ ok: false, code: "NOT_DISSOLVED" });
    expect(applyOperation(bench, { type: "pour_all", fromVesselId: "B1", toVesselId: "V1" }, context)).toMatchObject({ status: "rejected", code: "NOT_DISSOLVED" });
  });

  it("stirring dissolves up to the constant and leaves the rest as powder", () => {
    // 50 mL holds 18 g of NaCl at 360 mg/mL; 20 g leaves 2 g.
    const bench = run([addPowder("B1", "NaCl_powder", 20_000), water("B1", 50_000), { type: "stir", vesselId: "B1" }]);
    expect(beaker(bench).powders.NaCl).toBe(2_000_000);
    expect(assessSolution(beaker(bench), molarity)).toEqual({ ok: false, code: "NOT_DISSOLVED" });
    const more = run([water("B1", 10_000), { type: "stir", vesselId: "B1" }], bench);
    expect(beaker(more).powders.NaCl).toBeUndefined();
    expect(isDissolved(beaker(more))).toBe(true);
  });

  it("with no liquid nothing dissolves, and empty_vessel clears the powder", () => {
    const dry = run([addPowder("B1", "NaCl_powder", 585), { type: "stir", vesselId: "B1" }]);
    expect(beaker(dry).powders.NaCl).toBe(585_000);
    const emptied = run([{ type: "empty_vessel", vesselId: "B1" }], dry);
    expect(beaker(emptied).powders).toEqual({});
    expect(beaker(emptied).contentMicrograms).toBe(0);
  });

  it("the powder weighs on the scale as soon as it is added", () => {
    const bench = run([addPowder("B1", "NaCl_powder", 585)]);
    expect(scaleReadingMicrograms([beaker(bench)])).toBe(50_000_000 + 585_000);
    expect(beaker(bench).added.NaCl_powder).toMatchObject({ micrograms: 585_000 });
  });

  it("a powder needs the powder form: liquids and pieces are refused", () => {
    const bench = createBench(config);
    expect(applyOperation(bench, { type: "add_liquid", vesselId: "B1", reagentId: "NaCl_powder", microliters: 1000 }, context)).toMatchObject({ status: "rejected", code: "WRONG_REAGENT_FORM" });
    expect(applyOperation(bench, { type: "add_solid_mass", vesselId: "B1", reagentId: "H2O_pour", milligrams: 100 }, context)).toMatchObject({ status: "rejected", code: "WRONG_REAGENT_FORM" });
    expect(applyOperation(bench, { type: "add_solid_mass", vesselId: "B1", reagentId: "HCl_0_1M", milligrams: 100 }, context)).toMatchObject({ status: "rejected", code: "REAGENT_NOT_AVAILABLE" });
  });

  it("never mutates the input bench", () => {
    const start = createBench(config);
    const snapshot = JSON.stringify(start);
    applyOperation(start, addPowder("B1", "NaCl_powder", 100), context);
    applyOperation(start, { type: "stir", vesselId: "B1" }, context);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
});
