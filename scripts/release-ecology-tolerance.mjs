// FL-20 ecology-tolerance release through the admin API only (no direct database access).
// Precondition: migration 20261102090000_fl20_ecology_tolerance_lab is applied to the target
// database by the normal deploy, so the Lab and its challenge exist.
//
// Env:
//   NEXALAB_API              API base, e.g. http://127.0.0.1:4000/api
//   NEXALAB_ADMIN_EMAIL      the owner's ADMIN account
//   NEXALAB_ADMIN_PASSWORD
//   FL20_LESSON_ID           published shared-library lesson to bind (default: KHTN 8 Bài 41)
//   FL20_PUBLISH=true        sign OWNER_SIGNOFF with the evidence below and publish; without it the
//                            script stops after the release draft and prints what would be signed.
//
// Every step is idempotent: re-running reuses the same activity, configuration, pack and draft.

const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";
const email = process.env.NEXALAB_ADMIN_EMAIL;
const password = process.env.NEXALAB_ADMIN_PASSWORD;
const lessonId = process.env.FL20_LESSON_ID ?? "pack-structured-03b2dcaf5fd4851dbd229b2d01c7d14ac8c1544c-v1";
const publish = process.env.FL20_PUBLISH === "true";
if (!email || !password) throw new Error("Set NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD.");

const LAB = "ecology-tolerance";
const CHALLENGE = "eco_001";
const MODEL = "ecology-tolerance@1.0.0";
// One topic per release: B42-O02 (population traits) belongs to topic KHTN8-L42, so it cannot
// join this KHTN8-L41 release; the population checkpoints remain supporting practice here.
const OUTCOME = "KHTN8-B41-O03";

const water = (valueDeciC) => ({ setup: "tolerance", speciesId: "ca-ro-phi", factor: "TEMPERATURE", valueDeciC });
const sweep = { setup: "tolerance-sweep", speciesId: "ca-ro-phi", factor: "TEMPERATURE" };
const comparison = { setup: "import-comparison", siteId: "site-demo", factor: "TEMPERATURE" };
const density = (populationId) => ({ setup: "density", populationId });
const age = (sampleId) => ({ setup: "age-structure", sampleId });

const activity = {
  key: "ecology-tolerance-checkpoints",
  outcomeCodes: [OUTCOME],
  objective: "Dự đoán, quan sát và giải thích sự tồn tại của cá rô phi trong và ngoài giới hạn sinh thái về nhiệt độ; vận dụng giới hạn sinh thái để chọn loài phù hợp; tính mật độ cá thể và phân loại tháp tuổi của quần thể.",
  materials: ["Ao nuôi cá rô phi mô phỏng", "Nhiệt kế đo nhiệt độ nước", "Đồ thị giới hạn sinh thái", "Bảng số liệu quần thể (SGK KHTN 8, Bảng 42.1)", "Tháp tuổi của quần thể mẫu"],
  setup: "Ao cá cắt ngang có nhiệt kế; thanh trượt điều chỉnh nhiệt độ nước từ 0 °C đến 50 °C; đồ thị giới hạn sinh thái; sa bàn quần thể bắp cải và tháp tuổi.",
  procedure: [
    "Dự đoán, rồi quan sát cá rô phi khi nước ở 30,0 °C.",
    "Dự đoán, rồi quan sát cá rô phi khi nước ở 44,0 °C.",
    "Kéo nhiệt độ qua cả phía lạnh và phía nóng, rồi đọc giới hạn sinh thái về nhiệt độ của cá rô phi.",
    "So sánh giới hạn sinh thái của ba loài cá với nhiệt độ nước ở địa phương và chọn loài phù hợp.",
    "Tính mật độ cá thể của quần thể bắp cải từ số lượng cá thể và diện tích.",
    "Phân loại tháp tuổi của một quần thể mẫu.",
    "Chọn lời giải thích vì sao không nuôi được cá rô phi ngoài trời quanh năm ở nơi nước xuống dưới 5,6 °C.",
  ],
  variables: [
    { name: "nhiệt độ nước", unit: "°C", role: "independent" },
    { name: "khả năng tồn tại của cá rô phi", unit: "trạng thái", role: "dependent" },
    { name: "các nhân tố sinh thái khác", unit: "trạng thái", role: "controlled" },
  ],
  observations: [
    "Ở 30,0 °C cá rô phi bơi bình thường.",
    "Ở 44,0 °C cá rô phi không tồn tại được.",
    "Cá rô phi chỉ tồn tại được trong khoảng 5,6 °C đến 42 °C.",
    "Chỉ cá B chịu được toàn bộ khoảng nhiệt độ nước của địa phương.",
    "Mật độ bắp cải là 3 000 : 750 = 4 cây/m².",
    "Tháp P3 có nhóm trước sinh sản ít hơn hẳn nhóm sinh sản.",
  ],
  expectedResult: "Mỗi loài chỉ tồn tại được trong một khoảng giá trị xác định của nhân tố sinh thái (giới hạn sinh thái); với nhiệt độ, cá rô phi tồn tại được từ 5,6 °C đến 42 °C.",
  explanation: "Giới hạn sinh thái là khoảng giá trị của một nhân tố sinh thái mà trong khoảng đó sinh vật có thể tồn tại và phát triển ổn định theo thời gian. Ngoài khoảng 5,6 °C đến 42 °C, cá rô phi không tồn tại được, nên nơi có nước dưới 5,6 °C không nuôi được cá rô phi ngoài trời quanh năm.",
  safety: "Mô phỏng trên trình duyệt, không có động vật thật, thiết bị điện hay hoá chất; hình ảnh không mô tả sinh vật chết.",
  limitations: "Mô hình đơn giản: chỉ thay đổi một nhân tố (nhiệt độ), các nhân tố khác coi như thuận lợi. Cá A, B, C, khoảng nhiệt độ ở địa phương và các tháp tuổi là số liệu minh hoạ; đường cong trên đồ thị chỉ là hình minh hoạ.",
  modality: "deterministic-simulation",
  sources: [
    { title: "SGK Khoa học tự nhiên 8, Bài 41 Môi trường và các nhân tố sinh thái (ví dụ cá rô phi 5,6 °C đến 42 °C)", license: "OFFICIAL_CURRICULUM" },
    { title: "SGK Khoa học tự nhiên 8, Bài 42 Quần thể sinh vật (Bảng 42.1)", license: "OFFICIAL_CURRICULUM" },
    { title: "NexaLab FL-20 lab definition (spec-fl-20-ecological-tolerance/lab-definition.md)", license: "ORIGINAL" },
  ],
  reviews: { ownerSignoffPending: true },
};

