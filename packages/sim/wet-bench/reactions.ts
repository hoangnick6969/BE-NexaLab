/**
 * k2-reactions@1: the reviewed (currently draft) reaction catalog shared by all K2 Labs.
 * A Lab config only allow-lists a subset. A pair of species that is neither covered by an
 * allowed reaction, the acid–base solver, nor an inert pair is OUT OF SCOPE: the engine never
 * infers "no reaction" from a missing rule.
 */
import { ACID_BASE_EXCLUDED_PAIRS, ACID_BASE_GROUP } from "./fl13-acid-base.data";
import type { SolidShape } from "./reagents";
import type { SpeciesId } from "./species";

export type ProductFate = "dissolved" | "precipitate" | "coating" | "gas" | "solvent";

export type StoichiometricReaction = {
  id: string;
  kind: "stoichiometric";
  equationDisplay: string;
  reactants: ReadonlyArray<{ species: SpeciesId; coeff: number }>;
  products: ReadonlyArray<{ species: SpeciesId; coeff: number; fate: ProductFate }>;
  /** Bubble intensity by solid shape, presentation only. */
  gasVigor?: Partial<Record<SolidShape, "low" | "medium" | "vigorous">>;
  phenomenonVi: string;
  reviewStatus: "unverified" | "reviewed";
};

/** The acid–base equilibrium handled by the pH solver (no consumption of formal amounts). */
export type AcidBaseEquilibrium = {
  id: "acid-base.neutralization";
  kind: "acid_base";
  equationDisplay: string;
  phenomenonVi: string;
  reviewStatus: "unverified" | "reviewed";
};

export type ReactionRule = StoichiometricReaction | AcidBaseEquilibrium;

const rxn = (r: Omit<StoichiometricReaction, "kind" | "reviewStatus">): StoichiometricReaction => ({ ...r, kind: "stoichiometric", reviewStatus: "unverified" });

