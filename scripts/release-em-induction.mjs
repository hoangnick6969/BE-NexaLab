// FL-25 em-induction release through the admin API only (no direct database access).
// Precondition: migration 20261031130000_fl25_em_induction_lab is applied to the target
// database by the normal deploy, so the Lab and its challenge exist.
//
// Env:
//   NEXALAB_API              API base, e.g. http://127.0.0.1:4000/api
//   NEXALAB_ADMIN_EMAIL      the owner's ADMIN account
//   NEXALAB_ADMIN_PASSWORD
//   FL25_LESSON_ID           published shared-library lesson to bind (default below)
//   FL25_PUBLISH=true        sign OWNER_SIGNOFF with the evidence below and publish; without it the
//                            script stops after the release draft and prints what would be signed.
//
// Every step is idempotent: re-running reuses the same activity, configuration, pack and draft.

const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";
const email = process.env.NEXALAB_ADMIN_EMAIL;
const password = process.env.NEXALAB_ADMIN_PASSWORD;
const lessonId = process.env.FL25_LESSON_ID ?? "pack-khtn9-l14-cam-ung-dien-tu-nguyen-tac-tao-ra-dong-dien-xo-v1";
const publish = process.env.FL25_PUBLISH === "true";
if (!email || !password) throw new Error("Set NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD.");

const LAB = "em-induction";
const CHALLENGE = "em_001";
const MODEL = "em-induction@1.0.0";
const OUTCOME = "KHTN-L9/dien-tu/1";

const coil = (magnetPosition, motion, extra = {}) => ({ setup: "magnet-coil", circuit: "CLOSED", poleFacingCoil: "N", magnetPosition, motion, ...extra });
const generator = (rotation) => ({ setup: "generator", circuit: "CLOSED", rotation, turns: 1 });

const activity = {
  key: "em-induction-checkpoints",
  outcomeCodes: [OUTCOME],
  objective: "Dự đoán, quan sát và giải thích điều kiện xuất hiện dòng điện cảm ứng trong cuộn dây kín và nguyên tắc tạo ra dòng điện xoay chiều.",
  materials: ["Cuộn dây đồng nối kín", "Nam châm thẳng trên ray trượt", "Điện kế có số 0 ở giữa", "Hai đèn LED mắc song song ngược chiều", "Máy phát điện quay tay mô hình"],
  setup: "Cuộn dây nối nối tiếp với điện kế và cặp đèn LED. Nam châm thẳng đặt trên ray, cực N hướng vào miệng cuộn dây. Máy phát quay tay đặt cạnh cuộn dây.",
  procedure: [
    "Dự đoán, rồi giữ yên nam châm ngay cạnh miệng cuộn dây và quan sát điện kế, đèn LED.",
    "Dự đoán, rồi đẩy cực N vào trong lòng cuộn dây và quan sát.",
    "Dự đoán, rồi kéo cực N ra khỏi cuộn dây và so sánh với lúc đẩy vào.",
    "Dự đoán, rồi quay máy phát đủ một vòng và quan sát chiều dòng điện.",
    "Chọn lời giải thích cho điều kiện xuất hiện dòng điện cảm ứng.",
  ],
  variables: [
    { name: "chuyển động của nam châm", unit: "trạng thái", role: "independent" },
    { name: "dòng điện cảm ứng", unit: "trạng thái", role: "dependent" },
    { name: "mạch kín", unit: "trạng thái", role: "controlled" },
  ],
  observations: [
    "Nam châm đứng yên: kim điện kế ở vạch 0, hai đèn tắt.",
    "Đẩy cực N vào: kim lệch một phía, một đèn sáng.",
    "Kéo cực N ra: kim lệch phía ngược lại, đèn kia sáng.",
    "Quay máy phát: kim lệch qua lại, hai đèn sáng luân phiên.",
  ],
  expectedResult: "Dòng điện cảm ứng chỉ xuất hiện khi số đường sức từ xuyên qua tiết diện cuộn dây kín biến thiên; khi nam châm của máy phát quay, dòng điện đổi chiều luân phiên (dòng điện xoay chiều).",
  explanation: "Khi số đường sức từ xuyên qua tiết diện cuộn dây dẫn kín biến thiên thì trong cuộn dây xuất hiện dòng điện cảm ứng. Đẩy vào và kéo ra làm số đường sức tăng hoặc giảm nên dòng điện ngược chiều nhau; quay nam châm làm số đường sức tăng giảm luân phiên nên dòng điện đổi chiều luân phiên.",
  safety: "Mô phỏng trên trình duyệt, không có thiết bị điện, hoá chất hay vật nặng thật. Nếu làm thí nghiệm thật, dùng nam châm và dụng cụ điện áp thấp theo hướng dẫn của giáo viên.",
  limitations: "Mô hình định tính: chỉ cho biết có hay không có dòng điện cảm ứng và chiều của nó; không tính độ lớn, tốc độ chuyển động hay số vòng dây. Đường sức từ, kim điện kế và đèn chỉ là hình minh hoạ.",
  modality: "deterministic-simulation",
  sources: [
    { title: "Chương trình giáo dục phổ thông 2018, môn Khoa học tự nhiên lớp 9, chủ đề Điện từ", license: "OFFICIAL_CURRICULUM" },
    { title: "NexaLab FL-25 lab definition (spec-fl-25-em-induction/lab-definition.md)", license: "ORIGINAL" },
  ],
  reviews: { ownerSignoffPending: true },
};

