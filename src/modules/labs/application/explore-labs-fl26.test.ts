import { describe, expect, it, vi } from "vitest";
import { activityDigest } from "./sim-packs";
import { EXPLORE_BENCHES, exploreActivitySpecSchema, publishExploreLab, resolveExplore } from "./explore-labs";

vi.mock("../../../common/audit", () => ({ audit: vi.fn(), changedFields: vi.fn(() => ({})) }));

// FL-26 bench config (kit k8-garden), the same shape as the FE bundled config `fl-26.config.ts`.
const fl26 = () => ({
  schema: "fl26-mendel-config@1",
  labId: "fl-26-explore",
  catalogId: "FL-26",
  configVersion: 1,
  kit: "k8-garden",
  engine: "mendel-cross@1.0.0",
  title: "Lai Mendel một tính trạng",
  outcomeSummary: ["Dự đoán tỉ lệ kiểu gen và kiểu hình của đời con."],
  safetyBriefing: { simulation: ["Mô phỏng."], realLab: ["Chăm sóc cây đúng cách."], acknowledgeRequired: false },
  limitations: ["Chỉ một tính trạng, trội hoàn toàn."],
  modes: { explore: true },
  enabledApparatus: [{ id: "garden-plot", kind: "pea_plot", slot: "plot_1", labelVi: "Chậu đậu Hà Lan" }],
  measurements: ["genotypeRatio"],
  pedagogy: { observationPrompts: [{ id: "cross", kind: "note", textVi: "Đọc ma trận Punnett." }] },
  review: { status: "draft" },
  spec: { model: "mendel-cross@1.0.0", cross: "monohybrid", allowedParents: [["Aa", "Aa"], ["AA", "aa"]] },
});

/** In-memory rows for the statements publishExploreLab and resolveExplore use. */
function fakeDb() {
  const versions: any[] = [];
  const tx: any = {
    $executeRawUnsafe: vi.fn(),
    lab: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
    foundationalCourseLesson: { findFirst: vi.fn(async () => null) },
    curriculumTopic: { findUnique: vi.fn(async () => ({ code: "KHTN9-CH11-T01", title: "Di truyền", chapter: { subjectId: "khtn", grade: 9 } })) },
    practicalActivityVersion: {
      findUnique: vi.fn(async ({ where }: any) => versions.find((v) => v.key === where.key_digest.key && v.digest === where.key_digest.digest) ?? null),
      findFirst: vi.fn(async ({ where }: any) => versions.filter((v) => v.key === where.key).sort((a, b) => b.version - a.version)[0] ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `pav-${versions.length + 1}`, ...data }; versions.push(row); return row; }),
    },
  };
  return { db: { $transaction: (work: any) => work(tx) } as any, tx, versions };
}
const actor = { sub: "admin", role: "ADMIN" };

describe("FL-26 Mendel bench in the server registry", () => {
  it("is registered under the k8-garden kit with the Mendel model", () => {
    const bench = EXPLORE_BENCHES["k8-garden"];
    expect(bench.modelRef).toBe("mendel-cross@1.0.0");
  });

  it("accepts the FL-26 config and rejects a parent pair it cannot read", () => {
    const bench = EXPLORE_BENCHES["k8-garden"];
    expect(bench.validate(fl26()).ok).toBe(true);
    const bad = fl26();
    bad.spec.allowedParents = [["Ab", "Aa"]];
    expect(bench.validate(bad).ok).toBe(false);
  });

  it("builds an Explore activity spec that the spec schema accepts", () => {
    const config: any = fl26();
    const spec = { ...EXPLORE_BENCHES["k8-garden"].activitySpec(config), explore: config };
    expect(() => exploreActivitySpecSchema.parse(spec)).not.toThrow();
  });

  it("publishes a pinned version and resolves it back to the same config", async () => {
    const { db, tx, versions } = fakeDb();
    const result = await publishExploreLab(db, { config: fl26(), topicCode: "KHTN9-CH11-T01", actor, reason: "test" });
    expect(result.labId).toBe("fl-26-explore");
    expect(versions).toHaveLength(1);
    expect(versions[0].digest).toBe(activityDigest(versions[0].spec));
    const upserted = tx.lab.upsert.mock.calls[0][0];
    expect(upserted.create.simulationModelRef).toBe("mendel-cross@1.0.0");
    expect(upserted.create.config.kit).toBe("k8-garden");

    const pointer = { mode: "explore", kit: "k8-garden", engine: "mendel-cross@1.0.0", activity: { id: versions[0].id, key: versions[0].key, version: versions[0].version, digest: versions[0].digest } };
    const resolved = resolveExplore({ id: "fl-26-explore", config: pointer }, versions[0]);
    expect(resolved.ok).toBe(true);
  });

  it("refuses a publish whose config belongs to another kit", async () => {
    const { db } = fakeDb();
    await expect(publishExploreLab(db, { config: { ...fl26(), kit: "k2-wet-bench@1" }, topicCode: "KHTN9-CH11-T01", actor, reason: "test" })).rejects.toThrow();
  });
});
