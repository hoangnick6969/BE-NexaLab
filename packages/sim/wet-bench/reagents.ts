/** K2 reagent registry: every bottle on any K2 shelf, defined once. Draft data (`unverified`). */
import { FL13_INDICATOR, FL13_REAGENTS } from "./fl13-acid-base.data";
import type { SpeciesId } from "./species";

export type HazardLevel = "none" | "caution" | "warning" | "danger";
export type HazardTag = "corrosive" | "irritant" | "toxic_if_swallowed" | "flammable";
export type IndicatorId = "phenolphthalein";
export type SolidShape = "granule" | "chips" | "nail" | "foil";

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
  dispenser: "dropper" | "tongs" | "spatula";
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

/** FL-11 powders (engine 1.1.0). Draft data until a chemistry reviewer signs it off. */
const powders: Reagent[] = [
  powder("NaCl_powder", "Muối ăn (NaCl) dạng bột", "NaCl", "#f4f4f2", { level: "none", tags: [] },
    "Cân bằng thìa, lấy khối lượng theo số em tính.", "Dùng thìa sạch, khô; không nếm hóa chất trong phòng thí nghiệm."),
  powder("CuSO4_powder", "Đồng(II) sunfat (CuSO₄) dạng bột", "CuSO4", "#8ec3e6", { level: "warning", tags: ["toxic_if_swallowed", "irritant"] },
    "Bột màu xanh, tan cho dung dịch xanh.", "Độc khi nuốt, gây kích ứng mắt: đeo kính và găng tay, rửa tay sau khi làm."),
];

export const REAGENTS: Readonly<Record<string, Reagent>> = Object.freeze(
  Object.fromEntries([...fl13, indicator, ...others, ...powders].map((reagent) => [reagent.id, Object.freeze(reagent)])),
);

export const reagentById = (id: string): Reagent | null => (Object.hasOwn(REAGENTS, id) ? REAGENTS[id] : null);
