/**
 * FL-13 (Acid – base, chỉ thị & pH) scientific data, kept in one file for independent review.
 * Every value is a technical draft (`unverified`) until a chemistry reviewer signs it off.
 * Golden expectations live in `fl13-acid-base.golden.test.ts`.
 *
 * Model assumptions (shown to learners as limitations):
 * - 25 °C, ideal dilute solutions (activity = concentration), volumes add exactly.
 * - HCl, H2SO4, NaOH and Ca(OH)2 dissociate completely (H2SO4 counted as 2 H⁺).
 * - CH3COOH is the only weak acid (single Ka); indicator drops add volume but no acid/base.
 * - Temperature is not modelled.
 */
import type { SpeciesId } from "./species";

export const FL13_DATA_VERSION = "fl13-acid-base-data@1" as const;
export const FL13_REVIEW: { status: "unverified" | "reviewed"; note: string } = { status: "unverified", note: "Technical draft; chemistry reviewer sign-off pending." };

/** Ionic product of water at 25 °C. */
export const KW = 1e-14;
/** Acid dissociation constants used by the solver. */
export const WEAK_ACID_KA = { acetic: 1.8e-5 } as const;

/** Litmus paper colour by pH: red when pH ≤ 5.0, purple when 5.0 < pH < 8.0, blue when pH ≥ 8.0. */
export const LITMUS_BANDS = [
  { id: "red", maxCentiPhInclusive: 500, color: "#d8434a", labelVi: "đỏ" },
  { id: "purple", maxCentiPhInclusive: 799, color: "#8a5cb8", labelVi: "tím" },
  { id: "blue", maxCentiPhInclusive: Infinity, color: "#3f6fd1", labelVi: "xanh" },
] as const;

/** Phenolphthalein: colourless below pH 8.2, light pink 8.2 ≤ pH < 10.0, deep pink at pH ≥ 10.0. */
export const PHENOLPHTHALEIN_BANDS = [
  { id: "colourless", fromCentiPh: -Infinity, toCentiPhExclusive: 820, color: null, labelVi: "không màu" },
  { id: "light_pink", fromCentiPh: 820, toCentiPhExclusive: 1000, color: "#f472b6", labelVi: "hồng nhạt" },
  { id: "deep_pink", fromCentiPh: 1000, toCentiPhExclusive: Infinity, color: "#db2777", labelVi: "hồng đậm" },
] as const;

export type LitmusColour = (typeof LITMUS_BANDS)[number]["id"];
export type PhenolphthaleinColour = (typeof PHENOLPHTHALEIN_BANDS)[number]["id"];

/**
 * Pairs the acid–base solver may combine. Any pair of these species is supported
 * except the listed exclusions, which the reviewed model does not cover.
 */
export const ACID_BASE_GROUP: readonly SpeciesId[] = ["HCl", "H2SO4", "CH3COOH", "NaOH", "CaOH2"];
export const ACID_BASE_EXCLUDED_PAIRS: ReadonlyArray<{ pair: [SpeciesId, SpeciesId]; reasonVi: string }> = [
  {
    pair: ["H2SO4", "CaOH2"],
    reasonVi: "Calcium sulfate (CaSO₄) ít tan có thể tạo vẩn đục; mô hình pH của bài chưa tính kết tủa này.",
  },
];

/** FL-13 shelf reagents. Concentrations in mM (1 mM × 1 µL = 1 nmol). */
export const FL13_REAGENTS = [
  { id: "HCl_0_1M", labelVi: "Dung dịch HCl 0,1 M", solute: "HCl", millimolar: 100, hazard: "warning", tags: ["corrosive"],
    safetyNoteSim: "Acid mạnh: nhỏ thử thoải mái trong mô phỏng.", safetyNoteRealLab: "Ăn mòn da và mắt (GHS05): đeo kính, găng tay; rửa ngay bằng nhiều nước nếu dính." },
  { id: "H2SO4_0_05M", labelVi: "Dung dịch H₂SO₄ loãng 0,05 M", solute: "H2SO4", millimolar: 50, hazard: "warning", tags: ["corrosive"],
    safetyNoteSim: "Acid mạnh loãng.", safetyNoteRealLab: "Ăn mòn (GHS05). Khi pha loãng acid đặc phải rót từ từ acid vào nước, không làm ngược lại." },
  { id: "CH3COOH_0_1M", labelVi: "Dung dịch CH₃COOH 0,1 M (giấm)", solute: "CH3COOH", millimolar: 100, hazard: "caution", tags: ["irritant"],
    safetyNoteSim: "Acid yếu.", safetyNoteRealLab: "Gây kích ứng mắt; không nếm hoá chất trong phòng thí nghiệm dù là giấm." },
  { id: "H2O_distilled", labelVi: "Nước cất", solute: null, millimolar: 0, hazard: "none", tags: [],
    safetyNoteSim: "Trung tính.", safetyNoteRealLab: "Không uống nước cất trong phòng thí nghiệm." },
  { id: "NaOH_0_1M", labelVi: "Dung dịch NaOH 0,1 M", solute: "NaOH", millimolar: 100, hazard: "warning", tags: ["corrosive"],
    safetyNoteSim: "Base mạnh.", safetyNoteRealLab: "Ăn mòn (GHS05), đặc biệt nguy hiểm cho mắt: luôn đeo kính bảo hộ." },
  { id: "CaOH2_0_01M", labelVi: "Nước vôi trong Ca(OH)₂ 0,01 M", solute: "CaOH2", millimolar: 10, hazard: "caution", tags: ["irritant"],
    safetyNoteSim: "Base.", safetyNoteRealLab: "Gây kích ứng da, mắt; rửa tay sau thí nghiệm." },
] as const;

export const FL13_INDICATOR = {
  id: "phenolphthalein_indicator", labelVi: "Dung dịch phenolphthalein", indicator: "phenolphthalein", microlitersPerDrop: 50,
  hazard: "caution", tags: ["flammable"],
  safetyNoteSim: "Chất chỉ thị: chỉ đổi màu, không làm thay đổi pH trong mô hình.",
  safetyNoteRealLab: "Pha trong cồn, dễ cháy: để xa ngọn lửa.",
} as const;

/** One drop from a dropper, in µL. Presets offered by FL-13: 1 drop, 5 drops, 1 mL. */
export const DROP_MICROLITERS = 50;
