import { describe, expect, it } from "vitest";
import { mendelCross, normaliseGenotype } from "./mendel-cross";

// FL-26 golden cases MX-01…MX-08 for mendel-cross@1.0.0 (monohybrid, complete dominance).
const cross = (p1: string, p2: string) => mendelCross({ setup: "monohybrid", parents: [p1, p2] });

describe("mendel-cross@1.0.0 (FL-26 golden cases)", () => {
  it("MX-01: Aa × Aa gives 1 AA : 2 Aa : 1 aa and 3 dominant : 1 recessive", () => {
    const result = cross("Aa", "Aa");
    expect(result.punnett).toEqual([["AA", "Aa"], ["Aa", "aa"]]);
    expect(result.genotypeCounts).toEqual({ AA: 1, Aa: 2, aa: 1 });
    expect(result.genotypeRatio).toEqual([1, 2, 1]);
    expect(result.phenotypeCounts).toEqual({ dominant: 3, recessive: 1 });
    expect(result.phenotypeRatio).toEqual([3, 1]);
    expect(result.total).toBe(4);
  });

  it("MX-02: AA × aa gives 100% Aa, phenotype all dominant", () => {
    const result = cross("AA", "aa");
    expect(result.genotypeCounts).toEqual({ Aa: 4 });
    expect(result.phenotypeCounts).toEqual({ dominant: 4, recessive: 0 });
    expect(result.phenotypeRatio).toEqual([1]);
  });

  it("MX-03: Aa × aa gives 1 Aa : 1 aa and 1 dominant : 1 recessive", () => {
    const result = cross("Aa", "aa");
    expect(result.genotypeCounts).toEqual({ Aa: 2, aa: 2 });
    expect(result.genotypeRatio).toEqual([1, 1]);
    expect(result.phenotypeRatio).toEqual([1, 1]);
  });

  it("MX-04: AA × AA gives only AA", () => {
    expect(cross("AA", "AA").genotypeCounts).toEqual({ AA: 4 });
  });

  it("MX-05: aa × aa gives only aa, phenotype all recessive", () => {
    const result = cross("aa", "aa");
    expect(result.genotypeCounts).toEqual({ aa: 4 });
    expect(result.phenotypeCounts).toEqual({ dominant: 0, recessive: 4 });
  });

  it("MX-06: aA is read as Aa (dominant allele first)", () => {
    expect(normaliseGenotype("aA")).toBe("Aa");
    expect(cross("aA", "Aa").parents).toEqual(["Aa", "Aa"]);
  });

  it("MX-07: alleles of different letters are rejected", () => {
    expect(() => cross("Ab", "Aa")).toThrow();
  });

  it("MX-08: a genotype must have exactly two alleles", () => {
    expect(() => cross("AAa", "Aa")).toThrow();
    expect(() => cross("A", "Aa")).toThrow();
  });
});
