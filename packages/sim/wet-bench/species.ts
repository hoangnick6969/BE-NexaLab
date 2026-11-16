/**
 * K2 wet-bench species table. Scientific data here is a technical draft
 * (`reviewStatus: "unverified"`) until a chemistry reviewer signs it off.
 * Units: molar mass in tenths of g/mol (585 = 58.5 g/mol), matching mass-conservation.ts.
 * Convention (P0 D-2, KHTN 8 exercises): whole-number atomic masses H 1, C 12, O 16, Na 23, S 32, Ca 40,
 * Fe 56, Cu 64, Zn 65, Ba 137 and Cl 35.5, so Fe = 56 and CaCO₃ = 100. Not IUPAC standard atomic weights
 * (Fe 55.845, Cu 63.546, Zn 65.38): the model teaches textbook arithmetic. The full table has not been
 * checked against the textbook page by page; see the delivery tracking, task K2-1.6.
 */
export type SpeciesId =
  | "H2O" | "HCl" | "H2SO4" | "CH3COOH" | "NaOH" | "CaOH2"
  | "NaCl" | "Na2SO4" | "CuSO4" | "FeSO4" | "ZnSO4" | "ZnCl2" | "FeCl2" | "CaCl2" | "BaCl2"
  | "BaSO4" | "CaCO3" | "Zn" | "Fe" | "Cu" | "H2" | "CO2"
  // FL-14b salts and FL-14c oxides (draft data).
  | "Na2CO3" | "AgNO3" | "NaNO3" | "FeCl3" | "AgCl" | "FeOH3" | "CuOH2" | "CuO" | "MgO" | "Fe2O3" | "MgCl2";

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
  H2SO4: s({ id: "H2SO4", formulaDisplay: "H₂SO₄", nameVi: "sulfuric acid", molarMassTenthsGramsPerMol: 980, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_acid", protons: 2 } }),
  CH3COOH: s({ id: "CH3COOH", formulaDisplay: "CH₃COOH", nameVi: "acetic acid", molarMassTenthsGramsPerMol: 600, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "weak_acid", constantId: "acetic" } }),
  NaOH: s({ id: "NaOH", formulaDisplay: "NaOH", nameVi: "sodium hydroxide", molarMassTenthsGramsPerMol: 400, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_base", hydroxides: 1 } }),
  CaOH2: s({ id: "CaOH2", formulaDisplay: "Ca(OH)₂", nameVi: "calcium hydroxide", molarMassTenthsGramsPerMol: 740, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "strong_base", hydroxides: 2 } }),
  NaCl: s({ id: "NaCl", formulaDisplay: "NaCl", nameVi: "sodium chloride", molarMassTenthsGramsPerMol: 585, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  Na2SO4: s({ id: "Na2SO4", formulaDisplay: "Na₂SO₄", nameVi: "sodium sulfate", molarMassTenthsGramsPerMol: 1420, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  CuSO4: s({ id: "CuSO4", formulaDisplay: "CuSO₄", nameVi: "copper(II) sulfate", molarMassTenthsGramsPerMol: 1600, phase: "aq", ionColor: { color: "#0284c7", fullAtMillimolar: 100 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  FeSO4: s({ id: "FeSO4", formulaDisplay: "FeSO₄", nameVi: "iron(II) sulfate", molarMassTenthsGramsPerMol: 1520, phase: "aq", ionColor: { color: "#86efac", fullAtMillimolar: 200 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  ZnSO4: s({ id: "ZnSO4", formulaDisplay: "ZnSO₄", nameVi: "zinc sulfate", molarMassTenthsGramsPerMol: 1610, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
  ZnCl2: s({ id: "ZnCl2", formulaDisplay: "ZnCl₂", nameVi: "zinc chloride", molarMassTenthsGramsPerMol: 1360, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
  FeCl2: s({ id: "FeCl2", formulaDisplay: "FeCl₂", nameVi: "iron(II) chloride", molarMassTenthsGramsPerMol: 1270, phase: "aq", ionColor: { color: "#9fcf8f", fullAtMillimolar: 200 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  CaCl2: s({ id: "CaCl2", formulaDisplay: "CaCl₂", nameVi: "calcium chloride", molarMassTenthsGramsPerMol: 1110, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  BaCl2: s({ id: "BaCl2", formulaDisplay: "BaCl₂", nameVi: "barium chloride", molarMassTenthsGramsPerMol: 2080, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  BaSO4: s({ id: "BaSO4", formulaDisplay: "BaSO₄", nameVi: "barium sulfate", molarMassTenthsGramsPerMol: 2330, phase: "s", ionColor: null, solidColor: "#f4f4ee", acidBase: { kind: "neutral" } }),
  CaCO3: s({ id: "CaCO3", formulaDisplay: "CaCO₃", nameVi: "calcium carbonate (đá vôi)", molarMassTenthsGramsPerMol: 1000, phase: "s", ionColor: null, solidColor: "#e9e4d6", acidBase: { kind: "unmodeled" } }),
  Zn: s({ id: "Zn", formulaDisplay: "Zn", nameVi: "kẽm", molarMassTenthsGramsPerMol: 650, phase: "s", ionColor: null, solidColor: "#b9c1c6", acidBase: { kind: "unmodeled" } }),
  Fe: s({ id: "Fe", formulaDisplay: "Fe", nameVi: "sắt", molarMassTenthsGramsPerMol: 560, phase: "s", ionColor: null, solidColor: "#7d838a", acidBase: { kind: "unmodeled" } }),
  Cu: s({ id: "Cu", formulaDisplay: "Cu", nameVi: "đồng", molarMassTenthsGramsPerMol: 640, phase: "s", ionColor: null, solidColor: "#b45309", acidBase: { kind: "unmodeled" } }),
  H2: s({ id: "H2", formulaDisplay: "H₂", nameVi: "khí hydrogen", molarMassTenthsGramsPerMol: 20, phase: "g", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  CO2: s({ id: "CO2", formulaDisplay: "CO₂", nameVi: "khí carbon dioxide", molarMassTenthsGramsPerMol: 440, phase: "g", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  // FL-14b (salts) and FL-14c (oxides). Whole-number atomic masses as above, plus Ag 108, N 14, Mg 24.
  Na2CO3: s({ id: "Na2CO3", formulaDisplay: "Na₂CO₃", nameVi: "sodium carbonate", molarMassTenthsGramsPerMol: 1060, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
  AgNO3: s({ id: "AgNO3", formulaDisplay: "AgNO₃", nameVi: "silver nitrate", molarMassTenthsGramsPerMol: 1700, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  NaNO3: s({ id: "NaNO3", formulaDisplay: "NaNO₃", nameVi: "sodium nitrate", molarMassTenthsGramsPerMol: 850, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "neutral" } }),
  FeCl3: s({ id: "FeCl3", formulaDisplay: "FeCl₃", nameVi: "iron(III) chloride", molarMassTenthsGramsPerMol: 1625, phase: "aq", ionColor: { color: "#d4a017", fullAtMillimolar: 100 }, solidColor: null, acidBase: { kind: "unmodeled" } }),
  AgCl: s({ id: "AgCl", formulaDisplay: "AgCl", nameVi: "silver chloride", molarMassTenthsGramsPerMol: 1435, phase: "s", ionColor: null, solidColor: "#f5f5f0", acidBase: { kind: "neutral" } }),
  FeOH3: s({ id: "FeOH3", formulaDisplay: "Fe(OH)₃", nameVi: "iron(III) hydroxide", molarMassTenthsGramsPerMol: 1070, phase: "s", ionColor: null, solidColor: "#9a3412", acidBase: { kind: "neutral" } }),
  CuOH2: s({ id: "CuOH2", formulaDisplay: "Cu(OH)₂", nameVi: "copper(II) hydroxide", molarMassTenthsGramsPerMol: 980, phase: "s", ionColor: null, solidColor: "#4f9fd6", acidBase: { kind: "neutral" } }),
  CuO: s({ id: "CuO", formulaDisplay: "CuO", nameVi: "copper(II) oxide", molarMassTenthsGramsPerMol: 800, phase: "s", ionColor: null, solidColor: "#1f2937", acidBase: { kind: "unmodeled" } }),
  MgO: s({ id: "MgO", formulaDisplay: "MgO", nameVi: "magnesium oxide", molarMassTenthsGramsPerMol: 400, phase: "s", ionColor: null, solidColor: "#f1f1ee", acidBase: { kind: "unmodeled" } }),
  Fe2O3: s({ id: "Fe2O3", formulaDisplay: "Fe₂O₃", nameVi: "iron(III) oxide", molarMassTenthsGramsPerMol: 1600, phase: "s", ionColor: null, solidColor: "#9a3412", acidBase: { kind: "unmodeled" } }),
  MgCl2: s({ id: "MgCl2", formulaDisplay: "MgCl₂", nameVi: "magnesium chloride", molarMassTenthsGramsPerMol: 950, phase: "aq", ionColor: null, solidColor: null, acidBase: { kind: "unmodeled" } }),
});

/** Mass in micrograms for an amount in nanomoles (g/mol = µg/µmol). Rounded to whole µg. */
export const microgramsOf = (species: SpeciesId, nanomoles: number) =>
  Math.round((nanomoles * SPECIES[species].molarMassTenthsGramsPerMol) / 10_000);

/** Amount in nanomoles for a mass in micrograms; the inverse of microgramsOf. Rounded to whole nmol. */
export const nanomolesOf = (species: SpeciesId, micrograms: number) =>
  Math.round((micrograms * 10_000) / SPECIES[species].molarMassTenthsGramsPerMol);
