import { describe, expect, it } from "vitest";
import * as entrypoint from "./index";
import { evaluateMassConservation, evaluateMassConservationWithRegistry, massConservationRegistry, validateConservationFixture } from "./mass-conservation";

const id = "barium-precipitation-reference-v1";
// technical_assumption: the cups and solvent are invented for the arithmetic test, not classroom parameters.
const input = { fixtureId: id, cup1Milligrams: 100000, cup2Milligrams: 100000, solvent1Milligrams: 50000, solvent2Milligrams: 50000 };

describe("mass conservation technical fixture", () => {
  it("M-01/G-01: counts each constituent once", () => {
    const result = evaluateMassConservation(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.value.reactants.map((x) => x.massMilligrams)).toEqual([20800, 14200]);
    expect(result.value.products.map((x) => x.massMilligrams)).toEqual([23300, 11700]);
    expect(result.value).toMatchObject({ reactantsTotalMilligrams: 35000, productsTotalMilligrams: 35000, beforeScaleMilligrams: 335000, afterScaleMilligrams: 335000 });
  });
  it("M-02: validates integer amounts, molar masses and stoichiometry", () => {
    const result = evaluateMassConservation(input);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const entries = [...result.value.reactants, ...result.value.products];
    expect(entries.map((x) => x.amountMillimoles)).toEqual([100, 100, 100, 200]);
    expect(entries.map((x) => x.molarMassTenthsGramsPerMol)).toEqual([2080, 1420, 2330, 585]);
    for (const item of entries) expect(item.massMilligrams * 10).toBe(item.amountMillimoles * item.molarMassTenthsGramsPerMol);
  });
  it("M-03: rejects damaged fixtures, including via injected registry", () => {
    for (const mutate of [
      (f: any) => { f.products[0].massMilligrams = 23400; },
      (f: any) => { f.products[1].amountMillimoles = 100; },
      (f: any) => { f.reactants[0].molarMassTenthsGramsPerMol = 2081; },
      (f: any) => { f.reactants[0].species = "NaCl"; },
    ]) {
      const fixture = structuredClone(massConservationRegistry[id]);
      mutate(fixture);
      expect(validateConservationFixture(fixture)).toEqual({ ok: false, code: "INVALID_FIXTURE" });
      expect(evaluateMassConservationWithRegistry(input, { [id]: fixture })).toEqual({ ok: false, code: "INVALID_FIXTURE" });
    }
  });
  it("M-04: enforces technical bounds and strict input", () => {
    for (const value of [0, 1000001, 2 ** 53]) expect(evaluateMassConservation({ ...input, cup1Milligrams: value })).toEqual({ ok: false, code: "OUT_OF_RANGE" });
    for (const value of [1, 1000000]) expect(evaluateMassConservation({ ...input, cup1Milligrams: value }).ok).toBe(true);
    for (const value of [-1, 1000001, 2 ** 53]) expect(evaluateMassConservation({ ...input, solvent1Milligrams: value })).toEqual({ ok: false, code: "OUT_OF_RANGE" });
    for (const value of [0, 1000000]) expect(evaluateMassConservation({ ...input, solvent1Milligrams: value }).ok).toBe(true);
    for (const value of [1.5, NaN, "1"]) expect(evaluateMassConservation({ ...input, cup1Milligrams: value })).toEqual({ ok: false, code: "INVALID_SCHEMA" });
    expect(evaluateMassConservation({ ...input, extra: true })).toEqual({ ok: false, code: "INVALID_SCHEMA" });
    const result = evaluateMassConservation({ ...input, cup1Milligrams: 10, cup2Milligrams: 20, solvent1Milligrams: 30, solvent2Milligrams: 40 });
    expect(result.ok && result.value.beforeScaleMilligrams).toBe(35100);
  });
  it("M-05: is deterministic and does not expose registry references", () => {
    const a = evaluateMassConservation(input), b = evaluateMassConservation(input);
    expect(a).toEqual(b);
    expect(a.ok).toBe(true);
    if (!a.ok) return;
    expect(a.value).toMatchObject({ modelVersion: "1.0.0", systemBoundary: "two_open_cups_on_scale", assumptions: ["no_splash", "no_evaporation", "no_loss", "no_residue_modeled"] });
    a.value.products[0].massMilligrams = 1;
    expect(evaluateMassConservation(input)).toEqual(b);
  });
  it("M-06: validates schema before bounds and bounds before lookup", () => {
    expect(evaluateMassConservation({ ...input, fixtureId: "unknown", cup1Milligrams: "1" })).toEqual({ ok: false, code: "INVALID_SCHEMA" });
    expect(evaluateMassConservation({ ...input, fixtureId: "unknown", cup1Milligrams: 0 })).toEqual({ ok: false, code: "OUT_OF_RANGE" });
    expect(evaluateMassConservation({ ...input, fixtureId: "unknown" })).toEqual({ ok: false, code: "UNKNOWN_FIXTURE" });
  });
  it("M-07: keeps registry frozen and internals out of the package entrypoint", () => {
    expect(entrypoint.evaluateMassConservation).toBe(evaluateMassConservation);
    expect("validateConservationFixture" in entrypoint).toBe(false);
    expect("massConservationRegistry" in entrypoint).toBe(false);
    expect("evaluateMassConservationWithRegistry" in entrypoint).toBe(false);
    const fixture = massConservationRegistry[id];
    expect([massConservationRegistry, fixture, fixture.reactants, ...fixture.reactants, fixture.products, ...fixture.products, fixture.source].every(Object.isFrozen)).toBe(true);
    try { fixture.products[0].massMilligrams = 1; } catch { /* Frozen objects may throw in strict mode. */ }
    expect(fixture.products[0].massMilligrams).toBe(23300);
  });
});
