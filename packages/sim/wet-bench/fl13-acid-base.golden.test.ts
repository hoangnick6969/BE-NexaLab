/**
 * FL-13 golden cases: indicator colours and pH at acid, neutral and base reference points,
 * plus the neutralization challenge. Reviewers check these numbers against `fl13-acid-base.data.ts`.
 */
import { describe, expect, it } from "vitest";
import { applyOperation, litmusColour, measure, observeVessel, phenolphthaleinBand, type EngineContext } from "./engine";
import { emptyVessel } from "./engine";
import type { Bench, Operation } from "./contracts";
import { solveAcidBase } from "./acid-base";

const FL13: EngineContext = {
  allowedReactions: ["acid-base.neutralization"],
  availableReagents: ["HCl_0_1M", "H2SO4_0_05M", "CH3COOH_0_1M", "H2O_distilled", "NaOH_0_1M", "CaOH2_0_01M", "phenolphthalein_indicator"],
};
const bench = (): Bench => ({ vessels: { T1: emptyVessel("T1", "test_tube"), B1: emptyVessel("B1", "beaker_100ml") }, nextPiece: 1 });
const run = (ops: Operation[], start = bench()) => ops.reduce((current, op) => {
  const result = applyOperation(current, op, FL13);
  if (result.status !== "applied") throw new Error(`${op.type} ${result.status} ${"code" in result ? result.code : ""}`);
  return result.bench;
}, start);
const liquid = (reagentId: string, microliters: number, vesselId = "T1"): Operation => ({ type: "add_liquid", vesselId, reagentId, microliters });
const drops = (count: number, vesselId = "T1"): Operation => ({ type: "add_indicator", vesselId, reagentId: "phenolphthalein_indicator", drops: count });
const ph = (b: Bench, vesselId = "T1") => {
  const reading = measure(b.vessels[vesselId], "ph_meter");
  if (!reading.ok || reading.kind !== "ph_meter") throw new Error("no pH");
  return reading.tenthsPh / 10;
};
const litmus = (b: Bench, vesselId = "T1") => {
  const reading = measure(b.vessels[vesselId], "litmus_paper");
  if (!reading.ok || reading.kind !== "litmus_paper") throw new Error("no litmus");
  return reading.colour;
};
const phenol = (b: Bench, vesselId = "T1") => observeVessel(b.vessels[vesselId]).visual.indicator?.band;

describe("FL-13 golden: reference solutions (1 mL in a test tube)", () => {
  it.each([
    ["HCl_0_1M", 1.0, "red", "colourless"],
    ["H2SO4_0_05M", 1.0, "red", "colourless"],
    ["CH3COOH_0_1M", 2.9, "red", "colourless"],
    ["H2O_distilled", 7.0, "purple", "colourless"],
    ["CaOH2_0_01M", 12.3, "blue", "deep_pink"],
    ["NaOH_0_1M", 13.0, "blue", "deep_pink"],
  ] as const)("%s → pH %s, litmus %s, phenolphthalein %s", (reagentId, expectedPh, expectedLitmus, expectedPhenol) => {
    const b = run([liquid(reagentId, 1000), drops(1)]);
    // The indicator drop dilutes by 5 %, which does not change the reading at 0.1 pH resolution for these points.
    expect(ph(b)).toBe(expectedPh);
    expect(litmus(b)).toBe(expectedLitmus);
    expect(phenol(b)).toBe(expectedPhenol);
  });

  it("acetic acid follows Ka = 1.8e-5 (pH 2.88 to 0.01)", () => {
    const result = solveAcidBase({ solutionMicroliters: 1000, dissolved: { CH3COOH: 100_000 } });
    expect(result.ok && result.centiPh).toBe(288);
  });

  it("pure water is exactly neutral", () => {
    const result = solveAcidBase({ solutionMicroliters: 1000, dissolved: {} });
    expect(result.ok && result.centiPh).toBe(700);
  });
});

