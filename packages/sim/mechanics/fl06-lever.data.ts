/** Packaged FL-06 Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { LEVER_ENGINE, LEVER_FIXTURE_ID, LEVER_KIT, type LeverLabConfig } from "./contracts";

export const FL06_LEVER_EXPLORE_CONFIG: LeverLabConfig = {
  schema: "k5-lever-config/1",
  labId: "lever-equilibrium",
  catalogId: "FL-06",
  configVersion: 2,
  kit: LEVER_KIT,
  engine: LEVER_ENGINE,
  fixtureId: LEVER_FIXTURE_ID,
  title: "Moment lực và đòn bẩy",
  contextLabel: "Vật lý 8 · Khám phá đòn bẩy",
  outcomeSummary: [
    "Nhận biết tác dụng làm quay của lực qua moment lực M = F × d.",
    "Tìm điều kiện để đòn bẩy nằm cân bằng.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình lý tưởng: bỏ qua khối lượng thanh và ma sát ở điểm tựa."],
    realLab: ["Treo quả nặng nhẹ tay, giữ tay và chân tránh xa phía dưới thanh."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Thanh cứng, khối lượng thanh được bỏ qua.",
    "Bỏ qua ma sát ở điểm tựa O.",
    "Mọi lực đều thẳng đứng hướng xuống; điểm tựa cố định ở 0 mm.",
    "Thanh chỉ cho biết nằm ngang hay nghiêng, không tính góc nghiêng.",
  ],
  modes: { explore: true },
  enabledApparatus: [
    { id: "bar", kind: "lever_bar", slot: "bench", labelVi: "Thanh đòn" },
    { id: "weights", kind: "weight_set", slot: "tray", labelVi: "Bộ quả nặng" },
    { id: "gauge", kind: "spring_gauge", slot: "hook", labelVi: "Lực kế" },
  ],
  weights: { availableMilliNewtons: [500, 1000, 2000], maxCount: 4 },
  initialAttachments: [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }],
  measurements: ["ruler", "force_labels", "moment_table"],
  pedagogy: {
    observationPrompts: [
      { id: "at-fulcrum", kind: "note", textVi: "Treo quả nặng ngay tại O. Thanh thay đổi thế nào?" },
      { id: "farther", kind: "note", textVi: "Dời quả nặng ra xa O. Moment của nó thay đổi ra sao?" },
      { id: "balance", kind: "free_text", textVi: "Tìm ít nhất hai cách để thanh nằm ngang. Ghi lại F và d mỗi bên.", challenge: true },
      { id: "explain-balance", kind: "free_text", textVi: "Vì sao thanh nằm ngang? Dùng moment hai bên để giải thích." },
    ],
  },
  classTemplates: [
    {
      id: "balance-the-lever",
      titleVi: "Làm thanh đòn cân bằng",
      loadPresets: [
        { id: "load-1n-left-100", labelVi: "1 N ở bên trái, cách O 100 mm", attachments: [{ kind: "WEIGHT", positionMillimetres: -100, forceMilliNewtons: 1000 }] },
        { id: "load-2n-right-150", labelVi: "2 N ở bên phải, cách O 150 mm", attachments: [{ kind: "WEIGHT", positionMillimetres: 150, forceMilliNewtons: 2000 }] },
        { id: "load-05n-left-250", labelVi: "0,5 N ở bên trái, cách O 250 mm", attachments: [{ kind: "WEIGHT", positionMillimetres: -250, forceMilliNewtons: 500 }] },
        { id: "load-2n-left-200", labelVi: "2 N ở bên trái, cách O 200 mm", attachments: [{ kind: "WEIGHT", positionMillimetres: -200, forceMilliNewtons: 2000 }] },
      ],
      weightOptions: [[500, 1000, 2000], [1000]],
      gauge: "teacher_choice",
      momentTable: "teacher_choice",
      promptChoices: [{ promptId: "balance" }, { promptId: "explain-balance" }],
      requirements: { measure: "balance_moments", explain: true },
    },
  ],
  review: { status: "draft", notes: "Hằng số mô hình là giả định kỹ thuật (lever-bench-reference-v1), không phải số liệu SGK." },
};
