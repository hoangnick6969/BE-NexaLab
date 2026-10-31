/** Offline publication preparation. No database access or credentials. */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import {
  activitySpecSchema,
  activityDigest,
  packInputSchema,
  packValidation,
  MODEL_REGISTRY,
} from "../src/modules/labs/application/sim-packs";
import { GENE_VARIANT_IDS } from "../packages/sim/gene-expression";

const reason =
  "Owner requested FL27 data publication to Supabase on 2026-10-31; release reviews pending.";
const limitations =
  "Mô hình giáo dục giản lược; gene mẫu tổng hợp, không phải gene thực. Kích thước enzyme không theo tỉ lệ. Chỉ mô phỏng đột biến thay thế một nucleotide. Chưa duyệt phát hành.";
const parsed = activitySpecSchema.parse({
  key: "gene-protein-stations",
  outcomeCodes: [2, 4, 5, 6, 7].map((n) => `KHTN-L9/tu-gene-den-protein/${n}`),
  objective:
    "Mô tả cấu trúc DNA, tái bản, phiên mã, dịch mã và tác động của đột biến điểm.",
  materials: [
    "Mô hình DNA, RNA polymerase, ribosome, tRNA và bảng mã di truyền",
  ],
  setup:
    "Chọn trạm để quan sát mô hình phân tử 3D hoặc sơ đồ 2D và ghi kết quả vào sổ thực hành.",
  procedure: [
    "Đọc cấu trúc DNA",
    "Ghép mạch DNA mới",
    "Tạo mRNA theo mạch khuôn",
    "Dịch mã từ AUG đến bộ ba kết thúc",
    "So sánh đột biến điểm",
    "Kết luận quan hệ gene–protein–tính trạng",
  ],
  variables: [
    { name: "Biến thể gene", unit: "", role: "independent" },
    { name: "Chuỗi polypeptide", unit: "amino acid", role: "dependent" },
  ],
  observations: [
    "Nguyên tắc bổ sung",
    "Chiều đọc và khung đọc",
    "Tác động của thay thế một nucleotide",
  ],
  expectedResult:
    "Trình tự DNA, RNA và amino acid phù hợp với biến thể gene được ghim cho phiên làm bài.",
  explanation:
    "DNA được tái bản theo nguyên tắc bổ sung; thông tin được phiên mã thành RNA và dịch mã thành protein.",
  safety: "Thí nghiệm ảo, không dùng mẫu sinh học hay hóa chất.",
  limitations,
  modality: "deterministic-simulation",
  sources: [
    {
      title:
        "SGK KHTN 9, Bài 38–41 (tham chiếu trong kế hoạch FL27; provenance chờ duyệt)",
      license: "PENDING_REVIEW",
    },
  ],
  reviews: { ownerSignoffPending: true },
});
const { reviews, ...spec } = parsed;
const modelRef = "gene-expression@1.0.0";
const model = MODEL_REGISTRY[modelRef];
if (!model) throw new Error("FL27 model missing");
const transcripts = [
  "AUGUUCGGAUGGCAUUAA",
  "AUGUUCGGAUGGCAUUAA",
  "AUGUUCGGAUGGCAUUAA",
  "AUGGAACCCUACGGUUGA",
];
const goldenCases = GENE_VARIANT_IDS.map((variantId, index) => ({
  label: variantId,
  state: { variantId },
  expectedVerdict: "passed" as const,
  expectedOutputs: { mrna: transcripts[index] },
  tolerance: 1e-6,
}));
const pack = packInputSchema.parse({
  key: "gene-expression",
  labId: "gene-protein",
  modelRef,
  activityVersionId: "fl27-activity-v1",
  template: {
    units: {},
    ranges: {},
    initialState: null,
    limitations,
    goldenCases,
  },
  semanticMap: { dna: "dna", mrna: "mrna", ribosome: "ribosome" },
  bindings: [],
  challengeTemplates: [],
  reviews,
  reason,
});
const validation = packValidation(pack, {
  labModelRef: modelRef,
  activity: { spec },
  glb: null,
  visualReady: false,
});
if (validation.errors.length) throw new Error(validation.errors.join("; "));
const payload = {
  catalog: (() => {
    const arg = process.argv.indexOf("--catalog");
    const catalog = JSON.parse(
      readFileSync(
        arg >= 0
          ? process.argv[arg + 1]
          : "../NexaLAB_Content tool/catalog-registry.json",
        "utf8",
      ),
    );
    const topic = catalog.topics.find((t: any) => t.code === "KHTN9-CH11-T01");
    if (!topic)
      throw new Error("FL27 curriculum topic missing from exported registry");
    const stripDates = ({ createdAt, updatedAt, ...row }: any) => row;
    return {
      source: "NexaLAB_Content tool/catalog-registry.json",
      exportedAt: catalog.exportedAt,
      chapter: stripDates(
        catalog.chapters.find((c: any) => c.code === topic.chapterCode),
      ),
      topic: stripDates(topic),
      outcomes: catalog.outcomes
        .filter((o: any) => topic.outcomeCodes.includes(o.code))
        .map(stripDates),
    };
  })(),
  lab: {
    id: "gene-protein",
    subjectId: "khtn",
    title: "Từ gene đến protein",
    grade: 9,
    topic: "Từ gene đến protein",
    learningObjective: spec.objective,
    status: "published",
    simulationModelRef: modelRef,
    config: { reviewStatus: "PROPOSED_UNAPPROVED", notice: limitations },
    assets: [],
    scope: "SHARED_LIBRARY",
    releaseCleared: false,
    topicCode: "KHTN9-CH11-T01",
    synthetic: false,
  },
  challenge: {
    id: "gene_protein_001",
    labId: "gene-protein",
    objective: spec.objective,
    constraints: { params: {} },
    difficulty: "intermediate",
  },
  activity: {
    id: "fl27-activity-v1",
    key: spec.key,
    version: 1,
    digest: activityDigest(parsed),
    spec,
    reviews,
    createdById: "admin",
  },
  config: {
    id: "fl27-config-v1",
    labId: "gene-protein",
    version: 1,
    modelRef,
    challengeParams: { gene_protein_001: {} },
    goldenCases: goldenCases.map((g) => ({
      challengeId: "gene_protein_001",
      label: g.label,
      labState: g.state,
      expectedVerdict: g.expectedVerdict,
    })),
    status: "draft",
    reason,
    createdById: "admin",
  },
  pack: {
    id: "fl27-pack-v2",
    key: pack.key,
    version: 2,
    labId: pack.labId,
    modelRef,
    engineVersion: model.engineVersion,
    activityVersionId: pack.activityVersionId,
    template: pack.template,
    visualAssetVersionId: null,
    semanticMap: pack.semanticMap,
    bindings: pack.bindings,
    challengeTemplates: pack.challengeTemplates,
    reviews,
    status: "draft",
    validation: { golden: validation.golden, glbNodes: null },
    reason,
    createdById: "admin",
  },
};
mkdirSync("content/simulation-packs", { recursive: true });
writeFileSync(
  "content/simulation-packs/fl27-candidate.json",
  JSON.stringify(payload, null, 2) + "\n",
);
console.log(
  JSON.stringify({
    manifest: "content/simulation-packs/fl27-candidate.json",
    checks: {
      activitySchema: true,
      packSchema: true,
      goldenCases: validation.golden,
    },
  }),
);