export const K2_REACTIONS: readonly ReactionRule[] = Object.freeze([
  { id: "acid-base.neutralization", kind: "acid_base", equationDisplay: "H⁺ + OH⁻ → H₂O", phenomenonVi: "Acid và base trung hoà nhau; pH thay đổi", reviewStatus: "unverified" },
  rxn({ id: "metal-acid.zn-hcl", equationDisplay: "Zn + 2HCl → ZnCl₂ + H₂↑",
    reactants: [{ species: "Zn", coeff: 1 }, { species: "HCl", coeff: 2 }],
    products: [{ species: "ZnCl2", coeff: 1, fate: "dissolved" }, { species: "H2", coeff: 1, fate: "gas" }],
    gasVigor: { granule: "medium" }, phenomenonVi: "Hạt kẽm sủi bọt khí" }),
  rxn({ id: "metal-acid.fe-hcl", equationDisplay: "Fe + 2HCl → FeCl₂ + H₂↑",
    reactants: [{ species: "Fe", coeff: 1 }, { species: "HCl", coeff: 2 }],
    products: [{ species: "FeCl2", coeff: 1, fate: "dissolved" }, { species: "H2", coeff: 1, fate: "gas" }],
    gasVigor: { nail: "low" }, phenomenonVi: "Đinh sắt sủi bọt khí chậm" }),
  rxn({ id: "displace.fe-cuso4", equationDisplay: "Fe + CuSO₄ → FeSO₄ + Cu",
    reactants: [{ species: "Fe", coeff: 1 }, { species: "CuSO4", coeff: 1 }],
    products: [{ species: "FeSO4", coeff: 1, fate: "dissolved" }, { species: "Cu", coeff: 1, fate: "coating" }],
    phenomenonVi: "Đinh sắt phủ lớp màu đỏ đồng, màu xanh của dung dịch nhạt dần" }),
  rxn({ id: "displace.zn-cuso4", equationDisplay: "Zn + CuSO₄ → ZnSO₄ + Cu",
    reactants: [{ species: "Zn", coeff: 1 }, { species: "CuSO4", coeff: 1 }],
    products: [{ species: "ZnSO4", coeff: 1, fate: "dissolved" }, { species: "Cu", coeff: 1, fate: "coating" }],
    phenomenonVi: "Hạt kẽm phủ lớp màu đỏ đồng, màu xanh của dung dịch nhạt dần" }),
  rxn({ id: "precip.bacl2-na2so4", equationDisplay: "BaCl₂ + Na₂SO₄ → BaSO₄↓ + 2NaCl",
    reactants: [{ species: "BaCl2", coeff: 1 }, { species: "Na2SO4", coeff: 1 }],
    products: [{ species: "BaSO4", coeff: 1, fate: "precipitate" }, { species: "NaCl", coeff: 2, fate: "dissolved" }],
    phenomenonVi: "Xuất hiện kết tủa trắng" }),
  rxn({ id: "gas.caco3-hcl", equationDisplay: "CaCO₃ + 2HCl → CaCl₂ + CO₂↑ + H₂O",
    reactants: [{ species: "CaCO3", coeff: 1 }, { species: "HCl", coeff: 2 }],
    products: [{ species: "CaCl2", coeff: 1, fate: "dissolved" }, { species: "CO2", coeff: 1, fate: "gas" }, { species: "H2O", coeff: 1, fate: "solvent" }],
    gasVigor: { chips: "vigorous", powder: "vigorous" }, phenomenonVi: "Viên đá vôi sủi bọt khí mạnh" }),
  // FL-14b (salts) and FL-14c (oxides). Appended last so the order of earlier reactions never changes.
  rxn({ id: "gas.na2co3-hcl", equationDisplay: "Na₂CO₃ + 2HCl → 2NaCl + CO₂↑ + H₂O",
    reactants: [{ species: "Na2CO3", coeff: 1 }, { species: "HCl", coeff: 2 }],
    products: [{ species: "NaCl", coeff: 2, fate: "dissolved" }, { species: "CO2", coeff: 1, fate: "gas" }, { species: "H2O", coeff: 1, fate: "solvent" }],
    phenomenonVi: "Dung dịch sủi bọt khí" }),
  rxn({ id: "precip.agno3-nacl", equationDisplay: "AgNO₃ + NaCl → AgCl↓ + NaNO₃",
    reactants: [{ species: "AgNO3", coeff: 1 }, { species: "NaCl", coeff: 1 }],
    products: [{ species: "AgCl", coeff: 1, fate: "precipitate" }, { species: "NaNO3", coeff: 1, fate: "dissolved" }],
    phenomenonVi: "Xuất hiện kết tủa trắng" }),
  rxn({ id: "precip.fecl3-naoh", equationDisplay: "FeCl₃ + 3NaOH → Fe(OH)₃↓ + 3NaCl",
    reactants: [{ species: "FeCl3", coeff: 1 }, { species: "NaOH", coeff: 3 }],
    products: [{ species: "FeOH3", coeff: 1, fate: "precipitate" }, { species: "NaCl", coeff: 3, fate: "dissolved" }],
    phenomenonVi: "Xuất hiện kết tủa màu nâu đỏ" }),
  rxn({ id: "precip.cuso4-naoh", equationDisplay: "CuSO₄ + 2NaOH → Cu(OH)₂↓ + Na₂SO₄",
    reactants: [{ species: "CuSO4", coeff: 1 }, { species: "NaOH", coeff: 2 }],
    products: [{ species: "CuOH2", coeff: 1, fate: "precipitate" }, { species: "Na2SO4", coeff: 1, fate: "dissolved" }],
    phenomenonVi: "Xuất hiện kết tủa màu xanh lam" }),
  rxn({ id: "oxide-acid.cuo-h2so4", equationDisplay: "CuO + H₂SO₄ → CuSO₄ + H₂O",
    reactants: [{ species: "CuO", coeff: 1 }, { species: "H2SO4", coeff: 1 }],
    products: [{ species: "CuSO4", coeff: 1, fate: "dissolved" }, { species: "H2O", coeff: 1, fate: "solvent" }],
    phenomenonVi: "Bột đen tan dần, dung dịch chuyển sang màu xanh lam" }),
  rxn({ id: "oxide-acid.mgo-hcl", equationDisplay: "MgO + 2HCl → MgCl₂ + H₂O",
    reactants: [{ species: "MgO", coeff: 1 }, { species: "HCl", coeff: 2 }],
    products: [{ species: "MgCl2", coeff: 1, fate: "dissolved" }, { species: "H2O", coeff: 1, fate: "solvent" }],
    phenomenonVi: "Bột trắng tan dần, dung dịch không màu, không sủi bọt" }),
  rxn({ id: "oxide-acid.fe2o3-hcl", equationDisplay: "Fe₂O₃ + 6HCl → 2FeCl₃ + 3H₂O",
    reactants: [{ species: "Fe2O3", coeff: 1 }, { species: "HCl", coeff: 6 }],
    products: [{ species: "FeCl3", coeff: 2, fate: "dissolved" }, { species: "H2O", coeff: 3, fate: "solvent" }],
    phenomenonVi: "Bột nâu đỏ tan dần, dung dịch chuyển sang màu vàng nâu" }),
]);

export type ReactionId = string;

const pairs = (a: readonly SpeciesId[], b: readonly SpeciesId[]) => a.flatMap((x) => b.map((y) => [x, y] as [SpeciesId, SpeciesId]));

/**
 * Pairs reviewed (draft) as "no observable reaction within KHTN 8–9 scope".
 * Pairs that might react (e.g. Zn + FeCl2, CaCl2 + Na2SO4) are deliberately absent.
 */
