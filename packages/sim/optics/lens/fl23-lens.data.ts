/** Packaged FL-23 thin lens Explore config: the dev route and the publish script's input. Students run the pinned copy. */
import { LENS_ENGINE, LENS_KIT, type LensLabConfig } from "./contracts";

export const FL23_LENS_EXPLORE_CONFIG: LensLabConfig = {
  schema: "k6-lens-config/1",
  labId: "thin-lens",
  catalogId: "FL-23",
  configVersion: 1,
  kit: LENS_KIT,
  engine: LENS_ENGINE,
  title: "Thấu kính và kính lúp",
  contextLabel: "Vật lý 9 · Khám phá thấu kính",
  outcomeSummary: [
    "Nêu được quang tâm, trục chính, tiêu điểm chính và tiêu cự của thấu kính.",
    "Vẽ được ảnh qua thấu kính; vẽ sơ đồ tỉ lệ để giải bài tập đơn giản về thấu kính hội tụ.",
    "Đo được tiêu cự của thấu kính hội tụ.",
    "Mô tả cấu tạo và sử dụng được kính lúp.",
  ],
  safetyBriefing: {
    simulation: ["Đây là mô hình thấu kính mỏng: tia sáng gần trục chính, bỏ qua quang sai và độ dày thấu kính."],
    realLab: ["Không dùng thấu kính hội tụ hội tụ ánh sáng Mặt Trời vào da, mắt hay giấy dễ cháy.", "Cầm thấu kính ở vành, tránh làm xước mặt kính."],
    acknowledgeRequired: false,
  },
  limitations: [
    "Thấu kính mỏng, tia sáng gần trục chính; bỏ qua quang sai.",
    "Khoảng cách tính bằng mm; vật sáng cao 20 mm.",
    "Độ nhoè của ảnh trên màn chỉ để minh hoạ.",
    "Số bội giác của kính lúp lấy theo quy ước G = 25/f (f tính bằng cm).",
  ],
  modes: { explore: true },
  lenses: [
    { id: "converging-100", labelVi: "Thấu kính hội tụ f = 100 mm", focalMm: 100 },
    { id: "converging-150", labelVi: "Thấu kính hội tụ f = 150 mm", focalMm: 150 },
    { id: "diverging-100", labelVi: "Thấu kính phân kì f = 100 mm", focalMm: -100 },
    { id: "loupe-50", labelVi: "Kính lúp f = 50 mm", focalMm: 50 },
  ],
  stations: ["rays", "image", "focal", "magnifier"],
  rays: { lensIds: ["converging-100", "diverging-100"] },
  image: { lensIds: ["converging-100", "converging-150", "diverging-100"], minDistanceMm: 20, maxDistanceMm: 400, stepMm: 10, objectHeightMm: 20, toleranceMm: 5 },
  focal: { lensIds: ["converging-100", "converging-150"], minDistanceMm: 50, maxDistanceMm: 400, stepMm: 10, toleranceMm: 5 },
  magnifier: { lensIds: ["loupe-50", "converging-100"], minDistanceMm: 10, maxDistanceMm: 150, stepMm: 5 },
  display: { lensFormula: false },
  enabledApparatus: [
    { id: "bench", kind: "optical_bench", slot: "bench", labelVi: "Giá quang học có thước" },
    { id: "lens", kind: "lens", slot: "bench", labelVi: "Thấu kính" },
    { id: "lamp", kind: "object_lamp", slot: "bench", labelVi: "Vật sáng (đèn chữ F)" },
    { id: "screen", kind: "screen", slot: "bench", labelVi: "Màn hứng ảnh" },
    { id: "loupe", kind: "magnifier", slot: "tray", labelVi: "Kính lúp" },
    { id: "grid", kind: "grid", slot: "board", labelVi: "Lưới tỉ lệ" },
  ],
  measurements: ["ruler", "scale_grid", "focal_length"],
  pedagogy: {
    observationPrompts: [
      { id: "rays", kind: "free_text", textVi: "Tia sáng song song với trục chính, tia qua quang tâm và tia qua tiêu điểm ló ra khỏi thấu kính hội tụ như thế nào?" },
      { id: "image", kind: "free_text", textVi: "Dịch vật lại gần thấu kính hội tụ: ảnh thay đổi thế nào? Khi nào ảnh thật, khi nào ảnh ảo?" },
      { id: "diverging", kind: "free_text", textVi: "Ảnh của vật qua thấu kính phân kì có đặc điểm gì? Có khi nào hứng được trên màn không?", challenge: true },
      { id: "focal", kind: "free_text", textVi: "Ghi khoảng cách vật – màn khi ảnh rõ nét và bằng vật. Tính tiêu cự của thấu kính." },
      { id: "loupe", kind: "free_text", textVi: "Phải đặt vật ở đâu so với kính lúp để nhìn thấy ảnh lớn hơn vật? Ảnh đó là ảnh gì?", challenge: true },
    ],
  },
  review: { status: "reviewed", notes: "Owner duyệt 2026-11-16 (Q-1 đến Q-8): bộ thấu kính 100, 150, −100 mm, kính lúp 50 mm; chỉ dựng hình (CAT-5); đo tiêu cự bằng vật và màn đối xứng; chưa đối chiếu SGK KHTN 9." },
};
