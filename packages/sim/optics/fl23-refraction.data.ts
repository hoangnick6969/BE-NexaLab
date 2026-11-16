/** Packaged FL-23 Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { LIGHT_SPEED_KM_S, OPTICS_KIT, REFRACTION_ENGINE, type RefractionLabConfig } from "./contracts";

export const FL23_REFRACTION_EXPLORE_CONFIG: RefractionLabConfig = {
  schema: "k6-optics-config/1",
  labId: "light-refraction",
  catalogId: "FL-23",
  configVersion: 1,
  kit: OPTICS_KIT,
  engine: REFRACTION_ENGINE,
  title: "Khúc xạ ánh sáng và phản xạ toàn phần",
  contextLabel: "Vật lý 9 · Khám phá khúc xạ ánh sáng",
  outcomeSummary: [
    "Thực hiện thí nghiệm để rút ra và phát biểu được định luật khúc xạ ánh sáng.",
    "Nêu được chiết suất bằng tỉ số tốc độ ánh sáng trong không khí với tốc độ ánh sáng trong môi trường.",
    "Rút ra điều kiện xảy ra phản xạ toàn phần và xác định được góc tới hạn.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình tia sáng lý tưởng: một màu, tia luôn đi qua tâm khối bán trụ, bỏ qua ánh sáng bị hấp thụ."],
    realLab: ["Không nhìn thẳng vào tia laser và không chiếu tia laser vào mắt người khác.", "Đặt khối thuỷ tinh nhẹ tay, khối có cạnh sắc khi bị mẻ."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Chiết suất của không khí lấy bằng 1, như chân không.",
    "Ánh sáng một màu: chiết suất không đổi theo màu, chưa có tán sắc.",
    "Tia sáng luôn tới đúng tâm mặt phẳng của khối bán trụ nên đi qua mặt cong không bị lệch.",
    "Độ sáng của tia khúc xạ và tia phản xạ chỉ để minh hoạ, không phải số đo.",
  ],
  modes: { explore: true },
  lightSpeedKmS: LIGHT_SPEED_KM_S,
  media: [
    { id: "glass", labelVi: "Thuỷ tinh", indexMilli: 1500 },
    { id: "water", labelVi: "Nước", indexMilli: 1333 },
  ],
  stations: ["into-block", "out-of-block"],
  intoBlock: { maxIncidenceDeg: 80, maxReadings: 6 },
  outOfBlock: { maxIncidenceDeg: 89, criticalToleranceDeg: 1 },
  display: { sineColumns: false },
  enabledApparatus: [
    { id: "laser", kind: "light_source", slot: "disk", labelVi: "Đèn laser" },
    { id: "disk", kind: "protractor_disk", slot: "bench", labelVi: "Đĩa chia độ" },
    { id: "block", kind: "half_cylinder", slot: "disk", labelVi: "Khối bán trụ" },
    { id: "table", kind: "measurement_table", slot: "panel", labelVi: "Bảng đo góc" },
    { id: "speed", kind: "speed_card", slot: "panel", labelVi: "Thẻ tốc độ ánh sáng" },
  ],
  measurements: ["protractor", "critical_angle"],
  pedagogy: {
    observationPrompts: [
      { id: "law", kind: "free_text", textVi: "Khi tăng góc tới, góc khúc xạ thay đổi thế nào? Tính sin i / sin r ở các lần đo và nhận xét." },
      { id: "media", kind: "free_text", textVi: "Cùng một góc tới, tia sáng bị lệch nhiều hơn khi đi vào thuỷ tinh hay vào nước? Liên hệ với chiết suất và tốc độ ánh sáng.", challenge: true },
      { id: "total", kind: "free_text", textVi: "Ánh sáng đi từ khối ra không khí: tăng dần góc tới, tia khúc xạ thay đổi thế nào? Góc tới hạn của khối bằng bao nhiêu?" },
      { id: "condition", kind: "free_text", textVi: "Vì sao khi ánh sáng đi từ không khí vào khối thì không bao giờ xảy ra phản xạ toàn phần?", challenge: true },
    ],
  },
  review: { status: "reviewed", notes: "Owner duyệt dữ liệu và cho phát hành 2026-11-16 (Q-1 đến Q-7): chiết suất nước 1,333, thuỷ tinh 1,500, không khí 1; bố trí đĩa chia độ và khối bán trụ chưa đối chiếu SGK KHTN 9." },
};