export const K2_INERT_PAIRS: ReadonlyArray<[SpeciesId, SpeciesId]> = Object.freeze([
  // FL-14a: metals together, copper with acid/salt, spectator salts.
  ...pairs(["Zn", "Fe", "Cu"], ["Zn", "Fe", "Cu"]),
  ["Cu", "HCl"], ["Cu", "CuSO4"],
  ...pairs(["Cu"], ["ZnCl2", "FeCl2", "ZnSO4", "FeSO4"]),
  ...pairs(["Fe"], ["ZnCl2", "ZnSO4", "FeCl2", "FeSO4"]),
  ...pairs(["Zn"], ["ZnCl2", "ZnSO4"]),
  ...pairs(["ZnCl2", "FeCl2", "ZnSO4", "FeSO4"], ["HCl", "CuSO4", "ZnCl2", "FeCl2", "ZnSO4", "FeSO4"]),
  ["HCl", "CuSO4"],
  // FL-10 Explore: spectator ions and the insoluble products.
  ...pairs(["BaCl2", "Na2SO4", "BaSO4", "NaCl", "CaCl2"], ["HCl"]),
  ...pairs(["BaSO4"], ["BaCl2", "Na2SO4", "NaCl", "CaCl2", "BaSO4"]),
  ...pairs(["NaCl"], ["BaCl2", "Na2SO4", "CaCl2", "NaCl"]),
  ["CaCl2", "BaCl2"], ["CaCl2", "CaCl2"],
  ...pairs(["CaCO3"], ["NaCl", "CaCl2", "BaSO4", "CaCO3"]),
  // FL-14b: spectator salts and insoluble products. Pairs that might react (Na₂CO₃ with AgNO₃, FeCl₃ or CuSO₄; AgNO₃ with
  // HCl, FeCl₃, NaOH, CuSO₄ or Na₂SO₄; acids with the hydroxides) are deliberately absent: the engine reports them as unreviewed.
  ...pairs(["NaCl", "NaNO3", "Na2SO4"], ["Na2CO3", "HCl", "FeCl3", "NaOH", "CuSO4", "NaCl", "NaNO3", "Na2SO4", "AgCl", "FeOH3", "CuOH2"]),
  ["NaNO3", "AgNO3"],
  ...pairs(["AgCl", "FeOH3", "CuOH2"], ["AgCl", "FeOH3", "CuOH2"]),
  ...pairs(["HCl"], ["FeCl3", "AgCl"]),
  ...pairs(["Na2CO3"], ["NaOH", "AgCl"]),
  ["AgNO3", "AgCl"],
  ...pairs(["FeCl3"], ["CuSO4", "AgCl", "FeOH3"]),
  ...pairs(["NaOH"], ["FeOH3", "CuOH2"]),
  ...pairs(["CuSO4"], ["AgCl", "FeOH3", "CuOH2", "FeCl3"]),
  // FL-14c: oxides do not react with each other or with NaOH (the oxide–acid pairs that are not reactions stay unreviewed).
  ...pairs(["CuO", "MgO", "Fe2O3"], ["CuO", "MgO", "Fe2O3", "NaOH", "CuSO4", "MgCl2", "FeCl3"]),
  ...pairs(["CuSO4", "MgCl2", "FeCl3"], ["HCl", "H2SO4", "CuSO4", "MgCl2", "FeCl3"]),
]);

/** Species that take part in pair checks. Water, indicators and gases never do. */
export const isPairChecked = (species: SpeciesId) => species !== "H2O" && species !== "H2" && species !== "CO2";

export type PairVerdict =
  | { kind: "acid_base" }
  | { kind: "reaction"; reactionId: string }
  | { kind: "inert" }
  | { kind: "not_in_lab_scope"; reactionId: string }
  | { kind: "unreviewed"; reasonVi?: string };

const same = (p: readonly [SpeciesId, SpeciesId], a: SpeciesId, b: SpeciesId) => (p[0] === a && p[1] === b) || (p[0] === b && p[1] === a);

/** Classifies one pair of species present together against the catalog and a Lab allow-list. */
export function classifyPair(a: SpeciesId, b: SpeciesId, allowedReactions: readonly string[]): PairVerdict {
  if (ACID_BASE_GROUP.includes(a) && ACID_BASE_GROUP.includes(b)) {
    const excluded = ACID_BASE_EXCLUDED_PAIRS.find((item) => same(item.pair, a, b));
    if (excluded) return { kind: "unreviewed", reasonVi: excluded.reasonVi };
    if (a === b) return { kind: "inert" };
    return allowedReactions.includes("acid-base.neutralization") ? { kind: "acid_base" } : { kind: "not_in_lab_scope", reactionId: "acid-base.neutralization" };
  }
  if (a === b) return { kind: "inert" };
  const rule = K2_REACTIONS.find((item): item is StoichiometricReaction =>
    item.kind === "stoichiometric" && item.reactants.length === 2 && same([item.reactants[0].species, item.reactants[1].species], a, b));
  if (rule) return allowedReactions.includes(rule.id) ? { kind: "reaction", reactionId: rule.id } : { kind: "not_in_lab_scope", reactionId: rule.id };
  if (K2_INERT_PAIRS.some((pair) => same(pair, a, b))) return { kind: "inert" };
  return { kind: "unreviewed" };
}

export const reactionById = (id: string) => K2_REACTIONS.find((item) => item.id === id) ?? null;
