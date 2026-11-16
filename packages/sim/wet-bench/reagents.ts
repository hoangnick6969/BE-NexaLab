/** K2 reagent registry: every bottle on any K2 shelf, defined once. Draft data (`unverified`). */
import { FL13_INDICATOR, FL13_REAGENTS } from "./fl13-acid-base.data";
import type { SpeciesId } from "./species";

export type HazardLevel = "none" | "caution" | "warning" | "danger";
export type HazardTag = "corrosive" | "irritant" | "toxic_if_swallowed" | "flammable" | "aquatic_long_lasting" | "corrosive_to_metals";
export type IndicatorId = "phenolphthalein";
export type SolidShape = "granule" | "chips" | "nail" | "foil" | "powder";

export type ReagentComposition =
  | { kind: "solution"; solute: SpeciesId | null; millimolar: number; densityMicrogramsPerMicroliter: number }
  | { kind: "solid"; species: SpeciesId; nanomolesPerPiece: number; shape: SolidShape }
  | { kind: "indicator"; indicator: IndicatorId; microlitersPerDrop: number; densityMicrogramsPerMicroliter: number }
  /** Powder taken by mass with a spatula (engine 1.1.0); it dissolves only after stirring, up to the Lab's solubility constant. */
  | { kind: "powder"; species: SpeciesId };

export type Reagent = {
  id: string;
  labelVi: string;
  composition: ReagentComposition;
  /** Tool the kit uses when the bottle is dragged straight onto a vessel. */
  dispenser: "dropper" | "tongs" | "spatula" | "pour";
  bottleColor: string;
  hazard: { level: HazardLevel; tags: readonly HazardTag[] };
  safetyNoteSim: string;
  safetyNoteRealLab: string;
  reviewStatus: "unverified" | "reviewed";
};

const fl13 = FL13_REAGENTS.map((item): Reagent => ({
  id: item.id,
  labelVi: item.labelVi,
  composition: { kind: "solution", solute: item.solute, millimolar: item.millimolar, densityMicrogramsPerMicroliter: 1000 },
  dispenser: "dropper",
  bottleColor: "#eef5f6",
  hazard: { level: item.hazard, tags: item.tags },
  safetyNoteSim: item.safetyNoteSim,
  safetyNoteRealLab: item.safetyNoteRealLab,
  reviewStatus: "unverified",
}));

const indicator: Reagent = {
  id: FL13_INDICATOR.id,
  labelVi: FL13_INDICATOR.labelVi,
  composition: { kind: "indicator", indicator: FL13_INDICATOR.indicator, microlitersPerDrop: FL13_INDICATOR.microlitersPerDrop, densityMicrogramsPerMicroliter: 800 },
  dispenser: "dropper",
  bottleColor: "#f6f1e8",
  hazard: { level: FL13_INDICATOR.hazard, tags: FL13_INDICATOR.tags },
  safetyNoteSim: FL13_INDICATOR.safetyNoteSim,
  safetyNoteRealLab: FL13_INDICATOR.safetyNoteRealLab,
  reviewStatus: "unverified",
};

const solution = (id: string, labelVi: string, solute: SpeciesId, millimolar: number, bottleColor: string, hazard: Reagent["hazard"], sim: string, real: string): Reagent => ({
  id, labelVi, composition: { kind: "solution", solute, millimolar, densityMicrogramsPerMicroliter: 1000 }, dispenser: "dropper",
  bottleColor, hazard, safetyNoteSim: sim, safetyNoteRealLab: real, reviewStatus: "unverified",
});
const solid = (id: string, labelVi: string, species: SpeciesId, nanomolesPerPiece: number, shape: SolidShape, bottleColor: string, hazard: Reagent["hazard"], sim: string, real: string): Reagent => ({
  id, labelVi, composition: { kind: "solid", species, nanomolesPerPiece, shape }, dispenser: "tongs",
  bottleColor, hazard, safetyNoteSim: sim, safetyNoteRealLab: real, reviewStatus: "unverified",
});

/** Other K2 bottles used by the FL-14a and FL-10 Explore sample configs. */
const others: Reagent[] = [
  solution("CuSO4_0_1M", "Dung dịch CuSO₄ 0,1 M", "CuSO4", 100, "#cfe4f5", { level: "warning", tags: ["toxic_if_swallowed"] },
    "Dung dịch muối đồng màu xanh.", "Độc khi nuốt; rửa tay sau thí nghiệm, không đổ xuống cống."),
  solution("BaCl2_0_1M", "Dung dịch BaCl₂ 0,1 M", "BaCl2", 100, "#eef5f6", { level: "danger", tags: ["toxic_if_swallowed"] },
    "Muối barium tan: chỉ làm trong mô phỏng.", "Muối barium tan có độc tính: chỉ làm khi có giáo viên, xử lý chất thải theo quy định."),
  solution("Na2SO4_0_1M", "Dung dịch Na₂SO₄ 0,1 M", "Na2SO4", 100, "#eef5f6", { level: "none", tags: [] },
    "Dung dịch muối không màu.", "Đeo kính khi rót dung dịch."),
  solid("CaCO3_chips", "Đá vôi (CaCO₃) dạng viên", "CaCO3", 10_000_000, "chips", "#efe9dc", { level: "none", tags: [] },
    "Mỗi lần gắp một viên khoảng 1 g.", "Dùng kẹp, không cầm bằng tay ướt acid."),
  solid("Zn_granule", "Kẽm (Zn) dạng hạt", "Zn", 10_000_000, "granule", "#e3e7ea", { level: "none", tags: [] },
    "Mỗi lần gắp một hạt khoảng 0,65 g.", "Khí H₂ sinh ra dễ cháy: tránh xa lửa."),
  solid("Fe_nail", "Đinh sắt (Fe)", "Fe", 18_000_000, "nail", "#dfe2e5", { level: "none", tags: [] },
    "Mỗi lần gắp một đinh khoảng 1 g.", "Đinh đã đánh sạch gỉ; cẩn thận đầu nhọn."),
  solid("Cu_foil", "Lá đồng (Cu)", "Cu", 8_000_000, "foil", "#f1ddd2", { level: "none", tags: [] },
    "Mỗi lần gắp một lá khoảng 0,5 g.", "Mép lá kim loại có thể sắc."),
];

