import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { activitySpecSchema, packInputSchema, packValidation } from "./sim-packs";
import { goldenCaseResults, versionErrors } from "./simulation-versions";
import { labEvaluators } from "./evaluators/registry";
import { LabReleaseService } from "./lab-release.service";
vi.mock("./assignment-lab-execution", () => ({ captureCurrentLabExecution: async () => ({ modelRef: "thermal-bench@1.0.0", configVersionId: "cfg", packVersionId: "pack", activityVersionId: "activity", effectiveParams: { fl07_001: {} } }), resolvePinnedAssignmentLab: vi.fn() }));

const candidate = JSON.parse(readFileSync("content/simulation-packs/fl07-candidate.json", "utf8"));
describe("FL-07 publication manifest", () => {
  it("freezes B27 binding and requires a real exact-digest owner approval", async () => {
    const { reviews, ...spec } = activitySpecSchema.parse(candidate.activity);
    const lesson = { id: candidate.lessonIds[0], subjectId: "khtn", grade: 8, curriculumTopicCode: "KHTN8-L27", outcomeCodes: spec.outcomeCodes,
      packVersion: { id: "content-pack", digest: "content-digest", releaseId: "content-release", outcomeCodes: spec.outcomeCodes } };
    const config = { challengeParams: { fl07_001: {} }, reason: candidate.lab.reason, modelRef: candidate.lab.modelRef,
      goldenCases: candidate.pack.template.goldenCases.map((g: any) => ({ challengeId: "fl07_001", label: g.label, labState: g.state, expectedVerdict: g.expectedVerdict })) };
    const db: any = {
      $executeRawUnsafe: vi.fn(), auditLog: { create: vi.fn() },
      lab: { findUnique: vi.fn(async () => ({ id: candidate.lab.id, subjectId: "khtn", grade: 8, topicCode: "KHTN8-L27", status: "draft", synthetic: false })) },
      lesson: { findMany: vi.fn(async () => [lesson]) },
      curriculumTopic: { findUnique: vi.fn(async () => ({ code: "KHTN8-L27", status: "active", chapter: { status: "active" }, outcomeCodes: spec.outcomeCodes })) },
      curriculumOutcome: { findMany: vi.fn(async () => spec.outcomeCodes.map(code => ({ code }))) },
      practicalActivityVersion: { findUnique: vi.fn(async () => ({ id: "activity", key: spec.key, version: 1, spec, digest: "activity-digest" })) },
      simulationConfigVersion: { findUnique: vi.fn(async () => config) },
      simulationPackVersion: { findUnique: vi.fn(async () => ({ ...candidate.pack, activityVersionId: "activity" })) },
      challenge: { findMany: vi.fn(async () => [{ id: "fl07_001" }]) },
      labRelease: { findUnique: vi.fn(async () => null), findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => ({ id: "release", ...data })) },
    };
    db.$transaction = async (fn: any) => fn(db);
    const release = await new LabReleaseService(db).createDraft(candidate.lab.id, { user: { sub: "admin", role: "ADMIN" } }, { reason: candidate.lab.reason, lessonIds: candidate.lessonIds });
    expect(release).toMatchObject({ status: "DRAFT", snapshot: { reviewPolicy: "OWNER_SIGNOFF_V1", requiredReviewKinds: ["OWNER_SIGNOFF"], outcomes: ["KHTN8-B27-O01"] } });
    expect(release.snapshot.lessonBindings[0].lessonId).toBe(lesson.id);
    expect(db.lesson.update).toBeUndefined();
    lesson.packVersion.outcomeCodes = [];
    await expect(new LabReleaseService(db).createDraft(candidate.lab.id, { user: { sub: "admin" } }, { reason: candidate.lab.reason, lessonIds: candidate.lessonIds }))
      .rejects.toMatchObject({ response: { code: "LAB_OUTCOME_MAPPING_REQUIRED" } });
  });
  it("validates its pinned activity, four exact model observations and config", () => {
    const activity = activitySpecSchema.parse(candidate.activity);
    const pack = packInputSchema.parse(candidate.pack);
    expect(packValidation(pack, { labModelRef: candidate.lab.modelRef, activity: { spec: activity }, glb: null, visualReady: false }).errors).toEqual([]);
    const config = { challengeParams: { [candidate.lab.challengeId]: {} }, reason: candidate.lab.reason,
      goldenCases: pack.template.goldenCases.map(g => ({ challengeId: candidate.lab.challengeId, label: g.label, labState: g.state, expectedVerdict: g.expectedVerdict })) };
    expect(versionErrors(candidate.lab.id, [candidate.lab.challengeId], config, pack.modelRef)).toEqual([]);
    expect(goldenCaseResults(candidate.lab.id, config, pack.modelRef).every(g => g.ok)).toBe(true);
    expect(labEvaluators.rubricRefForActivity(activity.key, 1, pack.modelRef)).toBe("thermal-energy-investigation@1.0.0");
    expect(candidate.ownerEvidence).toBeUndefined();
    const tampered = structuredClone(pack);
    tampered.template.goldenCases[2].expectedOutputs.temperatureMilliCelsius = 31000;
    expect(packValidation(tampered, { labModelRef: pack.modelRef, activity: { spec: activity }, glb: null, visualReady: false }).errors.length).toBeGreaterThan(0);
  });
});
