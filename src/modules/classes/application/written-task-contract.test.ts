import { beforeEach, describe, expect, it } from "vitest";
import { normalizeResourceContent, parseResourceCsv, resourceItemCount, studentResource, studentWrittenTaskContent } from "./class-resource-contract";
import { ClassResourcesService } from "./class-resources.service";
import { resourceFingerprintItems } from "../../ai/application/question-fingerprints";

const TEACHER_ONLY = ["referenceAnswer", "anchors", "commonPhrases", "gradingNotes"];

/** Recursive key scan: true when any object at any depth owns one of the keys. */
function keysAnywhere(value: unknown, keys: string[]): string[] {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (Array.isArray(node)) return node.forEach(walk);
    if (node && typeof node === "object") {
      for (const [key, child] of Object.entries(node)) {
        if (keys.includes(key)) found.add(key);
        walk(child);
      }
    }
  };
  walk(value);
  return [...found];
}

const criterion = (patch: Record<string, unknown> = {}) => ({
  code: "GIAI_THICH",
  description: "Giải thích đúng hiện tượng",
  maxPoints: 2,
  anchors: [{ points: 0, description: "Không giải thích" }, { points: 1, description: "Đúng một phần" }, { points: 2, description: "Đầy đủ" }],
  ...patch,
});
const prompt = (patch: Record<string, unknown> = {}) => ({
  prompt: "Giải thích vì sao dây tóc bóng đèn nóng lên khi có dòng điện chạy qua.",
  maxChars: 800,
  referenceAnswer: "Do tác dụng nhiệt của dòng điện.",
  commonPhrases: ["tác dụng nhiệt"],
  criteria: [criterion()],
  ...patch,
});
const task = (patch: Record<string, unknown> = {}) => ({ prompts: [prompt()], ...patch });

const rubricError = (raw: unknown) => {
  try {
    normalizeResourceContent("WRITTEN_TASK", raw);
    return null;
  } catch (error: any) {
    return error.response;
  }
};
const paths = (raw: unknown) => (rubricError(raw)?.details ?? []).map((d: any) => d.path);

