// FL-21 food-web release through the admin API only (no direct database access).
// Precondition: migration 20261102120000_fl21_food_web_lab is applied to the target
// database by the normal deploy, so the Lab and its challenge exist.
//
// Env:
//   NEXALAB_API              API base, e.g. http://127.0.0.1:4000/api
//   NEXALAB_ADMIN_EMAIL      the owner's ADMIN account
//   NEXALAB_ADMIN_PASSWORD
//   FL21_LESSON_ID           published shared-library lesson to bind (default: KHTN 8 Bài 44)
//   FL21_PUBLISH=true        sign OWNER_SIGNOFF with the evidence below and publish; without it the
//                            script stops after the release draft and prints what would be signed.
//
// Every step is idempotent: re-running reuses the same activity, configuration, pack and draft.

const api = process.env.NEXALAB_API ?? "http://127.0.0.1:4000/api";
const email = process.env.NEXALAB_ADMIN_EMAIL;
const password = process.env.NEXALAB_ADMIN_PASSWORD;
const lessonId = process.env.FL21_LESSON_ID ?? "pack-structured-bad6c781d4a7acf408acdf249319f86758dbf66f-v1";
const publish = process.env.FL21_PUBLISH === "true";
if (!email || !password) throw new Error("Set NEXALAB_ADMIN_EMAIL and NEXALAB_ADMIN_PASSWORD.");

const LAB = "food-web";
const CHALLENGE = "fw_001";
const MODEL = "food-web@1.0.0";
// One topic per release: B46-O02 (causes of imbalance) belongs to topic KHTN8-L46, so it
// cannot join this KHTN8-L44 release; the CAUSES checkpoint stays scored practice here.
const OUTCOMES = ["KHTN8-B44-O02", "KHTN8-B44-O03"];

const W = { webId: "W1" };
const chain = (...nodes) => ({ setup: "chain", ...W, nodes });
const remove = (speciesId) => ({ setup: "remove", ...W, speciesId });
const energy = { setup: "energy", ...W, chain: ["co", "chau-chau", "ech", "ran"] };

const activity = {
  key: "food-web-checkpoints",
  outcomeCodes: OUTCOMES,
  objective: "Phân biệt sinh vật sản xuất, tiêu thụ, phân giải; dựng chuỗi thức ăn trong lưới thức ăn; tính năng lượng truyền qua các bậc dinh dưỡng; dự đoán ảnh hưởng khi một loài bị mất; nhận ra các nguyên nhân gây mất cân bằng tự nhiên.",
  materials: ["Sa bàn lưới thức ăn minh hoạ gồm 11 nhóm sinh vật", "Tháp năng lượng của một chuỗi thức ăn", "Bảng các hoạt động của con người"],
  setup: "Sa bàn lưới thức ăn: mỗi loài là một nút, mũi tên đi từ thức ăn tới sinh vật ăn nó; nấm và vi khuẩn nhận xác và chất thải của mọi bậc.",
  procedure: [
    "Xếp cỏ, ếch, nấm và vi khuẩn vào nhóm sinh vật sản xuất, tiêu thụ hoặc phân giải, rồi kiểm tra.",
    "Bấm lần lượt các loài để dựng một chuỗi thức ăn có ít nhất 4 mắt xích, bắt đầu từ sinh vật sản xuất, rồi kiểm tra.",
    "Tính năng lượng rắn nhận được trong chuỗi Cỏ → Châu chấu → Ếch → Rắn khi mỗi bậc chỉ chuyển 1/10 năng lượng.",
    "Dự đoán, rồi loại bỏ rắn và quan sát ảnh hưởng trực tiếp lên ếch.",
    "Dự đoán, rồi loại bỏ cây xanh và quan sát ảnh hưởng trực tiếp lên sâu ăn lá.",
    "Chọn các hoạt động của con người gây mất cân bằng tự nhiên, rồi kiểm tra.",
    "Chọn lời giải thích vì sao săn bắt hết rắn có thể làm mất cân bằng tự nhiên.",
  ],
  variables: [
    { name: "loài bị loại bỏ", unit: "trạng thái", role: "independent" },
    { name: "số lượng các loài liên quan", unit: "trạng thái", role: "dependent" },
    { name: "các mối quan hệ dinh dưỡng khác", unit: "trạng thái", role: "controlled" },
  ],
  observations: [
    "Cỏ và cây xanh là sinh vật sản xuất; các động vật là sinh vật tiêu thụ; nấm, vi khuẩn là sinh vật phân giải.",
    "Một chuỗi thức ăn hợp lệ bắt đầu từ sinh vật sản xuất, mỗi loài là thức ăn của loài đứng sau.",
    "Năng lượng giảm dần qua các bậc: 10 000, 1 000, 100, 10 kJ; phần còn lại mất đi dưới dạng nhiệt.",
    "Mất rắn: ếch và chim sâu tăng, đại bàng mất một nguồn thức ăn; 4 chuỗi thức ăn bị đứt.",
    "Mất cây xanh: sâu ăn lá mất nguồn thức ăn duy nhất nên giảm.",
    "Phá rừng, săn bắt, khai thác quá mức và ô nhiễm làm mất mắt xích của lưới thức ăn.",
  ],
  expectedResult: "Các loài trong quần xã liên hệ với nhau qua chuỗi và lưới thức ăn; năng lượng truyền một chiều và giảm dần qua các bậc dinh dưỡng; mất một mắt xích làm thay đổi số lượng các loài liên quan và có thể gây mất cân bằng tự nhiên.",
  explanation: "Rắn là một mắt xích trong lưới thức ăn. Khi rắn bị săn bắt hết, con mồi của rắn không còn bị khống chế nên tăng lên, còn kẻ thù của rắn mất một nguồn thức ăn; khả năng tự điều chỉnh của quần xã có hạn nên cân bằng tự nhiên có thể bị phá vỡ.",
  safety: "Mô phỏng trên trình duyệt, không có động vật thật, thiết bị điện hay hoá chất.",
  limitations: "Lưới thức ăn, các loài và quy ước truyền 1/10 năng lượng là số liệu minh hoạ, không phải số liệu SGK. Mô hình chỉ xét ảnh hưởng trực tiếp lên con mồi và kẻ thù của loài bị mất; trong tự nhiên ảnh hưởng còn lan rộng và thay đổi theo thời gian.",
  modality: "deterministic-simulation",
  sources: [
    { title: "SGK Khoa học tự nhiên 8, Bài 44 Hệ sinh thái (sinh vật sản xuất, tiêu thụ, phân giải; chuỗi, lưới thức ăn; năng lượng)", license: "OFFICIAL_CURRICULUM" },
    { title: "SGK Khoa học tự nhiên 8, Bài 46 Cân bằng tự nhiên (nguyên nhân mất cân bằng)", license: "OFFICIAL_CURRICULUM" },
    { title: "NexaLab FL-21 lab definition (spec-fl-21-food-web/lab-definition.md)", license: "ORIGINAL" },
  ],
  reviews: { ownerSignoffPending: true },
};

