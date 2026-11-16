/** Packaged FL-08 Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { THERMAL_ENGINE, THERMAL_KIT, type ThermalLabConfig } from "./contracts";

export const FL08_HEAT_TRANSFER_EXPLORE_CONFIG: ThermalLabConfig = {
  schema: "k4-thermal-config/1",
  labId: "heat-transfer",
  catalogId: "FL-08",
  configVersion: 1,
  kit: THERMAL_KIT,
  engine: THERMAL_ENGINE,
  title: "Sự truyền nhiệt",
  contextLabel: "Vật lý 8 · Khám phá sự truyền nhiệt",
  outcomeSummary: [
    "Quan sát và mô tả sự truyền năng lượng trong dẫn nhiệt, đối lưu và bức xạ nhiệt.",
    "So sánh vật dẫn nhiệt tốt và vật cách nhiệt tốt theo Bảng 28.1.",
  ],
  safetyBriefing: {
    simulation: ["Thời gian trong mô phỏng là minh hoạ; mô hình bỏ qua mất nhiệt ra môi trường."],
    realLab: [
      "Đèn cồn: tắt bằng cách đậy nắp, không thổi; không châm đèn cồn từ một đèn khác.",
      "Không chạm vào thanh kim loại, ống nghiệm và bóng đèn khi đang nóng; làm thí nghiệm khi có giáo viên giám sát.",
    ],
    acknowledgeRequired: false,
  },
  limitations: [
    "Thời điểm đinh rơi tính theo khả năng dẫn nhiệt ở Bảng 28.1 (t tỉ lệ với x²/K); con số giây chỉ để so sánh, không phải số đo thật.",
    "Bỏ qua mất nhiệt ra không khí ở thanh và ống nghiệm.",
    "Đối lưu theo quy tắc: sáp chảy khi đun ở dưới viên sáp, không mô phỏng nhiệt độ của nước.",
    "Nhiệt độ ban đầu, mức tăng tối đa và khả năng hấp thụ của bình là giả định kỹ thuật.",
  ],
  modes: { explore: true },
  stations: ["conduction", "convection", "radiation"],
  clock: { maxSeconds: 600, speeds: [1, 10, 30] },
  conduction: { rodLengthMm: 300, pinPositionsMm: [50, 100, 150, 200, 250], materials: ["copper", "aluminium", "steel", "glass", "wood"], maxRods: 3, timeConstant: 16 },
  convection: { tubes: [{ id: "1", wax: "bottom" }, { id: "2", wax: "top" }], meltSeconds: 40, dye: true },
  radiation: { startTenthsC: 250, riseTenthsC: 80, tauSeconds: 60, absorptance: { black: 100, silver: 25 } },
  enabledApparatus: [
    { id: "rack", kind: "rod_rack", slot: "bench", labelVi: "Giá ba thanh dẫn nhiệt" },
    { id: "lamp", kind: "spirit_lamp", slot: "bench", labelVi: "Đèn cồn" },
    { id: "tubes", kind: "test_tubes", slot: "stand", labelVi: "Hai ống nghiệm có sáp" },
    { id: "dye", kind: "dye_flask", slot: "stand", labelVi: "Bình nước và thuốc tím" },
    { id: "bulb", kind: "heat_lamp", slot: "bench", labelVi: "Đèn dây tóc" },
    { id: "flask", kind: "coated_flask", slot: "stand", labelVi: "Bình thuỷ tinh phủ màu" },
    { id: "screen", kind: "wood_screen", slot: "bench", labelVi: "Tấm gỗ dày" },
    { id: "thermometer", kind: "thermometer", slot: "flask", labelVi: "Nhiệt kế" },
    { id: "stopwatch", kind: "stopwatch", slot: "bench", labelVi: "Đồng hồ bấm giây" },
  ],
  measurements: ["stopwatch", "thermometer", "conductivity_table"],
  pedagogy: {
    observationPrompts: [
      { id: "pins", kind: "free_text", textVi: "Các đinh rơi theo thứ tự nào? Thanh nào làm đinh rơi sớm nhất, thanh nào không làm đinh nào rơi? Giải thích bằng Bảng 28.1." },
      { id: "pan", kind: "free_text", textVi: "Tại sao chảo được làm bằng kim loại còn cán chảo được làm bằng gỗ hoặc nhựa?" },
      { id: "tubes", kind: "free_text", textVi: "Vì sao viên sáp ở miệng ống (2) chảy còn viên sáp ở đáy ống (1) thì không?", challenge: true },
      { id: "screen", kind: "free_text", textVi: "Vì sao nhiệt độ trong bình tăng khi đèn chiếu tới và giảm khi đặt tấm gỗ? Có phải dẫn nhiệt hay đối lưu không?" },
    ],
  },
  review: { status: "draft", notes: "Bảng 28.1 lấy từ SGK; thang thời gian và hằng số bức xạ là giả định kỹ thuật, chờ reviewer Lý." },
};