const config = {
  challengeParams: { [CHALLENGE]: {} },
  goldenCases: [
    { challengeId: CHALLENGE, label: "Nước 30,0 °C", labState: water(300), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Nước 44,0 °C", labState: water(440), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Quét giới hạn sinh thái", labState: sweep, expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "So sánh ba loài cá", labState: comparison, expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Mật độ bắp cải", labState: density("bap-cai"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Tháp tuổi P3", labState: age("P3"), expectedVerdict: "passed" },
  ],
  reason: "FL-20 ecology-tolerance: cấu hình đầu tiên (không có tham số).",
};

const pack = (activityVersionId) => ({
  key: "ecology-tolerance-k8",
  labId: LAB,
  modelRef: MODEL,
  activityVersionId,
  template: {
    units: {},
    ranges: {},
    initialState: water(300),
    limitations: activity.limitations,
    goldenCases: [
      { label: "30,0 °C: trong giới hạn", state: water(300), expectedVerdict: "passed", expectedOutputs: { zone: "WITHIN" } },
      { label: "44,0 °C: trên giới hạn", state: water(440), expectedVerdict: "passed", expectedOutputs: { zone: "ABOVE_MAX" } },
      { label: "4,0 °C: dưới giới hạn", state: water(40), expectedVerdict: "passed", expectedOutputs: { zone: "BELOW_MIN" } },
      { label: "Quét: bề rộng 36,4 °C", state: sweep, expectedVerdict: "passed", expectedOutputs: { widthDeciC: 364 } },
      { label: "Mật độ lim xanh", state: density("lim-xanh"), expectedVerdict: "passed", expectedOutputs: { count: 11250, amount: 15, unit: "ha" } },
      { label: "Tháp tuổi P1", state: age("P1"), expectedVerdict: "passed", expectedOutputs: { pyramid: "GROWING" } },
      { label: "Tháp tuổi P3", state: age("P3"), expectedVerdict: "passed", expectedOutputs: { pyramid: "DECLINING" } },
    ],
  },
  visualAssetVersionId: null,
  semanticMap: { pond: "pond", thermometer: "thermometer", "tolerance-graph": "tolerance-graph", "population-plot": "population-plot", "age-pyramid": "age-pyramid" },
  bindings: [],
  challengeTemplates: [],
  reviews: { ownerSignoffPending: true },
  reason: "FL-20 ecology-tolerance: gói mô phỏng K8 (2D SVG, không tệp GLB).",
});

