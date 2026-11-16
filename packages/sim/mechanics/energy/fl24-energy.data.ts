/** Packaged FL-24 Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { ENERGY_ENGINE, ENERGY_KIT, WEIGHT_MILLINEWTONS_PER_GRAM, type EnergyLabConfig } from "./contracts";

export const FL24_ENERGY_EXPLORE_CONFIG: EnergyLabConfig = {
  schema: "k5-energy-config/1",
  labId: "mechanical-energy",
  catalogId: "FL-24",
  configVersion: 1,
  kit: ENERGY_KIT,
  engine: ENERGY_ENGINE,
  title: "Cơ năng, công và công suất",
  contextLabel: "Vật lý 9 · Khám phá năng lượng cơ học",
  outcomeSummary: [
    "Viết được biểu thức động năng, thế năng gần mặt đất; cơ năng là tổng động năng và thế năng.",
    "Phân tích chuyển hoá giữa động năng và thế năng khi con lắc dao động.",
    "Tính được công A = F·s và công suất P = A/t trong trường hợp đơn giản.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình lý tưởng: không có ma sát và lực cản không khí, nên cơ năng không đổi."],
    realLab: ["Không đứng dưới vật đang được kéo lên; giữ tay xa dây tời và quả nặng khi con lắc đang dao động."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Bỏ qua ma sát và lực cản không khí: cơ năng của con lắc được bảo toàn.",
    "Trọng lượng lấy bằng P = 10·m (m tính bằng kg, P tính bằng N).",
    "Tời kéo vật đều theo phương thẳng đứng; lực kéo bằng trọng lượng và cùng hướng dịch chuyển.",
    "Thế năng tính so với điểm thấp nhất của con lắc.",
  ],
  modes: { explore: true },
  weight: { milliNewtonsPerGram: WEIGHT_MILLINEWTONS_PER_GRAM },
  stations: ["pendulum", "hoist"],
  pendulum: { massesG: [100, 200, 300, 400, 500], lengthMm: 600, maxDropHeightMm: 300, heightStepMm: 10 },
  hoist: {
    massesG: [200, 500, 1000, 2000],
    minDistanceMm: 100,
    maxDistanceMm: 1000,
    distanceStepMm: 100,
    motors: [
      { id: "slow", labelVi: "Động cơ chậm", speedMmPerS: 125 },
      { id: "fast", labelVi: "Động cơ nhanh", speedMmPerS: 250 },
    ],
  },
  display: { energyReadings: false },
  enabledApparatus: [
    { id: "pendulum", kind: "pendulum", slot: "bench", labelVi: "Con lắc đơn" },
    { id: "bars", kind: "energy_bars", slot: "board", labelVi: "Thanh năng lượng" },
    { id: "hoist", kind: "hoist", slot: "bench", labelVi: "Tời kéo vật" },
    { id: "gauge", kind: "spring_gauge", slot: "hoist", labelVi: "Lực kế" },
    { id: "ruler", kind: "ruler", slot: "hoist", labelVi: "Thước đo độ cao" },
    { id: "clock", kind: "stopwatch", slot: "tray", labelVi: "Đồng hồ bấm giây" },
  ],
  measurements: ["height_ruler", "force_gauge", "stopwatch"],
  pedagogy: {
    observationPrompts: [
      { id: "transform", kind: "free_text", textVi: "Khi con lắc đi từ điểm thả xuống điểm thấp nhất, động năng và thế năng thay đổi thế nào?" },
      { id: "conserve", kind: "free_text", textVi: "So sánh cơ năng ở các vị trí. Con lắc lên tới độ cao nào ở phía bên kia? Vì sao?", challenge: true },
      { id: "work", kind: "free_text", textVi: "Đọc lực kế, thước và đồng hồ rồi tính công và công suất của tời." },
      { id: "power", kind: "free_text", textVi: "Cùng vật và quãng đường, hai động cơ có thực hiện cùng một công không? Động cơ nào có công suất lớn hơn?", challenge: true },
    ],
  },
  review: { status: "reviewed", notes: "Owner duyệt dữ liệu và cho phát hành 2026-11-16 (Q-6 bỏ chờ): P = 10·m theo SGK KHTN 8, chưa đối chiếu SGK KHTN 9; tốc độ hai động cơ là giả định kỹ thuật." },
};