describe("FL-13 golden: mixing and dilution", () => {
  it("two strong acids add their H⁺ over the total volume", () => {
    expect(ph(run([liquid("HCl_0_1M", 1000), liquid("H2SO4_0_05M", 1000)]))).toBe(1.0);
  });
  it("one drop of HCl in 1 mL of water gives pH 2.3", () => {
    expect(ph(run([liquid("H2O_distilled", 1000), liquid("HCl_0_1M", 50)]))).toBe(2.3);
  });
  it("acetic acid neutralized by NaOH is slightly basic (acetate): pH 8.7, light pink, blue litmus", () => {
    const b = run([liquid("CH3COOH_0_1M", 1000), liquid("NaOH_0_1M", 1000), drops(1)]);
    expect(ph(b)).toBe(8.7);
    expect(phenol(b)).toBe("light_pink");
    expect(litmus(b)).toBe("blue");
  });
});

describe("FL-13 golden: neutralization challenge in the beaker", () => {
  const start = () => run([liquid("NaOH_0_1M", 250, "B1"), drops(1, "B1")]);
  const hclDrops = (b: Bench, n: number) => run(Array.from({ length: n }, () => liquid("HCl_0_1M", 50, "B1")), b);

  it("5 drops NaOH + 1 drop phenolphthalein: pH 12.9, deep pink", () => {
    const b = start();
    expect(ph(b, "B1")).toBe(12.9);
    expect(phenol(b, "B1")).toBe("deep_pink");
  });
  it("after 4 drops HCl: still basic, pH 12.0, deep pink", () => {
    const b = hclDrops(start(), 4);
    expect(ph(b, "B1")).toBe(12.0);
    expect(phenol(b, "B1")).toBe("deep_pink");
  });
  it("after 5 drops HCl: neutral, pH 7.0, colourless — the challenge answer is 5 drops", () => {
    const b = hclDrops(start(), 5);
    expect(ph(b, "B1")).toBe(7.0);
    expect(phenol(b, "B1")).toBe("colourless");
  });
  it("after 6 drops HCl: acidic, pH 2.1, colourless; NaOH again turns it pink", () => {
    const b = hclDrops(start(), 6);
    expect(ph(b, "B1")).toBe(2.1);
    expect(phenol(b, "B1")).toBe("colourless");
    const back = run([liquid("NaOH_0_1M", 100, "B1")], b);
    expect(phenol(back, "B1")).toBe("deep_pink");
  });
  it("each HCl drop that meets OH⁻ is reported as neutralization", () => {
    const result = applyOperation(start(), liquid("HCl_0_1M", 50, "B1"), FL13);
    expect(result.status).toBe("applied");
    if (result.status === "applied") expect(result.transitions[0].fired).toEqual([{ reactionId: "acid-base.neutralization", extentNanomoles: 5000 }]);
  });
});

describe("FL-13 golden: indicator band edges", () => {
  it("litmus: red ≤ 5.00 < purple < 8.00 ≤ blue", () => {
    expect([500, 501, 799, 800].map(litmusColour)).toEqual(["red", "purple", "purple", "blue"]);
  });
  it("phenolphthalein: colourless < 8.20 ≤ light pink < 10.00 ≤ deep pink", () => {
    expect([819, 820, 999, 1000].map((value) => phenolphthaleinBand(value).id)).toEqual(["colourless", "light_pink", "light_pink", "deep_pink"]);
  });
});

describe("FL-13 golden: honest limits", () => {
  it("H2SO4 + Ca(OH)2 is outside the reviewed model and keeps the last valid state", () => {
    const before = run([liquid("H2SO4_0_05M", 1000)]);
    const result = applyOperation(before, liquid("CaOH2_0_01M", 1000), FL13);
    expect(result.status).toBe("out_of_scope");
    if (result.status === "out_of_scope") {
      expect(result.outOfScope.code).toBe("PAIR_UNREVIEWED");
      expect(result.outOfScope.reasonVi).toMatch(/CaSO₄/);
      expect(result.bench).toBe(before);
    }
  });
  it("an empty tube or indicator alone gives no reading", () => {
    expect(measure(bench().vessels.T1, "ph_meter")).toEqual({ kind: "ph_meter", ok: false, code: "NO_SOLUTION" });
    expect(measure(run([drops(2)]).vessels.T1, "litmus_paper")).toEqual({ kind: "litmus_paper", ok: false, code: "NO_SOLUTION" });
  });
});
