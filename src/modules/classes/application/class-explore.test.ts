import { describe, expect, it, vi } from "vitest";
import { exploreConfig } from "../../labs/interface/explore-lab.fixture";
import { FL06_LEVER_EXPLORE_CONFIG } from "../../../../packages/sim/mechanics";
import { publishExploreLab } from "../../labs/application/explore-labs";
import { AssignmentsService, assignmentInput } from "./assignments.service";
import { ClassExploreService } from "./class-explore.service";
import {
  assertExploreAnswers, buildExploreResource, buildExploreSnapshot, exploreInputOf, exploreResourceContentSchema, studentExploreSnapshot, verifyExploreSnapshot, exploreAnswersSchema, exploreRequirementSchema, readStoredAnswers,
} from "./class-explore-contract";
import { normalizeResourceContent, studentResource } from "./class-resource-contract";

vi.mock("../../../common/audit", () => ({ audit: vi.fn(), changedFields: vi.fn(() => ({})) }));

/** The wet bench test config plus one Class Explore template: pick two of HCl and NaOH, measure each, explain. */
const withTemplate = () => ({
  ...exploreConfig(),
  enabledApparatus: [{ id: "T1", kind: "test_tube", slot: "rack_1" }, { id: "T2", kind: "test_tube", slot: "rack_2" }, { id: "meter", kind: "digital_ph_meter", slot: "tool_ph" }],
  classTemplates: [{
    id: "ph-two", titleVi: "So sánh pH", requiredApparatusIds: ["T1", "T2", "meter"],
    reagentGroups: [{ id: "samples", labelVi: "Mẫu", count: 2, options: ["HCl_0_1M", "NaOH_0_1M"] }],
    promptChoices: [{ promptId: "p1" }], requirements: { measure: { measurement: "ph_meter", perGroup: "samples" }, explain: true },
  }],
});
const selection = { templateId: "ph-two", reagents: { samples: ["NaOH_0_1M", "HCl_0_1M"] }, promptId: "p1" };

/** Publish through the real write path, then expose what the Lab and version rows look like to the read helpers. */
async function world(config: unknown = withTemplate(), labId = "acid-base-indicators") {
  const versions: any[] = [];
  const tx: any = {
    $executeRawUnsafe: vi.fn(),
    lab: { findUnique: vi.fn(async () => null), upsert: vi.fn() },
    foundationalCourseLesson: { findFirst: vi.fn(async () => null) },
    curriculumTopic: { findUnique: vi.fn(async () => ({ code: "KHTN8-L09", title: "Base. Thang pH", chapter: { subjectId: "khtn", grade: 8 } })) },
    practicalActivityVersion: {
      findUnique: vi.fn(async ({ where }: any) => versions.find((v) => v.key === where.key_digest.key && v.digest === where.key_digest.digest) ?? null),
      findFirst: vi.fn(async ({ where }: any) => versions.filter((v) => v.key === where.key).sort((a, b) => b.version - a.version)[0] ?? null),
      create: vi.fn(async ({ data }: any) => { const row = { id: `pav-${versions.length + 1}`, ...data }; versions.push(row); return row; }),
    },
  };
  await publishExploreLab({ $transaction: (work: any) => work(tx) } as any, { config, topicCode: "KHTN8-L09", actor: { sub: "admin", role: "ADMIN" }, reason: "test" });
  let labConfig = tx.lab.upsert.mock.calls[0][0].update.config;
  const read: any = {
    lab: { findFirst: vi.fn(async ({ where }: any) => (where.id === labId ? { id: where.id, title: "FL-13", grade: 8, config: labConfig } : null)), findUnique: vi.fn(async () => ({ grade: 8 })) },
    practicalActivityVersion: { findMany: vi.fn(async ({ where }: any) => versions.filter((v) => where.id.in.includes(v.id))) },
  };
  return { read, versions, repoint: (next: any) => { labConfig = next; } };
}
const resourceRow = (content: unknown) => ({ id: "res-1", version: 1, title: "Đo pH hai mẫu", content });
const input = { source: { labId: "acid-base-indicators" }, selection, instructions: "Làm theo nhóm." };

