import { describe, expect, it } from "vitest";
import type { Bench, Operation } from "./contracts";
import { applyOperation, emptyVessel, measure, observeVessel, scaleReadingMicrograms, type EngineContext } from "./engine";

const FL14A: EngineContext = {
  allowedReactions: ["metal-acid.zn-hcl", "metal-acid.fe-hcl", "displace.fe-cuso4", "displace.zn-cuso4"],
  availableReagents: ["HCl_0_1M", "CuSO4_0_1M", "Zn_granule", "Fe_nail", "Cu_foil"],
};
const FL10: EngineContext = {
  allowedReactions: ["precip.bacl2-na2so4", "gas.caco3-hcl"],
  availableReagents: ["HCl_0_1M", "CaCO3_chips", "BaCl2_0_1M", "Na2SO4_0_1M"],
};
const bench = (): Bench => ({
  vessels: { T1: emptyVessel("T1", "test_tube"), C1: emptyVessel("C1", "beaker_100ml"), C2: emptyVessel("C2", "beaker_100ml"), F1: emptyVessel("F1", "erlenmeyer_flask_100ml") },
  nextPiece: 1,
});
const run = (ops: Operation[], context: EngineContext, start = bench()) => ops.reduce((current, op) => {
  const result = applyOperation(current, op, context);
  if (result.status !== "applied") throw new Error(`${op.type}: ${result.status}`);
  return result.bench;
}, start);

describe("wet-bench engine: operations", () => {
  it("never mutates the input bench", () => {
    const start = bench();
    const snapshot = JSON.stringify(start);
    applyOperation(start, { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }, FL14A);
    expect(JSON.stringify(start)).toBe(snapshot);
  });
  it("rejects unknown vessels, off-shelf reagents, wrong forms and overfilling", () => {
    const b = bench();
    expect(applyOperation(b, { type: "add_liquid", vesselId: "X", reagentId: "HCl_0_1M", microliters: 50 }, FL14A)).toEqual({ status: "rejected", code: "UNKNOWN_VESSEL" });
    expect(applyOperation(b, { type: "add_liquid", vesselId: "T1", reagentId: "NaOH_0_1M", microliters: 50 }, FL14A)).toEqual({ status: "rejected", code: "REAGENT_NOT_AVAILABLE" });
    expect(applyOperation(b, { type: "add_liquid", vesselId: "T1", reagentId: "Zn_granule", microliters: 50 }, FL14A)).toEqual({ status: "rejected", code: "WRONG_REAGENT_FORM" });
    const full = run(Array.from({ length: 10 }, () => ({ type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }) as Operation), FL14A);
    expect(applyOperation(full, { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 50 }, FL14A)).toEqual({ status: "rejected", code: "VESSEL_FULL" });
    expect(applyOperation(b, { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 0 } as Operation, FL14A)).toEqual({ status: "rejected", code: "INVALID_OPERATION" });
  });
  it("empties a vessel back to its starting state", () => {
    const b = run([{ type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }, { type: "empty_vessel", vesselId: "T1" }], FL14A);
    expect(b.vessels.T1).toEqual(emptyVessel("T1", "test_tube"));
  });
});