describe("WRITTEN_TASK content contract (RUBRIC_INVALID)", () => {
  it("normalizes a valid task and generates prompt ids on the server", () => {
    const content: any = normalizeResourceContent("WRITTEN_TASK", task());
    expect(content.prompts[0]).toMatchObject({ prompt: prompt().prompt, maxChars: 800, referenceAnswer: "Do tác dụng nhiệt của dòng điện.", commonPhrases: ["tác dụng nhiệt"] });
    expect(content.prompts[0].id).toMatch(/[0-9a-f-]{36}/);
    expect(content.prompts[0].criteria[0].anchors).toHaveLength(3);
  });

  it("returns 400 RUBRIC_INVALID with field-level details", () => {
    const error = rubricError(task({ prompts: [] }));
    expect(error).toMatchObject({ code: "RUBRIC_INVALID" });
    expect(error.details[0]).toEqual({ path: "prompts", message: expect.any(String) });
  });

  it("enforces prompt and criteria limits", () => {
    expect(paths(task({ prompts: Array.from({ length: 6 }, () => prompt()) }))).toContain("prompts");
    expect(paths(task({ prompts: [prompt({ prompt: "x".repeat(2001) })] }))).toContain("prompts.0.prompt");
    expect(rubricError(task({ prompts: [prompt({ prompt: "x".repeat(2000) })] }))).toBeNull();
    expect(paths(task({ prompts: [prompt({ maxChars: 99 })] }))).toContain("prompts.0.maxChars");
    expect(paths(task({ prompts: [prompt({ maxChars: 5001 })] }))).toContain("prompts.0.maxChars");
    expect(paths(task({ prompts: [prompt({ maxChars: 150.5 })] }))).toContain("prompts.0.maxChars");
    expect(rubricError(task({ prompts: [prompt({ maxChars: 100 })] }))).toBeNull();
    expect(paths(task({ prompts: [prompt({ criteria: [] })] }))).toContain("prompts.0.criteria");
    expect(paths(task({ prompts: [prompt({ criteria: Array.from({ length: 7 }, (_, i) => criterion({ code: `C${i}X` })) })] }))).toContain("prompts.0.criteria");
    expect(paths(task({ prompts: [prompt({ referenceAnswer: "x".repeat(2001) })] }))).toContain("prompts.0.referenceAnswer");
    expect(paths(task({ prompts: [prompt({ commonPhrases: Array.from({ length: 21 }, () => "a") })] }))).toContain("prompts.0.commonPhrases");
  });

  it("enforces criterion code format and uniqueness within a prompt", () => {
    expect(paths(task({ prompts: [prompt({ criteria: [criterion({ code: "giai_thich" })] })] }))).toContain("prompts.0.criteria.0.code");
    expect(paths(task({ prompts: [prompt({ criteria: [criterion(), criterion()] })] }))).toContain("prompts.0.criteria.1.code");
    expect(rubricError(task({ prompts: [prompt({ criteria: [criterion(), criterion({ code: "CONG_THUC" })] })] }))).toBeNull();
  });

  it("enforces maxPoints 1-10 on the half-point grid", () => {
    const withMax = (maxPoints: number) => criterion({ maxPoints, anchors: [{ points: 0, description: "a" }, { points: maxPoints, description: "b" }] });
    expect(rubricError(task({ prompts: [prompt({ criteria: [withMax(1)] })] }))).toBeNull();
    expect(rubricError(task({ prompts: [prompt({ criteria: [withMax(9.5)] })] }))).toBeNull();
    expect(paths(task({ prompts: [prompt({ criteria: [withMax(0.5)] })] }))).toContain("prompts.0.criteria.0.maxPoints");
    expect(paths(task({ prompts: [prompt({ criteria: [withMax(10.5)] })] }))).toContain("prompts.0.criteria.0.maxPoints");
    expect(paths(task({ prompts: [prompt({ criteria: [withMax(2.25)] })] }))).toContain("prompts.0.criteria.0.maxPoints");
  });

  it("enforces anchors: 2-5, half points in [0, maxPoints], strictly ascending, first 0 and last maxPoints", () => {
    const anchors = (...points: number[]) => criterion({ anchors: points.map((p) => ({ points: p, description: `mốc ${p}` })) });
    const check = (c: unknown) => paths(task({ prompts: [prompt({ criteria: [c] })] }));
    expect(check(anchors(0))).toContain("prompts.0.criteria.0.anchors");
    expect(check(anchors(0, 0.5, 1, 1.5, 1.75, 2))).toContain("prompts.0.criteria.0.anchors");
    expect(check(anchors(0, 1.25, 2))).toContain("prompts.0.criteria.0.anchors.1.points");
    expect(check(anchors(0, 1, 1, 2))).toContain("prompts.0.criteria.0.anchors.2.points");
    expect(check(anchors(0, 1.5, 1, 2))).toContain("prompts.0.criteria.0.anchors.2.points");
    expect(check(anchors(0.5, 2))).toContain("prompts.0.criteria.0.anchors.0.points");
    expect(check(anchors(0, 1.5))).toContain("prompts.0.criteria.0.anchors.1.points");
    expect(check(anchors(0, 3))).toContain("prompts.0.criteria.0.anchors.1.points");
    expect(check(criterion({ anchors: [{ points: 0, description: "" }, { points: 2, description: "b" }] }))).toContain("prompts.0.criteria.0.anchors.0.description");
    expect(check(criterion({ anchors: [{ points: 0, description: "x".repeat(301) }, { points: 2, description: "b" }] }))).toContain("prompts.0.criteria.0.anchors.0.description");
    expect(rubricError(task({ prompts: [prompt({ criteria: [anchors(0, 0.5, 1, 1.5, 2)] })] }))).toBeNull();
  });

  it("rejects unknown fields, including client-sent ids (ids are server-generated)", () => {
    expect(paths(task({ prompts: [{ ...prompt(), id: "client-id" }] }))).toContain("prompts.0");
    expect(paths(task({ prompts: [prompt({ gradingNotes: "x" })] }))).toContain("prompts.0");
    expect(paths({ ...task(), extra: 1 })).toContain("");
  });
});