describe("Class Explore resource (P0 C3.1-C3.4)", () => {
  it("pins the Lab version, the template, the selection, the digest of the effective config and the requirements", async () => {
    const { read, versions } = await world();
    const content = await buildExploreResource(read, input);
    expect(content.source).toEqual({ mode: "explore", labId: "acid-base-indicators", activityVersionId: "pav-1", activityDigest: versions[0].digest });
    expect(content).toMatchObject({ templateId: "ph-two", selection, instructions: "Làm theo nhóm." });
    expect(content.effectiveConfigDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(content.requirements).toEqual([
      { kind: "measure", itemId: "HCl_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
      { kind: "measure", itemId: "NaOH_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
      { kind: "explain" },
    ]);
    expect(exploreResourceContentSchema.safeParse(content).success).toBe(true);
    // The same pick in another order is the same resource.
    const reordered = await buildExploreResource(read, { ...input, selection: { ...selection, reagents: { samples: ["HCl_0_1M", "NaOH_0_1M"] } } });
    expect(reordered.effectiveConfigDigest).toBe(content.effectiveConfigDigest);
  });

  it("refuses a selection outside the allow-list, a Lab that is not an Explore Lab, and a Lab with no templates", async () => {
    const { read } = await world();
    await expect(buildExploreResource(read, { ...input, selection: { ...selection, reagents: { samples: ["HCl_0_1M", "Zn_granule"] } } }))
      .rejects.toMatchObject({ response: { code: "EXPLORE_SELECTION_INVALID" } });
    await expect(buildExploreResource(read, { ...input, source: { labId: "no-such-lab" } })).rejects.toMatchObject({ response: { code: "LAB_SOURCE_NOT_ELIGIBLE" } });
    const plain = await world(exploreConfig());
    await expect(buildExploreResource(plain.read, input)).rejects.toMatchObject({ response: { code: "EXPLORE_SELECTION_INVALID", errors: ["unknown template ph-two"] } });
  });

  it("a draft body is checked by shape only; unknown fields and kinds do not slip through", () => {
    expect(normalizeResourceContent("EXPLORE_LAB", input)).toMatchObject({ source: { labId: "acid-base-indicators" } });
    expect(() => normalizeResourceContent("EXPLORE_LAB", { ...input, extra: 1 })).toThrow();
    expect(() => normalizeResourceContent("EXPLORE_LAB", { source: { labId: "x" } })).toThrow();
  });

  it("class members see only the Lab and the instructions of an Explore resource", async () => {
    const { read } = await world();
    const content = await buildExploreResource(read, input);
    expect(studentResource("EXPLORE_LAB", content)).toEqual({ source: { mode: "explore", labId: "acid-base-indicators" }, instructions: "Làm theo nhóm." });
  });

  it("publish can rebuild the same content from the stored one", async () => {
    const { read } = await world();
    const content = await buildExploreResource(read, input);
    expect(await buildExploreResource(read, exploreInputOf(content))).toEqual(content);
  });
});

describe("Class Explore snapshot (C3.4)", () => {
  it("carries the effective bench and the requirements, is digest-checked, and gives students a projection without internals", async () => {
    const { read } = await world();
    const resource = resourceRow(await buildExploreResource(read, input));
    const snapshot = await buildExploreSnapshot(read, resource);
    expect(snapshot).toMatchObject({ resourceId: "res-1", labId: "acid-base-indicators", templateId: "ph-two", promptId: "p1" });
    expect((snapshot.effectiveConfig as any).enabledApparatus.map((item: any) => item.id)).toEqual(["T1", "T2", "meter"]);
    expect((snapshot.effectiveConfig as any).availableReagents).toHaveLength(2);
    expect(verifyExploreSnapshot(snapshot)).toEqual(snapshot);
    const student = studentExploreSnapshot(snapshot);
    expect(student).not.toHaveProperty("resourceId");
    expect(student).not.toHaveProperty("templateId");
    expect(student).not.toHaveProperty("selection");
    expect(student.requirements).toHaveLength(3);
  });

  it("refuses a tampered snapshot", async () => {
    const { read } = await world();
    const snapshot = await buildExploreSnapshot(read, resourceRow(await buildExploreResource(read, input)));
    const tampered = JSON.parse(JSON.stringify(snapshot));
    tampered.requirements = tampered.requirements.slice(1);
    expect(() => verifyExploreSnapshot(tampered)).toThrow(expect.objectContaining({ response: { code: "EXPLORE_SNAPSHOT_INVALID" } }));
    const config = JSON.parse(JSON.stringify(snapshot));
    config.effectiveConfig.title = "Khác";
    expect(() => verifyExploreSnapshot(config)).toThrow(expect.objectContaining({ response: { code: "EXPLORE_SNAPSHOT_INVALID" } }));
  });

  it("refuses to assign a resource whose Lab has a newer pinned version", async () => {
    const { read, versions, repoint } = await world();
    const resource = resourceRow(await buildExploreResource(read, input));
    versions.push({ ...versions[0], id: "pav-2", version: 2, digest: "f".repeat(64) });
    const config = (await read.lab.findFirst({ where: { id: "acid-base-indicators" } })).config;
    repoint({ ...config, activity: { ...config.activity, id: "pav-2", version: 2, digest: "f".repeat(64) } });
    await expect(buildExploreSnapshot(read, resource)).rejects.toMatchObject({ response: { code: expect.stringMatching(/EXPLORE_DIGEST_MISMATCH|EXPLORE_SOURCE_CHANGED/) } });
  });
});

describe("FL-06 Class Explore on the mechanics bench (D1-3.1)", () => {
  const leverSelection = { templateId: "balance-the-lever", loadPresetId: "load-2n-left-200", weightOptionIndex: 0, gauge: true, momentTable: false, promptId: "explain-balance" };
  const leverInput = { source: { labId: "lever-equilibrium" }, selection: leverSelection, instructions: "" };

  it("pins a lever resource with two moments and an explanation, and the snapshot carries the locked load", async () => {
    const { read } = await world(structuredClone(FL06_LEVER_EXPLORE_CONFIG), "lever-equilibrium");
    const content = await buildExploreResource(read, leverInput);
    expect(content.requirements).toEqual([
      { kind: "measure", itemId: "moment-left", measurement: "moment", unit: "milliNewtonMetres" },
      { kind: "measure", itemId: "moment-right", measurement: "moment", unit: "milliNewtonMetres" },
      { kind: "explain" },
    ]);
    const snapshot = await buildExploreSnapshot(read, resourceRow(content));
    expect(snapshot.effectiveConfig).toMatchObject({ kit: "k5-lever-bench@1", lockInitialAttachments: true, initialAttachments: [{ kind: "WEIGHT", positionMillimetres: -200, forceMilliNewtons: 2000 }] });
    expect(verifyExploreSnapshot(snapshot).requirements).toHaveLength(3);
    const moments = { measures: [{ itemId: "moment-left", value: 400 }, { itemId: "moment-right", value: 400 }], explanation: "Hai moment bằng nhau." };
    expect(() => assertExploreAnswers(snapshot.requirements, exploreAnswersSchema.parse(moments))).not.toThrow();
  });

  it("refuses a load the chosen weights cannot level", async () => {
    const { read } = await world(structuredClone(FL06_LEVER_EXPLORE_CONFIG), "lever-equilibrium");
    await expect(buildExploreResource(read, { ...leverInput, selection: { ...leverSelection, loadPresetId: "load-05n-left-250", weightOptionIndex: 1, gauge: false } }))
      .rejects.toMatchObject({ response: { code: "EXPLORE_SELECTION_INVALID", errors: [expect.stringMatching(/cannot be levelled/)] } });
  });
});

describe("Class Explore answers", () => {
  const requirements = [
    { kind: "measure", itemId: "HCl_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
    { kind: "measure", itemId: "NaOH_0_1M", measurement: "ph_meter", unit: "tenthsPh" },
    { kind: "explain" },
  ] as const;
  const good = { measures: [{ itemId: "HCl_0_1M", tenthsPh: 10 }, { itemId: "NaOH_0_1M", tenthsPh: 130 }], explanation: "HCl là acid mạnh." };
  const paths = (answers: any) => { try { assertExploreAnswers(requirements, answers); return []; } catch (error: any) { return error.response.details.map((item: any) => item.path); } };
  it("accepts exactly the asked values", () => { expect(paths(good)).toEqual([]); });
  it("refuses a missing, extra or repeated measure and a missing explanation", () => {
    expect(paths({ ...good, measures: [good.measures[0]] })).toEqual(["measures.NaOH_0_1M"]);
    expect(paths({ ...good, measures: [...good.measures, { itemId: "H2O_distilled", tenthsPh: 70 }] })).toEqual(["measures.H2O_distilled"]);
    expect(paths({ ...good, measures: [...good.measures, good.measures[0]] })).toEqual(["measures.HCl_0_1M"]);
    expect(paths({ measures: good.measures })).toEqual(["explanation"]);
  });
  it("takes `value` in the requirement's unit and checks its range; `tenthsPh` from the first clients still counts", () => {
    const asValue = { ...good, measures: [{ itemId: "HCl_0_1M", value: 10 }, { itemId: "NaOH_0_1M", value: 130 }] };
    expect(paths(asValue)).toEqual([]);
    expect(paths({ ...asValue, measures: [{ itemId: "HCl_0_1M", value: 141 }, asValue.measures[1]] })).toEqual(["measures.HCl_0_1M"]);
    expect(exploreAnswersSchema.parse(good).measures).toEqual(asValue.measures);
    const moments = [{ kind: "measure", itemId: "moment-left", measurement: "moment", unit: "milliNewtonMetres" }] as const;
    expect(() => assertExploreAnswers(moments, { measures: [{ itemId: "moment-left", value: 150 }] })).not.toThrow();
    expect(() => assertExploreAnswers(moments, { measures: [{ itemId: "moment-left", value: -1 }] })).toThrow();
  });
  it("reads answers saved before units were general", () => {
    expect(readStoredAnswers({ measures: [{ itemId: "HCl_0_1M", tenthsPh: 10 }], explanation: "x" })).toEqual({ measures: [{ itemId: "HCl_0_1M", value: 10 }], explanation: "x" });
  });
  it("accepts a requirement only when its unit matches the measurement", () => {
    expect(exploreRequirementSchema.safeParse({ kind: "measure", itemId: "m", measurement: "moment", unit: "milliNewtonMetres" }).success).toBe(true);
    expect(exploreRequirementSchema.safeParse({ kind: "measure", itemId: "m", measurement: "moment", unit: "tenthsPh" }).success).toBe(false);
  });
  it("refuses an explanation when none was asked", () => {
    expect(() => assertExploreAnswers(requirements.slice(0, 2), good)).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: "EXPLORE_ANSWER_INVALID" }) }));
  });
});

