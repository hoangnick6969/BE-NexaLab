/**
 * K2 wet-bench species table. Scientific data here is a technical draft
 * (`reviewStatus: "unverified"`) until a chemistry reviewer signs it off.
 * Units: molar mass in tenths of g/mol (585 = 58.5 g/mol), matching mass-conservation.ts.
 */
export type SpeciesId =
  | "H2O" | "HCl" | "H2SO4" | "CH3COOH" | "NaOH" | "CaOH2"
  | "NaCl" | "Na2SO4" | "CuSO4" | "FeSO4" | "ZnSO4" | "ZnCl2" | "FeCl2" | "CaCl2" | "BaCl2"
  | "BaSO4" | "CaCO3" | "Zn" | "Fe" | "Cu" | "H2" | "CO2";

/** How the acid–base solver treats a species. `unmodeled` blocks pH readings honestly. */
export type AcidBaseRole =
  | { kind: "strong_acid"; protons: 1 | 2 }
  | { kind: "weak_acid"; constantId: "acetic" }
  | { kind: "strong_base"; hydroxides: 1 | 2 }
  | { kind: "neutral" }
  | { kind: "unmodeled" };

export type Species = {
  id: SpeciesId;
  formulaDisplay: string;
  nameVi: string;
  molarMassTenthsGramsPerMol: number;
  phase: "aq" | "s" | "l" | "g";
  /** Illustrative colour of the dissolved species; opacity reaches 1 at `fullAtMillimolar`. Not a colorimetric measurement. */
  ionColor: { color: string; fullAtMillimolar: number } | null;
  solidColor: string | null;
  acidBase: AcidBaseRole;
  reviewStatus: "unverified" | "reviewed";
};

const s = (species: Omit<Species, "reviewStatus">): Species => Object.freeze({ ...species, reviewStatus: "unverified" as const });

export const SPECIES: Readonly<Record<SpeciesId, Species>> = Object.freeze({
  H2O: s({ id: "H2O", formulaDisplay: "H₂O", nameVi: "nước", molarMassTenthsGramsPerMol: 180, phase: "l", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  HCl: s({ id: "HCl", formulaDisplay: "HCl", nameVi: "hydrochloric acid", molarMassTenthsGramsPerMol: 365, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_acid", protons: 1 } }),
  H2SO4: s({ id: "H2SO4", formulaDisplay: "H₂SO₄", nameVi: "sulfuric acid", molarMassTenthsGramsPerMol: 981, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_acid", protons: 2 } }),
  CH3COOH: s({ id: "CH3COOH", formulaDisplay: "CH₃COOH", nameVi: "acetic acid", molarMassTenthsGramsPerMol: 600, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "weak_acid", constantId: "acetic" } }),
  NaOH: s({ id: "NaOH", formulaDisplay: "NaOH", nameVi: "sodium hydroxide", molarMassTenthsGramsPerMol: 400, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_base", hydroxides: 1 } }),
  CaOH2: s({ id: "CaOH2", formulaDisplay: "Ca(OH)₂", nameVi: "calcium hydroxide", molarMassTenthsGramsPerMol: 741, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_base", hydroxides: 2 } }),
  NaCl: s({ id: "NaCl", formulaDisplay: "NaCl", nameVi: "sodium chloride", molarMassTenthsGramsPerMol: 585, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  Na2SO4: s({ id: "Na2SO4", formulaDisplay: "Na₂SO₄", nameVi: "sodium sulfate", molarMassTenthsGramsPerMol: 1420, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  CuSO4: s({ id: "CuSO4", formulaDisplay: "CuSO₄", nameVi: "copper(II) sulfate", molarMassTenthsGramsPerMol: 1596, phase: "aq", ionColor: { color: "#0284c7", fullAtMillimolar: 100 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  FeSO4: s({ id: "FeSO4", formulaDisplay: "FeSO₄", nameVi: "iron(II) sulfate", molarMassTenthsGramsPerMol: 1519, phase: "aq", ionColor: { color: "#86efac", fullAtMillimolar: 200 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  ZnSO4: s({ id: "ZnSO4", formulaDisplay: "ZnSO₄", nameVi: "zinc sulfate", molarMassTenthsGramsPerMol: 1615, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
  ZnCl2: s({ id: "ZnCl2", formulaDisplay: "ZnCl₂", nameVi: "zinc chloride", molarMassTenthsGramsPerMol: 1363, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
  FeCl2: s({ id: "FeCl2", formulaDisplay: "FeCl₂", nameVi: "iron(II) chloride", molarMassTenthsGramsPerMol: 1268, phase: "aq", ionColor: { color: "#9fcf8f", fullAtMillimolar: 200 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  CaCl2: s({ id: "CaCl2", formulaDisplay: "CaCl₂", nameVi: "calcium chloride", molarMassTenthsGramsPerMol: 1110, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  BaCl2: s({ id: "BaCl2", formulaDisplay: "BaCl₂", nameVi: "barium chloride", molarMassTenthsGramsPerMol: 2083, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  BaSO4: s({ id: "BaSO4", formulaDisplay: "BaSO₄", nameVi: "barium sulfate", molarMassTenthsGramsPerMol: 2334, phase: "s", ionColor: null, solidColor: "#f4f4ee", acidBase: { kind: "neutral" } }),
  CaCO3: s({ id: "CaCO3", formulaDisplay: "CaCO₃", nameVi: "calcium carbonate (đá vôi)", molarMassTenthsGramsPerMol: 1001, phase: "s", ionColor: null, solidColor: "#e9e4d6", acidBase: { kind: "unmodeled" } }),
  Zn: s({ id: "Zn", formulaDisplay: "Zn", nameVi: "kẽm", molarMassTenthsGramsPerMol: 654, phase: "s", ionColor: null, solidColor: "#b9c1c6", acidBase: { kind: "unmodeled" } }),
  Fe: s({ id: "Fe", formulaDisplay: "Fe", nameVi: "sắt", molarMassTenthsGramsPerMol: 558, phase: "s", ionColor: null, solidColor: "#7d838a", acidBase: { kind: "unmodeled" } }),
  Cu: s({ id: "Cu", formulaDisplay: "Cu", nameVi: "đồng", molarMassTenthsGramsPerMol: 635, phase: "s", ionColor: null, solidColor: "#b45309", acidBase: { kind: "unmodeled" } }),
  H2: s({ id: "H2", formulaDisplay: "H₂", nameVi: "khí hydrogen", molarMassTenthsGramsPerMol: 20, phase: "g", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  CO2: s({ id: "CO2", formulaDisplay: "CO₂", nameVi: "khí carbon dioxide", molarMassTenthsGramsPerMol: 440, phase: "g", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
});

/** Mass in micrograms for an amount in nanomoles (g/mol = µg/µmol). Rounded to whole µg. */
export const microgramsOf = (species: SpeciesId, nanomoles: number) =>
  Math.round((nanomoles * SPECIES[species].molarMassTenthsGramsPerMol) / 10_000);