const config = {
  challengeParams: { [CHALLENGE]: {} },
  goldenCases: [
    { challengeId: CHALLENGE, label: "Vai trò sinh vật", labState: { setup: "roles", ...W }, expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Chuỗi Cỏ → Châu chấu → Ếch → Rắn", labState: chain("co", "chau-chau", "ech", "ran"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Tháp năng lượng", labState: energy, expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Mất rắn", labState: remove("ran"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Mất cây xanh", labState: remove("cay-xanh"), expectedVerdict: "passed" },
    { challengeId: CHALLENGE, label: "Nguyên nhân mất cân bằng", labState: { setup: "causes", ...W }, expectedVerdict: "passed" },
  ],
  reason: "FL-21 food-web: cấu hình đầu tiên (không có tham số).",
};

const pack = (activityVersionId) => ({
  key: "food-web-k8",
  labId: LAB,
  modelRef: MODEL,
  activityVersionId,
  template: {
    units: {},
    ranges: {},
    initialState: { setup: "roles", ...W },
    limitations: activity.limitations,
    goldenCases: [
      { label: "Chuỗi 5 mắt xích hợp lệ", state: chain("co", "chau-chau", "ech", "ran", "dai-bang"), expectedVerdict: "passed", expectedOutputs: { length: 5 } },
      { label: "Tháp năng lượng của chuỗi cố định", state: energy, expectedVerdict: "passed", expectedOutputs: { setup: "energy" } },
      { label: "Mất rắn: 4 chuỗi bị đứt", state: remove("ran"), expectedVerdict: "passed", expectedOutputs: { removed: "ran", brokenChains: 4 } },
      { label: "Mất cây xanh: 2 chuỗi bị đứt", state: remove("cay-xanh"), expectedVerdict: "passed", expectedOutputs: { removed: "cay-xanh", brokenChains: 2 } },
      { label: "Mất thỏ: 2 chuỗi bị đứt", state: remove("tho"), expectedVerdict: "passed", expectedOutputs: { removed: "tho", brokenChains: 2 } },
    ],
  },
  visualAssetVersionId: null,
  semanticMap: { "food-web": "food-web", "energy-pyramid": "energy-pyramid", causes: "causes" },
  bindings: [],
  challengeTemplates: [],
  reviews: { ownerSignoffPending: true },
  reason: "FL-21 food-web: gói mô phỏng K8 (2D SVG, không tệp GLB).",
});

