/** Packaged FL-04 Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { FLUID_ENGINE, FLUID_KIT, WATER_WEIGHT_DENSITY_N_PER_M3, type FluidLabConfig } from "./contracts";

export const FL04_PRESSURE_EXPLORE_CONFIG: FluidLabConfig = {
  schema: "k3-fluid-config/1",
  labId: "liquid-pressure",
  catalogId: "FL-04",
  configVersion: 1,
  kit: FLUID_KIT,
  engine: FLUID_ENGINE,
  title: "Áp suất chất lỏng",
  contextLabel: "Vật lý 8 · Khám phá áp suất chất lỏng",
  outcomeSummary: [
    "Khảo sát tác dụng của chất lỏng lên vật đặt trong chất lỏng.",
    "Nhận biết áp suất tác dụng vào chất lỏng được chất lỏng truyền đi nguyên vẹn theo mọi hướng.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình lý tưởng: màng cao su và pit-tông không có khối lượng, không ma sát."],
    realLab: ["Lau khô nước tràn trên bàn để tránh trơn ngã; đặt quả nặng nhẹ tay lên đĩa."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Chỉ tính áp suất do cột nước gây ra, không cộng áp suất khí quyển.",
    "Màng cao su lý tưởng: độ lõm chỉ cho biết mức áp suất, không phải số đo thật.",
    "Pit-tông không có khối lượng và không ma sát; mô hình chỉ cho biết pit-tông nào đi xuống.",
    "Trọng lượng riêng của nước lấy bằng 10 000 N/m³.",
  ],
  modes: { explore: true },
  liquid: { id: "water", weightDensityNPerM3: WATER_WEIGHT_DENSITY_N_PER_M3 },
  stations: ["depth-probe", "pistons"],
  depthProbe: { tankHeightMm: 300, waterLevelMm: 280, maxDepthMm: 250, depthStepMm: 10, sideHoleOffsetMm: 30, positionsMm: [-100, -50, 0, 50, 100] },
  pistons: { areasMm2: [2000, 1000], weightMilliNewtons: 1000, weightCount: 12, maxPerPan: 6 },
  display: { pressureReading: false, deformationLevels: 5 },
  enabledApparatus: [
    { id: "tank", kind: "tall_tank", slot: "bench", labelVi: "Bể nước trong suốt" },
    { id: "probe", kind: "membrane_probe", slot: "tank", labelVi: "Bình trụ có màng cao su" },
    { id: "pistons", kind: "piston_pair", slot: "bench", labelVi: "Hai xi lanh thông nhau" },
    { id: "weights", kind: "weight_set", slot: "tray", labelVi: "Bộ quả nặng 1 N" },
  ],
  measurements: ["depth_ruler"],
  pedagogy: {
    observationPrompts: [
      { id: "membranes", kind: "free_text", textVi: "Các màng cao su biến dạng thế nào khi nhúng bình trụ vào nước? Điều đó chứng tỏ gì?" },
      { id: "depth", kind: "free_text", textVi: "Giữ nguyên độ sâu và dời bình sang vị trí khác, rồi nhúng sâu hơn. Tác dụng của chất lỏng thay đổi thế nào?", challenge: true },
      { id: "pascal", kind: "free_text", textVi: "Từ kết quả với hai pit-tông, rút ra kết luận về sự truyền áp suất tác dụng vào chất lỏng theo mọi hướng." },
    ],
  },
  review: { status: "draft", notes: "Hằng số mô hình là giả định kỹ thuật (d = 10 000 N/m³, mức biến dạng 0–5), chờ reviewer Lý." },
};