describe("assignment input for Class Explore", () => {
  const base = { contentType: "explore_lab", contentId: "acid-base-indicators", exploreResourceId: "res-1", studentIds: [] };
  it("needs the resource id and rejects mixing with the Guided lab fields", () => {
    expect(assignmentInput.safeParse(base).success).toBe(true);
    expect(assignmentInput.safeParse({ ...base, exploreResourceId: undefined }).success).toBe(false);
    expect(assignmentInput.safeParse({ ...base, labReleaseId: "r", labChallengeId: "c" }).success).toBe(false);
    expect(assignmentInput.safeParse({ ...base, classLabResourceId: "x" }).success).toBe(false);
    expect(assignmentInput.safeParse({ contentType: "lab", contentId: "l", exploreResourceId: "res-1", labReleaseId: "r", labChallengeId: "c" }).success).toBe(false);
  });
});

describe("ClassExploreService (C3.4)", () => {
  async function setup(extra: Record<string, unknown> = {}, due: { at: Date | null } = { at: null }) {
    const { read } = await world();
    const snapshot = await buildExploreSnapshot(read, resourceRow(await buildExploreResource(read, input)));
    const stored: any[] = [];
    const db: any = {
      assignment: { findFirst: vi.fn(async ({ where }: any) => (where.id === "a1" ? { id: "a1", classId: "c1", title: "Đo pH", dueDate: due.at, exploreSnapshot: snapshot, targets: [{ studentId: "s1", student: { id: "s1", fullName: "An", username: "an" } }, { studentId: "s2", student: { id: "s2", fullName: "Bình", username: "binh" } }] } : null)) },
      classExploreSubmission: {
        findUnique: vi.fn(async ({ where }: any) => stored.find((row) => row.studentId === where.assignmentId_studentId.studentId) ?? null),
        create: vi.fn(async ({ data }: any) => { const row = { id: `sub-${stored.length + 1}`, status: "SUBMITTED", submittedAt: new Date(), feedback: null, reviewedAt: null, ...data }; stored.push(row); return row; }),
        findMany: vi.fn(async () => stored),
        findFirst: vi.fn(async ({ where }: any) => stored.find((row) => row.id === where.id) ?? null),
        update: vi.fn(async ({ where, data }: any) => Object.assign(stored.find((row) => row.id === where.id), data)),
      },
      classroom: { findUnique: vi.fn(async () => ({ id: "c1", teacherId: "t1" })) },
      $transaction: async (work: any) => work(db),
      $executeRaw: vi.fn(),
      ...extra,
    };
    return { service: new ClassExploreService(db), db, stored, snapshot, due };
  }
  const HOUR = 3_600_000;
  const past = () => new Date(Date.now() - HOUR);
  const future = () => new Date(Date.now() + HOUR);
  const student = (sub = "s1") => ({ user: { sub, role: "STUDENT" }, headers: {} });
  const teacher = (sub = "t1") => ({ user: { sub, role: "TEACHER" }, headers: {} });
  const answers = { measures: [{ itemId: "NaOH_0_1M", tenthsPh: 130 }, { itemId: "HCl_0_1M", tenthsPh: 10 }], explanation: "HCl là acid mạnh." };

  it("saves a submission in requirement order, and a retry with the same answers returns it instead of a second row", async () => {
    const { service, stored } = await setup();
    const first = await service.submit("a1", student(), answers);
    expect(first).toMatchObject({ replayed: false, resubmitted: false, submission: { status: "SUBMITTED", late: false, canResubmit: true, answers: { measures: [{ itemId: "HCl_0_1M", value: 10 }, { itemId: "NaOH_0_1M", value: 130 }] } } });
    const retry = await service.submit("a1", student(), { ...answers, measures: [...answers.measures].reverse() });
    expect(retry).toMatchObject({ replayed: true, submission: { id: first.submission.id } });
    expect(stored).toHaveLength(1);
  });

  it("refuses answers that miss the requirements and anyone outside the audience", async () => {
    const { service, db } = await setup();
    await expect(service.submit("a1", student("s2"), { measures: [], explanation: "x" })).rejects.toMatchObject({ response: { code: "EXPLORE_ANSWER_INVALID" } });
    await expect(service.submit("a1", student("s2"), { ...answers, measures: [{ itemId: "HCl_0_1M", tenthsPh: 150 }] })).rejects.toThrow();
    db.assignment.findFirst.mockResolvedValueOnce(null);
    await expect(service.submit("a1", student("outsider"), answers)).rejects.toMatchObject({ response: { code: "ASSIGNMENT_NOT_FOUND" } });
    // The audience check is part of the query, not an afterthought.
    expect(db.assignment.findFirst.mock.calls.at(-1)[0].where).toMatchObject({ id: "a1", contentType: "explore_lab", status: "ACTIVE", targets: { some: { studentId: "outsider" } } });
  });

  it("lets a student resubmit before the due date, or any time when there is none, and the latest answers are kept", async () => {
    for (const at of [null, future()]) {
      const { service, stored } = await setup({}, { at });
      const first = await service.submit("a1", student(), answers);
      const again = await service.submit("a1", student(), { ...answers, explanation: "Sửa lại." });
      expect(again).toMatchObject({ replayed: false, resubmitted: true, submission: { id: first.submission.id, status: "SUBMITTED", late: false, answers: { explanation: "Sửa lại." } } });
      expect(stored).toHaveLength(1);
      expect(stored[0].answers.explanation).toBe("Sửa lại.");
    }
  });

  it("accepts a first submission after the due date and marks it late, but then closes resubmission", async () => {
    const { service, stored } = await setup({}, { at: past() });
    const late = await service.submit("a1", student(), answers);
    expect(late).toMatchObject({ replayed: false, resubmitted: false, submission: { late: true, canResubmit: false } });
    await expect(service.submit("a1", student(), { ...answers, explanation: "Khác" })).rejects.toMatchObject({ response: { code: "EXPLORE_RESUBMIT_CLOSED" } });
    // The same answers are a retry, not a resubmission.
    expect(await service.submit("a1", student(), answers)).toMatchObject({ replayed: true, submission: { late: true } });
    expect(stored).toHaveLength(1);
  });

  it("closes resubmission once the due date passes after an on-time submission", async () => {
    const { service, due } = await setup({}, { at: future() });
    await service.submit("a1", student(), answers);
    due.at = past();
    await expect(service.submit("a1", student(), { ...answers, explanation: "Muộn." })).rejects.toMatchObject({ response: { code: "EXPLORE_RESUBMIT_CLOSED" } });
  });

  it("does not let a student overwrite work the teacher has commented on, even before the due date", async () => {
    const { service } = await setup({}, { at: future() });
    const { submission } = await service.submit("a1", student(), answers);
    await service.review("c1", "a1", submission.id, teacher(), { feedback: "Tốt." });
    await expect(service.submit("a1", student(), { ...answers, explanation: "Khác." })).rejects.toMatchObject({ response: { code: "EXPLORE_ALREADY_REVIEWED" } });
  });

  it("reads late against the current due date, so a teacher who extends the deadline clears the mark", async () => {
    const { service, due } = await setup({}, { at: past() });
    await service.submit("a1", student(), answers);
    expect((await service.list("c1", "a1", teacher())).submissions[0]).toMatchObject({ late: true, canResubmit: false });
    due.at = future();
    expect((await service.list("c1", "a1", teacher())).submissions[0]).toMatchObject({ late: false, canResubmit: true });
  });

  it("never touches runs, attempts, progress or verdicts", async () => {
    const guard = (name: string) => new Proxy({}, { get: () => () => { throw new Error(`${name} must not be used`); } });
    const { service } = await setup({ labRun: guard("labRun"), attempt: guard("attempt"), progress: guard("progress"), assignmentSubmission: guard("assignmentSubmission") });
    await expect(service.submit("a1", student(), answers)).resolves.toMatchObject({ replayed: false });
  });

  it("shows the teacher what was asked, each submission and who is still missing, and only to the class owner", async () => {
    const { service, db } = await setup();
    await service.submit("a1", student(), answers);
    const board = await service.list("c1", "a1", teacher());
    expect(board.assignment.requirements).toHaveLength(3);
    expect(board.submissions).toHaveLength(1);
    expect(board.submissions[0].student).toMatchObject({ fullName: "An" });
    expect(board.pending).toEqual([{ id: "s2", fullName: "Bình", username: "binh" }]);
    db.classroom.findUnique.mockResolvedValueOnce({ id: "c1", teacherId: "someone-else" });
    await expect(service.list("c1", "a1", teacher())).rejects.toMatchObject({ response: { code: "CLASS_ACCESS_DENIED" } });
  });

  it("a teacher comment moves the submission to REVIEWED and can be edited", async () => {
    const { service, stored } = await setup();
    const { submission } = await service.submit("a1", student(), answers);
    const reviewed = await service.review("c1", "a1", submission.id, teacher(), { feedback: "Tốt. Hãy nêu số đo của em." });
    expect(reviewed.submission).toMatchObject({ status: "REVIEWED", feedback: "Tốt. Hãy nêu số đo của em." });
    expect(stored[0]).toMatchObject({ reviewedById: "t1" });
    expect((await service.review("c1", "a1", submission.id, teacher(), { feedback: "Đã sửa." })).submission.feedback).toBe("Đã sửa.");
    await expect(service.review("c1", "a1", "missing", teacher(), { feedback: "x" })).rejects.toMatchObject({ response: { code: "SUBMISSION_NOT_FOUND" } });
    await expect(service.review("c1", "a1", submission.id, teacher(), { feedback: "" })).rejects.toThrow();
  });
});