describe("wet-bench engine: FL-14a metals (draft data)", () => {
  it("Zn + HCl: acid is limiting, H₂ escapes and is subtracted from the mass", () => {
    const start = run([{ type: "add_solid", vesselId: "T1", reagentId: "Zn_granule", pieces: 1 }], FL14A);
    const result = applyOperation(start, { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }, FL14A);
    expect(result.status).toBe("applied");
    if (result.status !== "applied") return;
    const [transition] = result.transitions;
    expect(transition.fired).toEqual([{ reactionId: "metal-acid.zn-hcl", extentNanomoles: 50_000 }]);
    expect(transition.gasProducedNanomoles).toEqual({ H2: 50_000 });
    expect(transition.gasEscapedMicrograms).toBe(100);
    const tube = result.bench.vessels.T1;
    expect(tube.dissolved).toMatchObject({ HCl: 0, ZnCl2: 50_000 });
    expect(tube.solids[0].nanomoles).toBe(9_950_000);
    expect(tube.contentMicrograms).toBe(654_000 + 1_000_000 - 100);
    expect(observeVessel(tube, transition).visual.gasBubbles).toEqual({ intensity: "medium", gasId: "H2" });
  });
  it("Cu + HCl is a reviewed no-reaction pair", () => {
    const result = applyOperation(run([{ type: "add_solid", vesselId: "T1", reagentId: "Cu_foil", pieces: 1 }], FL14A), { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }, FL14A);
    expect(result.status === "applied" && result.transitions[0].fired).toEqual([]);
  });
  it("Fe + CuSO₄ coats the nail with copper and fades the blue", () => {
    const blue = run([{ type: "add_liquid", vesselId: "T1", reagentId: "CuSO4_0_1M", microliters: 2000 }], FL14A);
    const before = observeVessel(blue.vessels.T1).visual.liquidTint!;
    const after = run([{ type: "add_solid", vesselId: "T1", reagentId: "Fe_nail", pieces: 1 }], FL14A, blue);
    const view = observeVessel(after.vessels.T1).visual;
    expect(view.solids[0].coatingColor).toBe("#b45309");
    expect(after.vessels.T1.dissolved).toMatchObject({ CuSO4: 0, FeSO4: 200_000 });
    expect(view.liquidTint!.color).not.toBe(before.color);
  });
  it("a pair outside the reviewed catalog (Zn + FeCl₂) is out of scope, never 'no reaction'", () => {
    const withFeCl2 = run([{ type: "add_solid", vesselId: "T1", reagentId: "Fe_nail", pieces: 1 }, { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 1000 }], FL14A);
    const result = applyOperation(withFeCl2, { type: "add_solid", vesselId: "T1", reagentId: "Zn_granule", pieces: 1 }, FL14A);
    expect(result.status).toBe("out_of_scope");
    if (result.status === "out_of_scope") expect(result.outOfScope).toMatchObject({ code: "PAIR_UNREVIEWED", species: ["FeCl2", "Zn"] });
  });
  it("a catalog reaction the Lab does not allow is out of the Lab's scope", () => {
    const context = { ...FL14A, allowedReactions: [] };
    const result = applyOperation(run([{ type: "add_solid", vesselId: "T1", reagentId: "Zn_granule", pieces: 1 }], context), { type: "add_liquid", vesselId: "T1", reagentId: "HCl_0_1M", microliters: 50 }, context);
    expect(result.status === "out_of_scope" && result.outOfScope.code).toBe("PAIR_NOT_IN_LAB_SCOPE");
  });
  it("pH is not reported for solutions the acid–base model does not cover", () => {
    const b = run([{ type: "add_liquid", vesselId: "T1", reagentId: "CuSO4_0_1M", microliters: 1000 }], FL14A);
    expect(measure(b.vessels.T1, "ph_meter")).toEqual({ kind: "ph_meter", ok: false, code: "PH_UNMODELED" });
  });
});

describe("wet-bench engine: FL-10 Explore mass bookkeeping (draft data)", () => {
  it("BaCl₂ poured into Na₂SO₄: white precipitate, total mass on the scale unchanged", () => {
    const filled = run([
      { type: "add_liquid", vesselId: "C1", reagentId: "BaCl2_0_1M", microliters: 10_000 },
      { type: "add_liquid", vesselId: "C2", reagentId: "Na2SO4_0_1M", microliters: 10_000 },
    ], FL10);
    const before = scaleReadingMicrograms([filled.vessels.C1, filled.vessels.C2]);
    const poured = run([{ type: "pour_all", fromVesselId: "C1", toVesselId: "C2" }], FL10, filled);
    expect(scaleReadingMicrograms([poured.vessels.C1, poured.vessels.C2])).toBe(before);
    expect(observeVessel(poured.vessels.C2).visual.precipitate).toMatchObject({ species: "BaSO4", color: "#f4f4ee" });
    expect(poured.vessels.C1.solutionMicroliters).toBe(0);
  });
  it("CaCO₃ + HCl in an open beaker loses the CO₂ mass", () => {
    const acid = run([{ type: "add_liquid", vesselId: "C1", reagentId: "HCl_0_1M", microliters: 10_000 }], FL10);
    const before = scaleReadingMicrograms([acid.vessels.C1]);
    const after = run([{ type: "add_solid", vesselId: "C1", reagentId: "CaCO3_chips", pieces: 1 }], FL10, acid);
    // 1 000 µmol HCl → 500 µmol CO₂ = 22 000 µg leaves the open beaker; the 1 001 000 µg chip was added.
    expect(scaleReadingMicrograms([after.vessels.C1]) - before).toBe(1_001_000 - 22_000);
  });
  it("in a stoppered flask the CO₂ stays on the scale until the stopper is removed", () => {
    const acid = run([{ type: "add_liquid", vesselId: "F1", reagentId: "HCl_0_1M", microliters: 10_000 }, { type: "toggle_stopper", vesselId: "F1" }], FL10);
    const before = scaleReadingMicrograms([acid.vessels.F1]);
    const reacted = run([{ type: "add_solid", vesselId: "F1", reagentId: "CaCO3_chips", pieces: 1 }], FL10, acid);
    expect(scaleReadingMicrograms([reacted.vessels.F1]) - before).toBe(1_001_000);
    const opened = run([{ type: "toggle_stopper", vesselId: "F1" }], FL10, reacted);
    expect(scaleReadingMicrograms([opened.vessels.F1]) - before).toBe(1_001_000 - 22_000);
  });
  it("only flasks take a stopper", () => {
    expect(applyOperation(bench(), { type: "toggle_stopper", vesselId: "C1" }, FL10)).toEqual({ status: "rejected", code: "NOT_STOPPERABLE" });
  });
});
