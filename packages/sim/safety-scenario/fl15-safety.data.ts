import { SAFETY_SCENARIO_ENGINE, SAFETY_SCENARIO_KIT, type SafetyScenarioConfig, type SafetyScenarioItemRef } from "./contracts";

const copy = (vi: string, en: string) => ({ vi, en });
const apparatus = (id: string): SafetyScenarioItemRef => ({ kind: "apparatus", id });
const reagent = (id: string): SafetyScenarioItemRef => ({ kind: "reagent", id });
const copper = reagent("CuSO4_0_1M_CO0102");
const acid = reagent("H2SO4_0_05M_6793");

/** Owner-authorized review. See fl-15-safety-review-checklist.md for the source record. */
export const FL15_SAFETY_CONFIG = {
  schema: "k2-safety-scenario-config/1",
  labId: "lab-safety",
  catalogId: "FL-15",
  configVersion: 2,
  kit: SAFETY_SCENARIO_KIT,
  engine: SAFETY_SCENARIO_ENGINE,
  title: "An toàn phòng thí nghiệm",
  titleEn: "Laboratory safety",
  curriculumOutcomeCode: "KHTN8-B01-O01",
  outcomeSummary: ["Nhận biết dụng cụ, hoá chất và giải thích cách sử dụng hoá chất an toàn."],
  safetyBriefing: {
    simulation: ["Quan sát ba tình huống trên bàn ảo và đọc giải thích sau mỗi lựa chọn."],
    realLab: ["Thực hiện theo hướng dẫn của giáo viên và quy định phòng thí nghiệm của trường."],
    acknowledgeRequired: false,
  },
  limitations: ["Mô phỏng quyết định bằng bảng kịch bản. Không mô phỏng pha chế, nhiệt hay mức phơi nhiễm."],
  modes: { explore: true },
  enabledApparatus: [
    { id: "goggles", kind: "safety_goggles", slot: "bench", labelVi: "Kính bảo hộ" },
    { id: "gloves", kind: "protective_gloves", slot: "bench", labelVi: "Găng tay bảo hộ" },
    { id: "coat", kind: "lab_coat", slot: "bench", labelVi: "Áo choàng phòng thí nghiệm" },
    { id: "beaker", kind: "beaker_100ml", slot: "bench", labelVi: "Cốc thuỷ tinh" },
    { id: "tube", kind: "test_tube", slot: "bench", labelVi: "Ống nghiệm" },
    { id: "holder", kind: "test_tube_holder", slot: "bench", labelVi: "Kẹp ống nghiệm" },
    { id: "lamp", kind: "alcohol_lamp", slot: "bench", labelVi: "Đèn cồn" },
  ],
  measurements: [],
  pedagogy: {},
  review: { status: "reviewed", notes: "Owner uỷ quyền duyệt FL-15. Đối chiếu SGK và SDS mục 2: Scharlab CO0102 (H412), Carl Roth 6793 (H290). Xem fl-15-safety-review-checklist.md." },
  scenes: [
    {
      id: "read-label",
      title: copy("Nhận diện nguy hiểm", "Spot the hazard"),
      description: copy(
        "Trên bàn có hai chai dung dịch. Một chai có nhãn CuSO₄ 0,1 M. Nhãn chai còn lại đã bong.",
        "There are two solution bottles on the bench. One is labelled 0.1 M CuSO₄. The other has lost its label.",
      ),
      startStepId: "unlabelled",
      itemRefs: [copper, apparatus("goggles")],
      steps: [
        {
          id: "unlabelled",
          prompt: copy("Em sẽ làm gì với chai mất nhãn?", "What would you do with the unlabelled bottle?"),
          choices: [
            { id: "ask", label: copy("Để nguyên chai và báo giáo viên", "Leave it alone and tell the teacher"), consequenceId: "verified" },
            { id: "guess", label: copy("Đoán chất trong chai dựa vào màu dung dịch", "Identify it by the colour of the solution"), consequenceId: "unknown" },
          ],
        },
        {
          id: "warning",
          prompt: copy("Em tìm thông tin nguy hiểm của chai CuSO₄ ở đâu?", "Where would you look for hazard information about the CuSO₄ bottle?"),
          choices: [
            { id: "label", label: copy("Đọc nhãn và chú ý cảnh báo", "Read the label and check the warnings"), consequenceId: "read" },
            { id: "ignore", label: copy("Chỉ đọc tên chất", "Read only the chemical name"), consequenceId: "miss" },
          ],
        },
      ],
      consequences: [
        { id: "verified", explanation: copy("Chai mất nhãn cần được giáo viên xác minh trước khi sử dụng.", "The teacher needs to verify what is in the unlabelled bottle before it can be used."), hazardRefs: [], nextStepId: "warning" },
        { id: "unknown", explanation: copy("Màu sắc không đủ để xác định một dung dịch. Để nguyên chai và báo giáo viên.", "Colour alone cannot identify a solution. Leave the bottle alone and tell the teacher."), hazardRefs: [], nextStepId: "warning" },
        { id: "read", explanation: copy("Nhãn cho biết chất gì đang có trong chai và cảnh báo cần lưu ý.", "The label identifies the chemical and tells you which hazards to look out for."), hazardRefs: [copper], nextStepId: null },
        { id: "miss", explanation: copy("Khi chỉ đọc tên chất, em có thể bỏ sót thông tin nguy hiểm. Hãy kiểm tra cả phần cảnh báo trên nhãn.", "Reading the name alone can leave you unaware of a hazard. Check the warnings on the label as well."), hazardRefs: [copper], nextStepId: null },
      ],
    },
    {
      id: "dilution",
      title: copy("Chuẩn bị pha loãng axit", "Prepare for acid dilution"),
      description: copy(
        "Giáo viên chuẩn bị minh hoạ pha loãng một dung dịch axit. Trên bàn ảo có chai mẫu H₂SO₄ loãng đã dán nhãn và trang bị bảo hộ.",
        "The teacher is preparing to demonstrate acid dilution. A labelled sample of dilute H₂SO₄ and protective equipment are on the virtual bench.",
      ),
      startStepId: "prepare",
      itemRefs: [acid, apparatus("beaker"), apparatus("goggles"), apparatus("gloves"), apparatus("coat")],
      steps: [{
        id: "prepare",
        prompt: copy("Trước khi thao tác, nhóm em chuẩn bị thế nào?", "How would your group prepare before handling anything?"),
        choices: [
          { id: "check", label: copy("Đọc nhãn, chuẩn bị đồ bảo hộ và chờ giáo viên hướng dẫn", "Read the label, get the protective equipment ready and wait for the teacher"), consequenceId: "ready" },
          { id: "start", label: copy("Tự bắt đầu vì chai ghi dung dịch loãng", "Start on your own because the bottle says the solution is dilute"), consequenceId: "pause" },
        ],
      }],
      consequences: [
        { id: "ready", explanation: copy("Đọc cảnh báo giúp em biết điều cần hỏi giáo viên. Dùng kính, găng và áo bảo hộ phù hợp theo hướng dẫn trước khi thao tác.", "The warnings help you know what to check with your teacher. Follow their instructions about suitable goggles, gloves and a lab coat before handling the solution."), hazardRefs: [acid, apparatus("goggles"), apparatus("gloves"), apparatus("coat")], nextStepId: null },
        { id: "pause", explanation: copy("Chữ “loãng” vẫn cần được đọc cùng tên chất, nồng độ và cảnh báo. Hãy chờ giáo viên xác nhận đồ bảo hộ và cách thực hiện.", "Read “dilute” together with the chemical name, concentration and hazard warnings. Wait for the teacher to confirm the protective equipment and the procedure."), hazardRefs: [acid], nextStepId: null },
      ],
    },
    {
      id: "heat-tube",
      title: copy("Đun ống nghiệm", "Heat a test tube"),
      description: copy("Một nhóm sắp quan sát cách giáo viên đun ống nghiệm. Có người đứng ở một bên bàn.", "A group is about to watch the teacher heat a test tube. Someone is standing on one side of the bench."),
      startStepId: "point",
      itemRefs: [apparatus("tube"), apparatus("holder"), apparatus("lamp"), apparatus("goggles")],
      steps: [{
        id: "point",
        prompt: copy("Cách giữ và hướng miệng ống nào phù hợp khi đun?", "How should the tube be held and where should its opening point during heating?"),
        choices: [
          { id: "away", label: copy("Dùng kẹp, hướng miệng ống ra phía không có người", "Use a holder and point the opening away from people"), consequenceId: "clear" },
          { id: "toward", label: copy("Dùng kẹp, hướng miệng ống về phía bạn quan sát", "Use a holder and point the opening towards the observer"), consequenceId: "exposure" },
        ],
      }],
      consequences: [
        { id: "clear", explanation: copy("Kẹp giữ tay cách ống nóng. Hướng miệng ống ra xa người giúp tránh dung dịch bắn về phía họ.", "The holder keeps your hand away from the hot tube. Pointing the opening away from people reduces their risk of being splashed."), hazardRefs: [apparatus("tube"), apparatus("holder")], nextStepId: null },
        { id: "exposure", explanation: copy("Dung dịch nóng có thể bắn ra từ miệng ống. Hãy dùng kẹp và xoay miệng ống về phía không có người trước khi đun.", "Hot liquid can splash out of the opening. With the holder, point the opening away from people before heating."), hazardRefs: [apparatus("tube"), apparatus("holder")], nextStepId: null },
      ],
    },
  ],
} satisfies SafetyScenarioConfig;