const config = {
  challengeParams: { [CHALLENGE]: {} },
  goldenCases: [
    { challengeId: CHALLENGE, label: "Nam châm đứng yên cạnh cuộn dây", labState: coil("OUTSIDE", "STILL"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Đẩy cực N vào cuộn dây", labState: coil("INSIDE", "TOWARD"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Kéo cực N ra khỏi cuộn dây", labState: coil("OUTSIDE", "AWAY"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Quay máy phát một vòng", labState: generator("CW"), expectedVerdict: "passed" },
  ],
  reason: "FL-25 em-induction: cấu hình định tính đầu tiên (không có tham số).",
};

const pack = (activityVersionId) => ({
  key: "em-induction-k1",
  labId: LAB,
  modelRef: MODEL,
  activityVersionId,
  template: {
    units: {},
    ranges: {},
    initialState: coil("OUTSIDE", "STILL"),
    limitations: activity.limitations,
    goldenCases: [
      { label: "Nam châm đứng yên: không có dòng điện", state: coil("OUTSIDE", "STILL"), expectedVerdict: "passed", expectedOutputs: { inducedCurrent: "ABSENT" } },
      { label: "Đẩy cực N vào: dòng D1", state: coil("INSIDE", "TOWARD"), expectedVerdict: "passed", expectedOutputs: { inducedCurrent: "PRESENT", direction: "D1" } },
      { label: "Kéo cực N ra: dòng D2", state: coil("OUTSIDE", "AWAY"), expectedVerdict: "passed", expectedOutputs: { inducedCurrent: "PRESENT", direction: "D2" } },
      { label: "Mạch hở: không có dòng điện", state: { ...coil("INSIDE", "TOWARD"), circuit: "OPEN" }, expectedVerdict: "passed", expectedOutputs: { inducedCurrent: "ABSENT" } },
      { label: "Quay máy phát: dòng xoay chiều", state: generator("CW"), expectedVerdict: "passed", expectedOutputs: { inducedCurrent: "PRESENT", currentKind: "ALTERNATING", reversalsPerTurn: 2 } },
    ],
  },
  visualAssetVersionId: null,
  semanticMap: { coil: "coil", magnet: "magnet", galvanometer: "galvanometer", "led-pair": "led-pair", generator: "generator" },
  bindings: [],
  challengeTemplates: [],
  reviews: { ownerSignoffPending: true },
  reason: "FL-25 em-induction: gói mô phỏng K1 (3D procedural và 2D tương đương, không tệp GLB).",
});

const evidence = {
  curriculumMapping: `Hoạt động em-induction-checkpoints gắn yêu cầu cần đạt ${OUTCOME} (chủ đề KHTN9-CH04-T01 Điện từ) và bài "Cảm ứng điện từ. Nguyên tắc tạo ra dòng điện xoay chiều". Câu chữ của ${OUTCOME} trong register đang bị cắt cụt (D-3); owner chấp nhận gắn theo mã và sửa câu chữ sau.`,
  sourceReferences: [
    "Chương trình GDPT 2018 môn KHTN lớp 9, chủ đề Điện từ",
    "BE _bmad-output/specs/spec-fl-25-em-induction/lab-definition.md (model, rubric, golden cases)",
  ],
  scientificGoldenCases: "18 ca mẫu EM-01…EM-11/X của em-induction@1.0.0 trong packages/sim/sim.test.ts; 4 ca cấu hình và 5 ca của gói được máy chủ chạy lại khi tạo phiên bản.",
  rubric: "em-induction-checkpoints@1.0.0: 4 dự đoán (đứng yên, đẩy vào, kéo ra, quay máy phát) và 1 câu giải thích; đạt khi 5/5 (D-5). Máy chủ chấm lại toàn bộ.",
  safetyAssessment: "Mô phỏng trên trình duyệt, không có thao tác vật lý, điện áp hay hoá chất; có chế độ 2D không cần WebGL và hỗ trợ giảm chuyển động.",
  rightsAssessment: "Hình học 3D procedural và sơ đồ 2D do NexaLab tự dựng; không dùng tệp GLB, texture, HDR hay phông chữ bên ngoài; nội dung câu hỏi tự viết.",
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
  await call(`/admin/labs/${LAB}/versions/${created.version}/activate`, "POST", { reason: "FL-25: kích hoạt cấu hình định tính đầu tiên." });
  console.log(`configuration v${created.version} created and activated`);
}

const packs = await call(`/admin/labs/${LAB}/packs`);
const activePack = packs.packs.find((candidate) => candidate.status === "active" && candidate.activityVersionId === practical.id);
if (activePack) console.log(`pack ${activePack.key} v${activePack.version} already active`);
else {
  const created = await call("/admin/sim-packs", "POST", pack(practical.id));
  await call(`/admin/sim-packs/${created.id}/activate`, "POST", { reason: "FL-25: kích hoạt gói mô phỏng K1." });
  console.log(`pack ${created.key} v${created.version} created and activated`);
}

const draft = await call(`/admin/labs/${LAB}/releases`, "POST", { reason: "FL-25 em-induction: release đầu tiên sau khi owner duyệt.", lessonId });
console.log(`release v${draft.version} ${draft.status} digest ${draft.digest}${draft.unchanged ? " (unchanged)" : ""}`);

if (draft.status === "ACTIVE") console.log("Release is already active.");
else if (!publish) {
  console.log("\nNot published. OWNER_SIGNOFF evidence that FL25_PUBLISH=true will sign on this digest:");
  console.log(JSON.stringify(evidence, null, 2));
} else {
  const published = await call(`/admin/labs/${LAB}/releases/${draft.id}/publish`, "POST", {
    reason: "FL-25 em-induction: owner đã duyệt, publish release đầu tiên.",
    releaseDigest: draft.digest,
    evidence,
  });
  console.log(`release v${published.version ?? draft.version} ${published.status ?? "published"}`);
}