const powder = (id: string, labelVi: string, species: SpeciesId, bottleColor: string, hazard: Reagent["hazard"], sim: string, real: string): Reagent => ({
  id, labelVi, composition: { kind: "powder", species }, dispenser: "spatula",
  bottleColor, hazard, safetyNoteSim: sim, safetyNoteRealLab: real, reviewStatus: "unverified",
});

/** FL-11 powders and the water bottle (engine 1.1.0). Draft data until a chemistry reviewer signs it off. */
const powders: Reagent[] = [
  {
    id: "H2O_pour", labelVi: "Nước cất (chai rót)", composition: { kind: "solution", solute: null, millimolar: 0, densityMicrogramsPerMicroliter: 1000 }, dispenser: "pour",
    bottleColor: "#eef5f6", hazard: { level: "none", tags: [] }, safetyNoteSim: "Rót từng lượng theo nấc em chọn; thêm đến vạch của bình định mức bằng nút riêng.",
    safetyNoteRealLab: "Dùng chai rót hoặc bình tia, tránh bắn nước ra ngoài.", reviewStatus: "unverified",
  },
  powder("NaCl_powder", "Muối ăn (NaCl) dạng bột", "NaCl", "#f4f4f2", { level: "none", tags: [] },
    "Cân bằng thìa, lấy khối lượng theo số em tính.", "Dùng thìa sạch, khô; không nếm hóa chất trong phòng thí nghiệm."),
  powder("CuSO4_powder", "Đồng(II) sunfat (CuSO₄) dạng bột", "CuSO4", "#8ec3e6", { level: "warning", tags: ["toxic_if_swallowed", "irritant"] },
    "Bột màu xanh, tan cho dung dịch xanh.", "Độc khi nuốt, gây kích ứng mắt: đeo kính và găng tay, rửa tay sau khi làm."),
];

/** FL-12 (engine 1.2.0): a second acid strength and the same limestone as a fine powder. Draft data. */
const rateReagents: Reagent[] = [
  solution("HCl_0_2M", "Dung dịch HCl 0,2 M", "HCl", 200, "#eef5f6", { level: "warning", tags: ["corrosive"] },
    "Acid đặc gấp đôi dung dịch 0,1 M.", "Ăn mòn: đeo kính và găng tay, rót từ từ."),
  { ...solid("CaCO3_powder", "Đá vôi (CaCO₃) dạng bột", "CaCO3", 10_000_000, "powder", "#efe9dc", { level: "none", tags: [] },
    "Mỗi muỗng khoảng 1 g, cùng khối lượng với một viên đá vôi.", "Bột mịn dễ bay: không hít, dùng thìa sạch, khô."), dispenser: "spatula" },
];

export const REAGENTS: Readonly<Record<string, Reagent>> = Object.freeze(
  Object.fromEntries([...fl13, indicator, ...others, ...powders, ...rateReagents].map((reagent) => [reagent.id, Object.freeze(reagent)])),
);

export const reagentById = (id: string): Reagent | null => (Object.hasOwn(REAGENTS, id) ? REAGENTS[id] : null);

/** Product-specific labels for FL-15, from section 2 of the respective SDS. */
const safetyScenarioProducts: readonly Reagent[] = [
  {
    ...solution("CuSO4_0_1M_CO0102", "Dung dịch CuSO₄ 0,1 M (Scharlab CO0102)", "CuSO4", 100, "#cfe4f5",
      { level: "caution", tags: ["aquatic_long_lasting"] }, "Chai mẫu để đọc nhãn.",
      "H412: Có hại lâu dài đối với sinh vật thủy sinh."),
    reviewStatus: "reviewed",
  },
  {
    ...solution("H2SO4_0_05M_6793", "Dung dịch H₂SO₄ 0,05 M (Carl Roth 6793)", "H2SO4", 50, "#eef5f6",
      { level: "warning", tags: ["corrosive_to_metals"] }, "Chai mẫu để đọc nhãn.",
      "H290: Có thể ăn mòn kim loại."),
    reviewStatus: "reviewed",
  },
];

export const safetyScenarioReagentById = (id: string): Reagent | null =>
  safetyScenarioProducts.find((product) => product.id === id) ?? reagentById(id);