describe("studentWrittenTaskContent (allowlist)", () => {
  it("keeps prompt, maxChars and criteria code/description/maxPoints only", () => {
    const content: any = normalizeResourceContent("WRITTEN_TASK", task());
    const view = studentWrittenTaskContent({ ...content, prompts: content.prompts.map((p: any) => ({ ...p, gradingNotes: "secret" })) });
    expect(view).toEqual({
      prompts: [{ id: content.prompts[0].id, prompt: prompt().prompt, maxChars: 800, criteria: [{ code: "GIAI_THICH", description: "Giải thích đúng hiện tượng", maxPoints: 2 }] }],
    });
    expect(keysAnywhere(view, TEACHER_ONLY)).toEqual([]);
    expect(keysAnywhere(studentResource("WRITTEN_TASK", content), TEACHER_ONLY)).toEqual([]);
  });

  it("is safe on malformed content", () => {
    expect(studentWrittenTaskContent(null)).toEqual({ prompts: [] });
    expect(studentWrittenTaskContent({ prompts: [{ criteria: "x" }] })).toEqual({ prompts: [{ id: "", prompt: "", maxChars: 0, criteria: [] }] });
  });

  it("leaves other kinds unchanged", () => {
    expect(studentResource("STUDY_QUIZ", { questions: [] })).toEqual({ questions: [] });
  });
});

describe("related helpers", () => {
  it("counts prompts for WRITTEN_TASK and excludes it from fingerprints and CSV import", () => {
    const content: any = normalizeResourceContent("WRITTEN_TASK", task({ prompts: [prompt(), prompt()] }));
    expect(resourceItemCount("WRITTEN_TASK", content)).toBe(2);
    expect(resourceItemCount("DECK", { cards: [{}] })).toBe(1);
    expect(resourceFingerprintItems("WRITTEN_TASK", { questions: [{ id: "q", prompt: "x" }], prompts: content.prompts })).toEqual([]);
    expect(() => parseResourceCsv("WRITTEN_TASK", "prompt\r\nx\r\n")).toThrow(expect.objectContaining({ response: expect.objectContaining({ code: "IMPORT_KIND_UNSUPPORTED" }) }));
  });
});

// ---------------------------------------------------------------------------------------------------------------
// Service lifecycle on an in-memory stand-in (no database): draft, publish, revise, member read, practice, CSV.
type Row = Record<string, any>;
let seq = 0;
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((c) => matches(row, c));
    const value = row[key];
    if (cond && typeof cond === "object" && !Array.isArray(cond) && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("not" in cond) return value !== cond.not;
      return false;
    }
    return value === cond;
  });
}
const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });
function table(defaults: () => Row = () => ({})) {
  const t = {
    rows: [] as Row[],
    async findUnique({ where, select }: Row) { const k = where.actorId_key ?? where.resourceId_studentId ?? where.classId_studentId ?? where; const r = t.rows.find((x) => matches(x, k)); return r ? pick(r, select) : null; },
    async findFirst({ where, select }: Row = {}) { const r = t.rows.find((x) => matches(x, where)); return r ? pick(r, select) : null; },
    async findMany({ where, select }: Row = {}) { return t.rows.filter((x) => matches(x, where)).map((r) => pick(r, select)); },
    async count({ where }: Row = {}) { return t.rows.filter((x) => matches(x, where)).length; },
    async create({ data, select }: Row) { const r = { id: `id-${++seq}`, createdAt: new Date(), ...defaults(), ...data }; t.rows.push(r); return pick(r, select); },
    async createMany({ data }: Row) { for (const d of data) t.rows.push({ id: `id-${++seq}`, ...d }); return { count: data.length }; },
    async update({ where, data }: Row) { const r = t.rows.find((x) => matches(x, where.actorId_key ?? where)); Object.assign(r!, data); return { ...r }; },
    async updateMany({ where, data }: Row) { const hit = t.rows.filter((x) => matches(x, where)); hit.forEach((x) => Object.assign(x, data)); return { count: hit.length }; },
    async deleteMany({ where }: Row) { const before = t.rows.length; t.rows = t.rows.filter((x) => !matches(x, where)); return { count: before - t.rows.length }; },
    async aggregate({ where }: Row) { const list = t.rows.filter((x) => matches(x, where)); return { _max: { version: list.length ? Math.max(...list.map((x) => x.version)) : null } }; },
  };
  return t;
}
let db: any;
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const STUDENT = { sub: "student-1", role: "STUDENT" };
const req = (user = OWNER) => ({ user, headers: { "idempotency-key": `key-${++seq}-abcdefgh` } });
const service = () => new ClassResourcesService(db);

