import { describe, expect, it } from "vitest";
import type { Bench, ChemistryLabConfig, Operation } from "./contracts";
import { applyOperation, createBench, engineContextFor, observeVessel, readGasVolume, scaleReadingMicrograms } from "./engine";
import { validateChemistryLabConfig } from "./validate-config";

/** FL-12 shape: three flasks of acid, limestone as chips or powder, a stopwatch and a thermometer. Draft data. */
const config: ChemistryLabConfig = {
  schema: "k2-lab-config/1", labId: "reaction-rate", catalogId: "FL-12", configVersion: 1,
  kit: "k2-wet-bench@1", engine: "wet-bench@1.2.0", reactionCatalog: "k2-reactions@1",
  title: "Tốc độ phản ứng",
  outcomeSummary: ["So sánh tốc độ phản ứng."],
  safetyBriefing: { simulation: ["Số liệu mô phỏng xu hướng."], realLab: ["Đeo kính và găng tay."], acknowledgeRequired: true },
  limitations: ["Mô hình xu hướng, không phải số đo thực."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "F1", kind: "erlenmeyer_flask_100ml", slot: "bench_1", initial: { contents: [{ reagentId: "HCl_0_1M", microliters: 20_000 }] } },
    { id: "F2", kind: "erlenmeyer_flask_100ml", slot: "bench_2", initial: { contents: [{ reagentId: "HCl_0_2M", microliters: 20_000 }] } },
    { id: "F3", kind: "erlenmeyer_flask_100ml", slot: "bench_3", initial: { contents: [{ reagentId: "HCl_0_1M", microliters: 20_000 }] } },
    { id: "clock", kind: "stopwatch", slot: "tool_1" },
    { id: "temp", kind: "thermometer", slot: "tool_2" },
    { id: "tongs", kind: "tongs", slot: "tool_3" },
    { id: "spoon", kind: "spatula", slot: "tool_4" },
    { id: "stopper", kind: "stopper", slot: "tool_5" },
  ],
  availableReagents: [{ reagentId: "CaCO3_chips", shelfPosition: 1 }, { reagentId: "CaCO3_powder", shelfPosition: 2 }],
  allowedReactions: ["gas.caco3-hcl"],
  measurements: ["time", "gas_volume"],
  dispensing: { liquidPresetsMicroliters: [1000] },
  pedagogy: { revealEquations: "never" },
  review: { status: "draft" },
  rateModel: { kinetic: ["gas.caco3-hcl"], kNanomolesPerSecondPerMillimolar: 33, surface: { chips: 1, powder: 8 }, maxSeconds: 600, atCelsius: 25 },
};
const context = engineContextFor(config);

const apply = (bench: Bench, op: Operation) => {
  const result = applyOperation(bench, op, context);
  if (result.status !== "applied") throw new Error(`${op.type}: ${result.status}${"code" in result ? " " + result.code : ""}`);
  return result.bench;
};
const run = (ops: Operation[], start: Bench = createBench(config)) => ops.reduce(apply, start);
const stopper = (id: string): Operation => ({ type: "toggle_stopper", vesselId: id });
const add = (vesselId: string, reagentId: string): Operation => ({ type: "add_solid", vesselId, reagentId, pieces: 1 });
const wait = (seconds: number): Operation => ({ type: "advance_time", seconds });
const gas = (bench: Bench, id: string) => {
  const reading = readGasVolume(bench.vessels[id]);
  if (!reading.ok) throw new Error("not collecting");
  return reading.tenthsMilliliters;
};
/** Chips in F1 (0,1 M), chips in F2 (0,2 M), powder in F3 (0,1 M), all stoppered. */
const setup = () => run([stopper("F1"), stopper("F2"), stopper("F3"), add("F1", "CaCO3_chips"), add("F2", "CaCO3_chips"), add("F3", "CaCO3_powder")]);