const evidence = {
  curriculumMapping: `Hoạt động ecology-tolerance-checkpoints gắn yêu cầu cần đạt ${OUTCOME} (chủ đề KHTN8-L41) và bài "Môi trường và các nhân tố sinh thái". Phần mật độ và tháp tuổi (Bài 42, KHTN8-B42-O02) là luyện tập bổ trợ, không gắn outcome trong release này vì mỗi release chỉ thuộc một chủ đề.`,
  sourceReferences: [
    "SGK KHTN 8 Bài 41, block sgk-khtn8-nxbgd-2026-p0174-b0009 (cá rô phi 5,6 °C đến 42 °C)",
    "SGK KHTN 8 Bài 42, Bảng 42.1, block sgk-khtn8-nxbgd-2026-p0177-b0008",
    "BE _bmad-output/specs/spec-fl-20-ecological-tolerance/lab-definition.md (model, rubric, golden cases)",
  ],
  scientificGoldenCases: "26 ca mẫu EC-01…EC-11/X của ecology-tolerance@1.0.0 trong packages/sim/ecology-tolerance.test.ts; 6 ca cấu hình và 7 ca của gói được máy chủ chạy lại khi tạo phiên bản.",
  rubric: "ecology-tolerance-checkpoints@1.0.0: 6 câu (30 °C, 44 °C, đọc giới hạn, chọn loài, mật độ, tháp tuổi) và 1 câu giải thích; đạt khi 7/7 (D-6). Máy chủ chấm lại toàn bộ.",
  safetyAssessment: "Mô phỏng 2D trên trình duyệt, không có động vật thật, điện hay hoá chất; không hiển thị sinh vật chết; hỗ trợ bàn phím và giảm chuyển động.",
  rightsAssessment: "Hình SVG do NexaLab tự vẽ; không dùng ảnh, tệp GLB hay phông chữ bên ngoài; số liệu cá A, B, C và tháp tuổi là số liệu minh hoạ tự soạn, có ghi nhãn.",
};

let token;
async function call(path, method = "GET", body) {
  const response = await fetch(api + path, {
    method,
    headers: { "content-type": "application/json", ...(token ? { authorization: "Bearer " + token } : {}) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const data = await response.json().catch(() => null);
  if (response.status >= 400) throw new Error(`${method} ${path} → ${response.status} ${JSON.stringify(data)}`);
  return data;
}

token = (await call("/auth/admin/login", "POST", { email, password })).accessToken;
if (!token) throw new Error("Admin login returned no access token.");

const practical = await call("/admin/practicals", "POST", activity);
console.log(`activity ${practical.key} v${practical.version}${practical.unchanged ? " (unchanged)" : ""}`);

const versions = await call(`/admin/labs/${LAB}/versions`);
const activeConfig = versions.versions.find((version) => version.status === "active");
if (activeConfig) console.log(`configuration v${activeConfig.version} already active`);
else {
  const created = await call(`/admin/labs/${LAB}/versions`, "POST", config);
  await call(`/admin/labs/${LAB}/versions/${created.version}/activate`, "POST", { reason: "FL-20: kích hoạt cấu hình đầu tiên." });
  console.log(`configuration v${created.version} created and activated`);
}

const packs = await call(`/admin/labs/${LAB}/packs`);
const activePack = packs.packs.find((candidate) => candidate.status === "active" && candidate.activityVersionId === practical.id);
if (activePack) console.log(`pack ${activePack.key} v${activePack.version} already active`);
else {
  const created = await call("/admin/sim-packs", "POST", pack(practical.id));
  await call(`/admin/sim-packs/${created.id}/activate`, "POST", { reason: "FL-20: kích hoạt gói mô phỏng K8." });
  console.log(`pack ${created.key} v${created.version} created and activated`);
}

const draft = await call(`/admin/labs/${LAB}/releases`, "POST", { reason: "FL-20 ecology-tolerance: release đầu tiên sau khi owner duyệt.", lessonId });
console.log(`release v${draft.version} ${draft.status} digest ${draft.digest}${draft.unchanged ? " (unchanged)" : ""}`);

if (draft.status === "ACTIVE") console.log("Release is already active.");
else if (!publish) {
  console.log("\nNot published. OWNER_SIGNOFF evidence that FL20_PUBLISH=true will sign on this digest:");
  console.log(JSON.stringify(evidence, null, 2));
} else {
  const published = await call(`/admin/labs/${LAB}/releases/${draft.id}/publish`, "POST", {
    reason: "FL-20 ecology-tolerance: owner đã duyệt, publish release đầu tiên.",
    releaseDigest: draft.digest,
    evidence,
  });
  console.log(`release v${published.version ?? draft.version} ${published.status ?? "published"}`);
}
