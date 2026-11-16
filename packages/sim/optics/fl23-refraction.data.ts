/** Packaged FL-23 Explore config: the dev route and the publish script's input. Students run the pinned copy. Version 2 adds the prism station (spec §13). */
import { LIGHT_SPEED_KM_S, OPTICS_KIT, REFRACTION_ENGINE, type RefractionLabConfig } from "./contracts";

export const FL23_REFRACTION_EXPLORE_CONFIG: RefractionLabConfig = {
  schema: "k6-optics-config/1",
  labId: "light-refraction",
  catalogId: "FL-23",
  configVersion: 2,
  kit: OPTICS_KIT,
  engine: REFRACTION_ENGINE,
  title: "Khúc xạ ánh sáng, phản xạ toàn phần và lăng kính",
  contextLabel: "Vật lý 9 · Khám phá khúc xạ ánh sáng",
  outcomeSummary: [
    "Thực hiện thí nghiệm để rút ra và phát biểu được định luật khúc xạ ánh sáng.",
    "Nêu được chiết suất bằng tỉ số tốc độ ánh sáng trong không khí với tốc độ ánh sáng trong môi trường.",
    "Rút ra điều kiện xảy ra phản xạ toàn phần và xác định được góc tới hạn.",
    "Vẽ được đường truyền của tia sáng qua lăng kính; giải thích định tính sự tán sắc ánh sáng trắng.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình tia sáng lý tưởng: tia luôn đi qua tâm khối bán trụ, bỏ qua ánh sáng bị hấp thụ; màu sắc ở trạm lăng kính chỉ để minh hoạ."],
    realLab: ["Không nhìn thẳng vào tia laser và không chiếu tia laser vào mắt người khác.", "Đặt khối thuỷ tinh nhẹ tay, khối có cạnh sắc khi bị mẻ."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Chiết suất của không khí lấy bằng 1, như chân không.",
    "Trạm 1 và 2 dùng ánh sáng một màu (laser); tán sắc chỉ có ở trạm lăng kính khi bật ánh sáng trắng.",
    "Tia sáng luôn tới đúng tâm mặt phẳng của khối bán trụ nên đi qua mặt cong không bị lệch.",
    "Độ sáng của tia khúc xạ và tia phản xạ chỉ để minh hoạ, không phải số đo.",
    "Chiết suất của thuỷ tinh theo từng màu chỉ là giá trị minh hoạ để vẽ dải màu, không phải số đo.",
  ],
  modes: { explore: true },
  lightSpeedKmS: LIGHT_SPEED_KM_S,
  media: [
    { id: "glass", labelVi: "Thuỷ tinh", indexMilli: 1500 },
    { id: "water", labelVi: "Nước", indexMilli: 1333 },
  ],
  stations: ["into-block", "out-of-block", "prism"],
  intoBlock: { maxIncidenceDeg: 80, maxReadings: 6 },
  outOfBlock: { maxIncidenceDeg: 89, criticalToleranceDeg: 1 },
  prism: {
    apexDeg: 60,
    mediumId: "glass",
    minIncidenceDeg: 35,
    maxIncidenceDeg: 80,
    whiteLight: true,
    // Illustrative crown-glass indices (Q-11), red to violet.
    spectrum: [
      { id: "red", labelVi: "Đỏ", indexMilli: 1513 },
      { id: "orange", labelVi: "Cam", indexMilli: 1517 },
      { id: "yellow", labelVi: "Vàng", indexMilli: 1519 },
      { id: "green", labelVi: "Lục", indexMilli: 1523 },
      { id: "blue", labelVi: "Lam", indexMilli: 1528 },
      { id: "indigo", labelVi: "Chàm", indexMilli: 1532 },
      { id: "violet", labelVi: "Tím", indexMilli: 1538 },
    ],
  },
  display: { sineColumns: false },
  enabledApparatus: [
    { id: "laser", kind: "light_source", slot: "disk", labelVi: "Đèn laser" },
    { id: "disk", kind: "protractor_disk", slot: "bench", labelVi: "Đĩa chia độ" },
    { id: "block", kind: "half_cylinder", slot: "disk", labelVi: "Khối bán trụ" },
    { id: "table", kind: "measurement_table", slot: "panel", labelVi: "Bảng đo góc" },
    { id: "speed", kind: "speed_card", slot: "panel", labelVi: "Thẻ tốc độ ánh sáng" },
    { id: "prism", kind: "prism", slot: "disk", labelVi: "Lăng kính" },
    { id: "screen", kind: "screen", slot: "bench", labelVi: "Màn hứng" },
  ],
  measurements: ["protractor", "critical_angle", "deviation"],
  pedagogy: {
    observationPrompts: [
      { id: "law", kind: "free_text", textVi: "Khi tăng góc tới, góc khúc xạ thay đổi thế nào? Tính sin i / sin r ở các lần đo và nhận xét." },
      { id: "media", kind: "free_text", textVi: "Cùng một góc tới, tia sáng bị lệch nhiều hơn khi đi vào thuỷ tinh hay vào nước? Liên hệ với chiết suất và tốc độ ánh sáng.", challenge: true },
      { id: "total", kind: "free_text", textVi: "Ánh sáng đi từ khối ra không khí: tăng dần góc tới, tia khúc xạ thay đổi thế nào? Góc tới hạn của khối bằng bao nhiêu?" },
      { id: "condition", kind: "free_text", textVi: "Vì sao khi ánh sáng đi từ không khí vào khối thì không bao giờ xảy ra phản xạ toàn phần?", challenge: true },
      { id: "prism", kind: "free_text", textVi: "Vẽ đường truyền của tia sáng qua lăng kính. Tia ló lệch về phía nào so với tia tới?" },
      { id: "spectrum", kind: "free_text", textVi: "Chiếu ánh sáng trắng qua lăng kính: trên màn có những màu nào, theo thứ tự nào? Màu nào bị lệch nhiều nhất? Vì sao?", challenge: true },
    ],
  },
  review: { status: "reviewed", notes: "Owner duyệt 2026-11-16 (Q-1 đến Q-13): chiết suất nước 1,333, thuỷ tinh 1,500, không khí 1; lăng kính đều 60°; chiết suất theo màu là minh hoạ; bố trí thí nghiệm chưa đối chiếu SGK KHTN 9." },
};