describe("FL-12 config", () => {
  it("is valid on engine 1.2.0", () => {
    const result = validateChemistryLabConfig(config);
    expect(result.ok, result.ok ? "" : result.errors.join("; ")).toBe(true);
  });

  it("is refused on engines that have no rate model, stopwatch or thermometer", () => {
    for (const engine of ["wet-bench@1.0.0", "wet-bench@1.1.0"] as const) {
      const result = validateChemistryLabConfig({ ...config, engine });
      expect(result.ok).toBe(false);
      if (!result.ok) expect(result.errors.join("\n")).toContain("wet-bench@1.2.0");
    }
  });

  it("checks the rate model against the Lab", () => {
    const errors = (patch: Partial<ChemistryLabConfig>) => {
      const result = validateChemistryLabConfig({ ...config, ...patch });
      return result.ok ? [] : result.errors;
    };
    expect(errors({ allowedReactions: [] }).join("\n")).toContain("not in allowedReactions");
    expect(errors({ rateModel: { ...config.rateModel!, kinetic: ["precip.bacl2-na2so4"] } }).join("\n")).toContain("not in allowedReactions");
    expect(errors({ rateModel: { ...config.rateModel!, surface: { chips: 1 } } }).join("\n")).toContain("no factor for the solid shape powder");
    expect(errors({ measurements: ["gas_volume"] }).join("\n")).toContain("time measurement");
    expect(errors({ enabledApparatus: config.enabledApparatus.filter((item) => item.kind !== "stopwatch") }).join("\n")).toContain("time needs stopwatch");
  });
});

describe("FL-12 rate model", () => {
  it("nothing reacts until time passes", () => {
    const bench = setup();
    expect(gas(bench, "F1")).toBe(0);
    expect(bench.vessels.F1.solids[0].nanomoles).toBe(10_000_000);
    expect(observeVessel(bench.vessels.F1).visual.gasBubbles.intensity).toBe("none");
  });

  it("golden: gas collected (tenths of mL) after 10, 30 and 60 s", () => {
    const at = (seconds: number) => {
      const bench = run([wait(seconds)], setup());
      return [gas(bench, "F1"), gas(bench, "F2"), gas(bench, "F3")];
    };
    expect(at(10)).toEqual([8, 16, 57]);
    expect(at(30)).toEqual([23, 46, 133]);
    expect(at(60)).toEqual([44, 87, 192]);
  });

  it("a double concentration roughly doubles the early rate, and a powder is faster than chips", () => {
    const bench = run([wait(20)], setup());
    expect(gas(bench, "F2") / gas(bench, "F1")).toBeGreaterThan(1.8);
    expect(gas(bench, "F2") / gas(bench, "F1")).toBeLessThan(2.2);
    expect(gas(bench, "F3")).toBeGreaterThan(gas(bench, "F1") * 5);
  });

  it("the powder uses up the acid: the total gas is the stoichiometric 24,5 mL (2 mmol HCl → 1 mmol CO₂) and then stops", () => {
    const bench = run([wait(300), wait(300)], setup());
    expect(gas(bench, "F3")).toBe(245);
    expect(bench.vessels.F3.dissolved.HCl ?? 0).toBeLessThan(200);
    expect(gas(bench, "F1")).toBeLessThan(245);
  });

  it("the same operations always give the same curve, and the input bench is never changed", () => {
    const start = setup();
    const snapshot = JSON.stringify(start);
    const a = run([wait(45), wait(90)], start);
    const b = run([wait(45), wait(90)], start);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.stringify(start)).toBe(snapshot);
  });

  it("is capped at maxSeconds: a step past it is refused and changes nothing", () => {
    const bench = run([wait(600)], setup());
    expect(bench.elapsedSeconds).toBe(600);
    expect(applyOperation(bench, wait(1), context)).toMatchObject({ status: "rejected", code: "TIME_LIMIT" });
    expect(applyOperation(createBench({ ...config, rateModel: undefined }), wait(1), engineContextFor({ ...config, rateModel: undefined }))).toMatchObject({ status: "rejected", code: "INVALID_OPERATION" });
  });

  it("an open flask loses the gas (lighter, no volume to read); a stoppered flask keeps the mass", () => {
    const openStart = run([add("F1", "CaCO3_powder")]);
    const open = run([wait(120)], openStart);
    expect(readGasVolume(open.vessels.F1)).toEqual({ ok: false, code: "NOT_COLLECTING" });
    expect(open.vessels.F1.contentMicrograms).toBeLessThan(openStart.vessels.F1.contentMicrograms);
    const closedStart = run([stopper("F1"), add("F1", "CaCO3_powder")]);
    const closed = run([wait(120)], closedStart);
    expect(scaleReadingMicrograms([closed.vessels.F1])).toBe(scaleReadingMicrograms([closedStart.vessels.F1]));
    expect(gas(closed, "F1")).toBeGreaterThan(0);
  });

  it("bubbles follow the rate: vigorous for the powder, slower for the chips, none when nothing is left to react", () => {
    const bench = run([wait(10)], setup());
    const last = (id: string) => ({ vesselId: id, fired: [{ reactionId: "gas.caco3-hcl", extentNanomoles: 1 }], gasProducedNanomoles: { CO2: 1 }, gasEscapedMicrograms: 0, gasNanomolesPerSecond: 0 });
    const rateOf = (id: string) => {
      const result = applyOperation(bench, wait(1), context);
      if (result.status !== "applied") throw new Error("rejected");
      return result.transitions.find((item) => item.vesselId === id)!.gasNanomolesPerSecond!;
    };
    expect(rateOf("F3")).toBeGreaterThan(rateOf("F1") * 5);
    const intensity = (id: string, perSecond: number) => observeVessel(bench.vessels[id], { ...last(id), gasNanomolesPerSecond: perSecond }).visual.gasBubbles.intensity;
    expect([intensity("F1", 100), intensity("F1", 800), intensity("F1", 5000), intensity("F1", 0)]).toEqual(["low", "medium", "vigorous", "none"]);
  });
});