describe("assigning a Class Explore resource", () => {
  async function assigning(patch: (read: any) => Record<string, unknown> = () => ({})) {
    const { read } = await world();
    const content = await buildExploreResource(read, input);
    const created: any[] = [];
    const tx: any = {
      ...read,
      $executeRaw: vi.fn(),
      classResource: { findFirst: vi.fn(async ({ where }: any) => (where.id === "res-1" && where.kind === "EXPLORE_LAB" && where.status === "PUBLISHED" ? { id: "res-1", version: 1, title: "Đo pH hai mẫu", content } : null)) },
      enrollment: { findMany: vi.fn(async () => [{ studentId: "s1" }, { studentId: "s2" }]) },
      assignment: { findFirst: vi.fn(async () => null), create: vi.fn(async ({ data }: any) => { created.push(data); return { id: "a1", ...data, _count: { targets: 2 } }; }) },
      notification: { createMany: vi.fn(async () => ({ count: 2 })) },
      ...patch(read),
    };
    const db: any = { classroom: { findUnique: vi.fn(async () => ({ id: "c1", teacherId: "t1", status: "ACTIVE", grade: 8, name: "8A" })) }, $transaction: async (work: any) => work(tx) };
    return { service: new AssignmentsService(db), tx, created };
  }
  const req = { user: { sub: "t1", role: "TEACHER" }, headers: {} };
  const body = { contentType: "explore_lab", contentId: "acid-base-indicators", exploreResourceId: "res-1", studentIds: [] };

  it("pins the snapshot on the assignment, needs no due date, and writes no Guided run data", async () => {
    const { service, created } = await assigning();
    const result = await service.assign("c1", req, body);
    expect(result).toMatchObject({ recipientCount: 2, assignment: { contentType: "explore_lab", explore: { resourceId: "res-1", templateId: "ph-two", requirementCount: 3 } } });
    const [data] = created;
    expect(verifyExploreSnapshot(data.exploreSnapshot)).toMatchObject({ resourceId: "res-1", labId: "acid-base-indicators" });
    expect(data.contentVersion).toBe(data.exploreSnapshot.contentDigest);
    expect(data).not.toHaveProperty("labExecution");
    expect(data).not.toHaveProperty("classLabSnapshot");
    expect(data.dueDate).toBeNull();
    expect(JSON.stringify(result)).not.toContain("effectiveConfig\":{");
  });

  it("refuses an unpublished resource, the wrong Lab, another grade, and the same assignment twice", async () => {
    await expect((await assigning()).service.assign("c1", req, { ...body, exploreResourceId: "draft-1" })).rejects.toMatchObject({ response: { code: "CONTENT_NOT_PUBLISHED" } });
    await expect((await assigning()).service.assign("c1", req, { ...body, contentId: "other-lab" })).rejects.toMatchObject({ response: { code: "CLASS_LAB_SOURCE_MISMATCH" } });
    const wrongGrade = await assigning((read) => ({ lab: { findFirst: read.lab.findFirst, findUnique: vi.fn(async () => ({ grade: 9 })) } }));
    await expect(wrongGrade.service.assign("c1", req, body)).rejects.toMatchObject({ response: { code: "ASSIGNMENT_GRADE_MISMATCH" } });
    const twice = await assigning(() => ({ assignment: { findFirst: vi.fn(async () => ({ id: "a0" })), create: vi.fn() } }));
    await expect(twice.service.assign("c1", req, body)).rejects.toMatchObject({ response: { code: "ASSIGNMENT_DUPLICATE" } });
  });
});
