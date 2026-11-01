import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { activityDigest, activitySpecSchema, packInputSchema, packValidation } from "./sim-packs";
import { goldenCaseResults, versionErrors } from "./simulation-versions";
import { LabReleaseService } from "./lab-release.service";
import { AdminLabsController } from "../interface/admin-labs.controller";

const { execution } = vi.hoisted(() => ({ execution: { modelRef: "lever-bench@1.0.0", configVersionId: "cfg", packVersionId: "pack", activityVersionId: "activity", effectiveParams: { fl06_001: {} } } }));
vi.mock("./assignment-lab-execution", () => ({ captureCurrentLabExecution: async () => execution, resolvePinnedAssignmentLab: vi.fn() }));
const candidate = JSON.parse(readFileSync("content/simulation-packs/fl06-candidate.json", "utf8"));
const input = { challengeParams: { fl06_001: {} }, reason: candidate.lab.reason, goldenCases: candidate.pack.template.goldenCases.map((g: any) => ({ challengeId: "fl06_001", label: g.label, labState: g.state, expectedVerdict: g.expectedVerdict })) };
const req = { user: { sub: "admin", role: "ADMIN" } };
function fixture() {
  const { reviews, ...spec } = activitySpecSchema.parse(candidate.activity);
  const topics = ["KHTN8-L18", "KHTN8-L19"].map((code, index) => ({ code, status: "active", chapterCode: "KHTN8-CH04", chapter: { status: "active", grade: 8, subjectId: "khtn" }, outcomeCodes: spec.outcomeCodes.slice(index * 2, index * 2 + 2) }));
  const lessons = candidate.lessonIds.map((id: string, index: number) => ({ id, subjectId: "khtn", grade: 8, curriculumTopicCode: topics[index].code, outcomeCodes: topics[index].outcomeCodes, packVersion: { id: `content-${index}`, digest: `digest-${index}`, releaseId: `release-${index}`, outcomeCodes: topics[index].outcomeCodes } }));
  const db: any = {
    $executeRawUnsafe: vi.fn(), $queryRawUnsafe: vi.fn(async () => [{ ready: true }]), auditLog: { create: vi.fn() },
    lab: { findUnique: vi.fn(async () => ({ id: "lever-equilibrium", subjectId: "khtn", grade: 8, topicCode: "KHTN8-L18", status: "draft", synthetic: false })) },
    lesson: { findMany: vi.fn(async () => lessons) },
    curriculumTopic: { findUnique: vi.fn(async ({ where }: any) => topics.find(topic => topic.code === where.code)) },
    curriculumOutcome: { findMany: vi.fn(async () => spec.outcomeCodes.map(code => ({ code }))) },
    practicalActivityVersion: { findUnique: vi.fn(async () => ({ id: "activity", key: spec.key, version: 1, spec, digest: activityDigest(candidate.activity) })) },
    simulationConfigVersion: { findUnique: vi.fn(async () => ({ ...input, modelRef: "lever-bench@1.0.0" })) },
    simulationPackVersion: { findUnique: vi.fn(async () => ({ ...candidate.pack, activityVersionId: "activity" })) },
    challenge: { findMany: vi.fn(async () => [{ id: "fl06_001" }]) },
    labRelease: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => ({ id: "release", ...data })) },
  };
  db.$transaction = async (fn: any) => fn(db);
  return { db, lessons, topics };
}

describe("FL-06 publication candidate", () => {
  it("validates all six golden observations and configuration allowlist", () => {
    const activity = activitySpecSchema.parse(candidate.activity);
    const pack = packInputSchema.parse(candidate.pack);
    expect(packValidation(pack, { labModelRef: candidate.lab.modelRef, activity: { spec: activity }, glb: null, visualReady: false }).errors).toEqual([]);
    expect(versionErrors("lever-equilibrium", ["fl06_001"], input, candidate.lab.modelRef)).toEqual([]);
    expect(goldenCaseResults("lever-equilibrium", input, candidate.lab.modelRef).every(g => g.ok)).toBe(true);
    const wrong = structuredClone(pack); wrong.template.goldenCases[0].expectedOutputs.netMomentMilliNewtonMillimetres = -100000;
    expect(packValidation(wrong, { labModelRef: candidate.lab.modelRef, activity: { spec: activity }, glb: null, visualReady: false }).errors.length).toBeGreaterThan(0);
  });
  it("snapshots both released Lessons and all four outcomes without changing Lessons", async () => {
    const { db } = fixture();
    const release = await new LabReleaseService(db).createDraft("lever-equilibrium", req, { reason: candidate.lab.reason, lessonIds: candidate.lessonIds });
    expect(release.snapshot).toMatchObject({ reviewPolicy: "OWNER_SIGNOFF_V1", requiredReviewKinds: ["OWNER_SIGNOFF"], outcomes: [...candidate.activity.outcomeCodes].sort() });
    expect(release.snapshot.lessonBindings).toHaveLength(2);
    expect(db.lesson.findMany.mock.calls[0][0].where.id.in).toEqual(candidate.lessonIds);
  });
  it("rejects missing content-pack coverage and topics from different chapters", async () => {
    const first = fixture(); first.lessons[1].packVersion.outcomeCodes = [];
    await expect(new LabReleaseService(first.db).createDraft("lever-equilibrium", req, { reason: candidate.lab.reason, lessonIds: candidate.lessonIds })).rejects.toMatchObject({ response: { code: "LAB_OUTCOME_MAPPING_REQUIRED" } });
    const second = fixture(); second.topics[1].chapterCode = "other-chapter";
    await expect(new LabReleaseService(second.db).createDraft("lever-equilibrium", req, { reason: candidate.lab.reason, lessonIds: candidate.lessonIds })).rejects.toMatchObject({ response: { code: "LAB_TOPIC_MAPPING_REQUIRED" } });
  });
  it("creates a private draft Lab and base challenge through the audited Admin API", async () => {
    const { db, topics } = fixture(); topics[0] = { ...topics[0], title: "Moment lực" } as any;
    db.lab.findUnique.mockResolvedValue(null); db.lab.create = vi.fn(async ({ data }: any) => data);
    db.challenge.findUnique = vi.fn(async () => null); db.challenge.create = vi.fn();
    const controller = new AdminLabsController(db, {} as any);
    const lab = await controller.createLab(req, candidate.lab);
    expect(lab).toMatchObject({ id: "lever-equilibrium", status: "draft", scope: "CLASS_PRIVATE", releaseCleared: false });
    expect(db.challenge.create.mock.calls[0][0].data).toMatchObject({ id: "fl06_001", labId: lab.id });
    expect(db.auditLog.create).toHaveBeenCalledOnce();
    db.$queryRawUnsafe.mockResolvedValue([{ ready: false }]);
    await expect(controller.createLab(req, candidate.lab)).rejects.toMatchObject({ response: { code: "LAB_SCHEMA_MIGRATION_REQUIRED" } });
    await expect(controller.createLab(req, { ...candidate.lab, modelRef: "circuit-bulb@1.0.0" })).rejects.toMatchObject({ response: { code: "LAB_MODEL_INVALID" } });
  });
});