describe("FL-12 stopwatch", () => {
  it("counts simulated time only while it runs, and resets", () => {
    let bench = run([wait(5)], setup());
    expect(bench.clock?.seconds ?? 0).toBe(0);
    bench = run([{ type: "clock", action: "start" }, wait(30)], bench);
    expect(bench.clock).toEqual({ seconds: 30, running: true });
    bench = run([{ type: "clock", action: "stop" }, wait(20)], bench);
    expect(bench.clock).toEqual({ seconds: 30, running: false });
    expect(bench.elapsedSeconds).toBe(55);
    bench = run([{ type: "clock", action: "reset" }], bench);
    expect(bench.clock).toEqual({ seconds: 0, running: false });
  });

  it("other operations keep the clock and the elapsed time", () => {
    const bench = run([{ type: "clock", action: "start" }, wait(10), stopper("F1")], setup());
    expect(bench.clock).toEqual({ seconds: 10, running: true });
    expect(bench.elapsedSeconds).toBe(10);
  });
});

describe("engine 1.1.0 and 1.0.0 behaviour is unchanged", () => {
  it("without a rate model the same pair still reacts at once", () => {
    const plain = { ...config, engine: "wet-bench@1.2.0" as const, rateModel: undefined, measurements: ["gas_volume" as const] };
    const ctx = engineContextFor(plain as ChemistryLabConfig);
    const stoppered = applyOperation(createBench(plain as ChemistryLabConfig), stopper("F1"), ctx);
    if (stoppered.status !== "applied") throw new Error("stopper");
    const added = applyOperation(stoppered.bench, add("F1", "CaCO3_chips"), ctx);
    if (added.status !== "applied") throw new Error("add");
    expect(readGasVolume(added.bench.vessels.F1)).toMatchObject({ ok: true, tenthsMilliliters: 245 });
  });
});