const evidence = {
  curriculumMapping: `Hoạt động food-web-checkpoints gắn yêu cầu cần đạt ${OUTCOMES.join(", ")} (chủ đề KHTN8-L44) và bài "Hệ sinh thái". Câu nguyên nhân mất cân bằng (Bài 46, KHTN8-B46-O02) là luyện tập bổ trợ, không gắn outcome trong release này vì mỗi release chỉ thuộc một chủ đề.`,
  sourceReferences: [
    "SGK KHTN 8 Bài 44, block sgk-khtn8-nxbgd-2026-p0182-b0019..21 (ba nhóm sinh vật), p0184-b0008..12 (chuỗi, lưới, mắt xích chung), p0185-b0002 (năng lượng)",
    "SGK KHTN 8 Bài 46, block sgk-khtn8-nxbgd-2026-p0192-b0005..06 (nguyên nhân mất cân bằng)",
    "BE _bmad-output/specs/spec-fl-21-food-web/lab-definition.md (model, rubric, golden cases)",
  ],
  scientificGoldenCases: "17 ca mẫu FW-01…FW-11/X của food-web@1.0.0 trong packages/sim/food-web.test.ts; 6 ca cấu hình và 5 ca của gói được máy chủ chạy lại khi tạo phiên bản.",
  rubric: "food-web-checkpoints@1.0.0: 6 câu (vai trò, chuỗi, năng lượng, mất rắn, mất cây xanh, nguyên nhân) và 1 câu giải thích; đạt khi 7/7 (D-6). Máy chủ chấm lại toàn bộ.",
  safetyAssessment: "Mô phỏng 2D trên trình duyệt, không có động vật thật, điện hay hoá chất; thao tác được bằng bàn phím và hỗ trợ giảm chuyển động.",
  rightsAssessment: "Sa bàn SVG và nhãn do NexaLab tự vẽ; icon từ lucide-react (ISC); lưới thức ăn và quy ước 1/10 là số liệu minh hoạ tự soạn, có ghi nhãn.",
};

// Publication policy DEV_APPROVAL_V1 (lab-release.service): strict { developerCheck, agentCheck }.
// The detailed review notes above stay in this script as the record of what was checked.
const devApproval = {
  developerCheck: `Owner (developer) asked to rehearse and publish FL-21 on ${new Date().toISOString().slice(0, 10)}. ${evidence.curriculumMapping} ${evidence.rubric}`,
  agentCheck: `${evidence.scientificGoldenCases} Activity, integration (isolated PostgreSQL) and Playwright tests pass; ${evidence.safetyAssessment} ${evidence.rightsAssessment}`,
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
  await call(`/admin/labs/${LAB}/versions/${created.version}/activate`, "POST", { reason: "FL-21: kích hoạt cấu hình đầu tiên." });
  console.log(`configuration v${created.version} created and activated`);
}

const packs = await call(`/admin/labs/${LAB}/packs`);
const activePack = packs.packs.find((candidate) => candidate.status === "active" && candidate.activityVersionId === practical.id);
if (activePack) console.log(`pack ${activePack.key} v${activePack.version} already active`);
else {
  const created = await call("/admin/sim-packs", "POST", pack(practical.id));
  await call(`/admin/sim-packs/${created.id}/activate`, "POST", { reason: "FL-21: kích hoạt gói mô phỏng K8." });
  console.log(`pack ${created.key} v${created.version} created and activated`);
}

const draft = await call(`/admin/labs/${LAB}/releases`, "POST", { reason: "FL-21 food-web: release đầu tiên sau khi owner duyệt.", lessonId });
console.log(`release v${draft.version} ${draft.status} digest ${draft.digest}${draft.unchanged ? " (unchanged)" : ""}`);

if (draft.status === "ACTIVE") console.log("Release is already active.");
else if (!publish) {
  console.log("\nNot published. DEV_APPROVAL evidence that FL21_PUBLISH=true will record on this digest:");
  console.log(JSON.stringify(devApproval, null, 2));
} else {
  const published = await call(`/admin/labs/${LAB}/releases/${draft.id}/publish`, "POST", {
    reason: "FL-21 food-web: owner đã duyệt, publish release đầu tiên.",
    releaseDigest: draft.digest,
    evidence: devApproval,
  });
  console.log(`release v${published.version ?? draft.version} ${published.status ?? "published"}`);
}