beforeEach(() => {
  db = {
    classResource: table(() => ({ version: 1, status: "DRAFT", publishedAt: null, archivedAt: null })),
    classroom: table(), lesson: table(), lessonStep: table(), auditLog: table(), notification: table(), enrollment: table(),
    idempotencyRecord: table(), questionFingerprint: table(), classResourcePractice: table(),
    async $executeRaw() { return 0; },
    async $transaction(fn: (tx: any) => Promise<any>) { return fn(db); },
  };
  db.classroom.rows.push({ id: "class-a", teacherId: OWNER.sub, status: "ACTIVE", name: "A" });
  db.lesson.rows.push({ id: "lesson-1", title: "Bài 23", scope: "SHARED_LIBRARY", status: "published", synthetic: false, authorId: "admin" });
  db.enrollment.rows.push({ classId: "class-a", studentId: STUDENT.sub, status: "approved" });
});

describe("WRITTEN_TASK through ClassResourcesService", () => {
  const body = (patch: Record<string, unknown> = {}) => ({ kind: "WRITTEN_TASK", title: "Bài tự luận 1", lessonId: "lesson-1", content: task(), ...patch });

  it("creates a draft, rejects an invalid rubric, publishes, and revise creates version n+1", async () => {
    const created: any = await service().create("class-a", req(), body());
    expect(created).toMatchObject({ kind: "WRITTEN_TASK", status: "DRAFT", version: 1, duplicateWarnings: [] });
    expect(db.auditLog.rows.find((a: Row) => a.action === "class_resource.create").after).toMatchObject({ itemCount: 1 });
    expect(db.questionFingerprint.rows).toHaveLength(0);
    await expect(service().create("class-a", req(), body({ content: task({ prompts: [prompt({ criteria: [] })] }) }))).rejects.toMatchObject({ response: { code: "RUBRIC_INVALID" } });

    await service().publish("class-a", created.id, req());
    await expect(service().updateDraft("class-a", created.id, req(), body())).rejects.toMatchObject({ response: { code: "RESOURCE_VERSION_IMMUTABLE" } });
    const draft: any = await service().revise("class-a", created.id, req());
    expect(draft).toMatchObject({ kind: "WRITTEN_TASK", version: 2, status: "DRAFT" });
    expect(draft.content.prompts[0].referenceAnswer).toBe("Do tác dụng nhiệt của dòng điện.");
  });

  it("member reads expose only the allowlisted content (recursive key scan), owner reads keep the rubric", async () => {
    const created: any = await service().create("class-a", req(), body());
    await service().publish("class-a", created.id, req());
    const list = await service().list("class-a", { user: STUDENT });
    const detail = await service().detail("class-a", created.id, { user: STUDENT });
    expect(list).toHaveLength(1);
    expect(keysAnywhere(list, TEACHER_ONLY)).toEqual([]);
    expect(keysAnywhere(detail, TEACHER_ONLY)).toEqual([]);
    expect((detail as any).content.prompts[0].criteria[0]).toEqual({ code: "GIAI_THICH", description: "Giải thích đúng hiện tượng", maxPoints: 2 });
    expect((detail as any).practice).toBeNull();
    const ownerView: any = await service().detail("class-a", created.id, { user: OWNER });
    expect(keysAnywhere(ownerView, TEACHER_ONLY).sort()).toEqual(["anchors", "commonPhrases", "referenceAnswer"]);
  });

  it("rejects practice state and CSV import for WRITTEN_TASK", async () => {
    const created: any = await service().create("class-a", req(), body());
    await service().publish("class-a", created.id, req());
    await expect(service().savePractice("class-a", created.id, { user: STUDENT }, { state: { a: 1 } })).rejects.toMatchObject({ status: 403 });
    await expect(service().previewImport("class-a", req(), { kind: "WRITTEN_TASK", filename: "a.csv", csv: "x" })).rejects.toMatchObject({ status: 400, response: { code: "IMPORT_KIND_UNSUPPORTED" } });
    await expect(service().importCsv("class-a", req(), { kind: "WRITTEN_TASK", title: "x", lessonId: "lesson-1", filename: "a.csv", csv: "x" })).rejects.toMatchObject({ response: { code: "IMPORT_KIND_UNSUPPORTED" } });
  });

  it("draft is invisible to members until published", async () => {
    await service().create("class-a", req(), body());
    expect(await service().list("class-a", { user: STUDENT })).toEqual([]);
  });
});
