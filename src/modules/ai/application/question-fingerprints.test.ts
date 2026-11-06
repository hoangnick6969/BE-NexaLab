import { beforeEach, describe, expect, it } from "vitest";
import { ClassResourcesService } from "../../classes/application/class-resources.service";
import {
  backfillQuestionFingerprints,
  lessonFingerprintItems,
  loadQdupCorpus,
  QDUP_CORPUS_LIMIT,
  qdupFlag,
  qdupHash,
  qdupMatch,
  qdupNormalize,
  qdupTrigrams,
  reassignClassFingerprints,
  resourceFingerprintItems,
  syncClassResourceFingerprints,
  syncLibraryLessonFingerprints,
  type QdupCorpusRow,
} from "./question-fingerprints";
import { jaccard } from "./resource-items";

// ---------------------------------------------------------------------------------------------------------------
// In-memory stand-in for the Prisma calls used here. $transaction snapshots every table and restores it when the
// callback throws, so the rollback fixture proves that fingerprints commit or roll back with their source.
type Row = Record<string, any>;
let seq = 0;
const nextId = () => `id-${String(++seq).padStart(6, "0")}`;

function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(where).every(([key, cond]) => {
    if (key === "OR") return (cond as Row[]).some((c) => matches(row, c));
    if (key === "NOT") return !matches(row, cond);
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
    async findUnique({ where, select }: Row) { const r = t.rows.find((x) => matches(x, where)); return r ? pick(r, select) : null; },
    async findFirst({ where, select }: Row = {}) { const r = t.rows.find((x) => matches(x, where)); return r ? pick(r, select) : null; },
    async findMany({ where, select, distinct }: Row = {}) {
      let list = t.rows.filter((x) => matches(x, where));
      if (distinct) { const seen = new Set<string>(); list = list.filter((x) => { const k = distinct.map((d: string) => x[d]).join("|"); if (seen.has(k)) return false; seen.add(k); return true; }); }
      return list.map((r) => pick(r, select));
    },
    async count({ where }: Row = {}) { return t.rows.filter((x) => matches(x, where)).length; },
    async create({ data, select }: Row) { const r = { id: nextId(), createdAt: new Date(), ...defaults(), ...data }; t.rows.push(r); return pick(r, select); },
    async createMany({ data }: Row) { for (const d of data) t.rows.push({ id: nextId(), createdAt: new Date(), ...defaults(), ...d }); return { count: data.length }; },
    async update({ where, data }: Row) {
      const flat = where.actorId_key ? where.actorId_key : where;
      const r = t.rows.find((x) => matches(x, flat));
      if (!r) throw new Error("not found");
      Object.assign(r, data);
      return { ...r };
    },
    async updateMany({ where, data }: Row) { const hit = t.rows.filter((x) => matches(x, where)); hit.forEach((x) => Object.assign(x, data)); return { count: hit.length }; },
    async deleteMany({ where }: Row) { const before = t.rows.length; t.rows = t.rows.filter((x) => !matches(x, where)); return { count: before - t.rows.length }; },
    async aggregate({ where }: Row) { const list = t.rows.filter((x) => matches(x, where)); return { _max: { version: list.length ? Math.max(...list.map((x) => x.version)) : null } }; },
  };
  return t;
}
function makeDb() {
  const db: Row = {
    questionFingerprint: table(),
    classResource: table(() => ({ version: 1, status: "DRAFT", publishedAt: null, archivedAt: null })),
    classroom: table(),
    lesson: table(),
    lessonStep: table(),
    auditLog: table(),
    notification: table(),
    enrollment: table(),
    idempotencyRecord: table(),
    async $executeRaw() { return 0; },
    async $transaction(fn: (tx: any) => Promise<any>) {
      const names = Object.keys(db).filter((k) => db[k]?.rows);
      const snapshot = Object.fromEntries(names.map((n) => [n, db[n].rows.map((r: Row) => ({ ...r }))]));
      try {
        return await fn(db);
      } catch (error) {
        for (const n of names) db[n].rows = snapshot[n];
        throw error;
      }
    },
  };
  // Lesson check used by class resources (assertClassLesson) reads `lesson.findFirst` with an OR clause.
  return db as any;
}

let db: any;
const OWNER = { sub: "teacher-owner", role: "TEACHER" };
const req = (key = `key-${++seq}-abcdefgh`) => ({ user: OWNER, headers: { "idempotency-key": key } });
const fingerprints = () => db.questionFingerprint.rows as Row[];

beforeEach(() => {
  db = makeDb();
  db.classroom.rows.push(
    { id: "class-a", teacherId: "teacher-owner", status: "ACTIVE", name: "A" },
    { id: "class-b", teacherId: "teacher-owner", status: "ACTIVE", name: "B" },
    { id: "class-x", teacherId: "teacher-outsider", status: "ACTIVE", name: "X" },
  );
  db.lesson.rows.push(
    { id: "lesson-lib", title: "Mạch điện", scope: "SHARED_LIBRARY", status: "published", synthetic: false, authorId: "admin" },
    { id: "lesson-synthetic", title: "Fixture", scope: "SHARED_LIBRARY", status: "published", synthetic: true, authorId: "admin" },
    { id: "lesson-private", title: "Riêng", scope: "TEACHER_PRIVATE", status: "published", synthetic: false, authorId: "teacher-owner" },
  );
  const quiz = (id: string, prompt: string) => ({ id, prompt, options: [{ id: `${id}-a`, text: "A" }, { id: `${id}-b`, text: "B" }], answerOptionId: `${id}-a` });
  for (const lessonId of ["lesson-lib", "lesson-synthetic", "lesson-private"])
    db.lessonStep.rows.push(
      { id: `${lessonId}-quiz`, lessonId, type: "QUIZ", position: 40, config: { questions: [quiz("q1", "Dòng điện là gì?")], passThreshold: 50 } },
      { id: `${lessonId}-ex`, lessonId, type: "BASIC_EXERCISE", position: 30, config: { questions: [{ ...quiz("e1", "Đơn vị của cường độ dòng điện?"), correctOptionId: "e1-a" }], passThreshold: 60 } },
      { id: `${lessonId}-read`, lessonId, type: "READING", position: 10, config: { html: "<p>Không phải câu hỏi</p>" } },
    );
});

// ---------------------------------------------------------------------------------------------------------------
describe("qdup@1 fixtures (similarity-algorithms.md)", () => {
  const row = (text: string, patch: Partial<QdupCorpusRow> = {}): QdupCorpusRow => {
    const normalized = qdupNormalize(text);
    return { sourceKind: "CLASS_RESOURCE", sourceId: "res-1", itemId: "q1", classId: "class-a", normalizedText: normalized, normalizedHash: qdupHash(normalized), title: "Đề cũ", ...patch };
  };

  it("treats case-only and whitespace-only differences as EXACT", () => {
    expect(qdupMatch("DÒNG điện là gì?", [row("dòng điện là gì")])[0]).toMatchObject({ level: "EXACT", score: 1 });
    expect(qdupMatch("  Dòng   điện  là gì ", [row("Dòng điện là gì?")])[0]).toMatchObject({ level: "EXACT" });
  });

  it("keeps diacritics: lực vs lúc is not EXACT", () => {
    expect(qdupMatch("lực", [row("lúc")]).filter((m) => m.level === "EXACT")).toEqual([]);
  });

  it("uses trigrams padded with one space each side", () => {
    expect(qdupTrigrams("ab")).toEqual(new Set([" ab", "ab "]));
  });

  // Distinct characters: padded prefix of length m vs full length n shares m-1 grams out of n+1.
  it("Jaccard 0.85 is NEAR and 0.84 is not", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const [n85, m85, n84, m84] = [19, 18, 24, 22];
    expect(jaccard(qdupTrigrams(alphabet.slice(0, m85)), qdupTrigrams(alphabet.slice(0, n85)))).toBe(0.85);
    expect(jaccard(qdupTrigrams(alphabet.slice(0, m84)), qdupTrigrams(alphabet.slice(0, n84)))).toBe(0.84);
    expect(qdupMatch(alphabet.slice(0, m85), [row(alphabet.slice(0, n85))])[0]).toMatchObject({ level: "NEAR", score: 0.85 });
    expect(qdupMatch(alphabet.slice(0, m84), [row(alphabet.slice(0, n84))])).toEqual([]);
  });

  it("returns at most 3 matches, exact first, with the source title", () => {
    const corpus = [row("dòng điện là gì", { sourceId: "r1", title: "Một" }), row("dòng điện là gì vậy", { sourceId: "r2" }), row("dòng điện là gì", { sourceId: "r3", title: "Ba" }),
      row("dòng điện là gì", { sourceId: "r4", title: "Bốn" })];
    const result = qdupMatch("Dòng điện là gì?", corpus);
    expect(result).toHaveLength(3);
    expect(result.map((m) => m.level)).toEqual(["EXACT", "EXACT", "EXACT"]);
    expect(result[0].source).toMatchObject({ kind: "CLASS_RESOURCE", resourceId: "r1", title: "Một", classId: "class-a", itemId: "q1" });
  });

  it("maps flags: same class -> *_DUPLICATE; other own class or library -> *_ELSEWHERE", () => {
    const [exactSame] = qdupMatch("Dòng điện là gì?", [row("Dòng điện là gì?")]);
    expect(qdupFlag(exactSame, "class-a")).toBe("EXACT_DUPLICATE");
    expect(qdupFlag(exactSame, "class-b")).toBe("EXACT_DUPLICATE_ELSEWHERE");
    const [library] = qdupMatch("Dòng điện là gì?", [row("Dòng điện là gì?", { sourceKind: "LIBRARY_LESSON", sourceId: "lesson-lib", classId: null })]);
    expect(library.source).toMatchObject({ kind: "LIBRARY_LESSON", lessonId: "lesson-lib" });
    expect(qdupFlag(library, "class-a")).toBe("EXACT_DUPLICATE_ELSEWHERE");
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    const [near] = qdupMatch(alphabet.slice(0, 18), [row(alphabet.slice(0, 19))]);
    expect(qdupFlag(near, "class-a")).toBe("NEAR_DUPLICATE");
    expect(qdupFlag(near, null)).toBe("NEAR_DUPLICATE_ELSEWHERE");
  });

  it("supports exact-only matching for a truncated corpus", () => {
    const alphabet = "abcdefghijklmnopqrstuvwxyz";
    expect(qdupMatch(alphabet.slice(0, 18), [row(alphabet.slice(0, 19))], { exactOnly: true })).toEqual([]);
  });
});

describe("item extraction", () => {
  it("reads question prompts or card fronts with their content ids", () => {
    expect(resourceFingerprintItems("TEST", { questions: [{ id: "q1", prompt: "A?" }, { prompt: "no id" }] })).toEqual([{ itemId: "q1", text: "A?" }]);
    expect(resourceFingerprintItems("DECK", { cards: [{ id: "c1", front: "F", back: "B" }] })).toEqual([{ itemId: "c1", text: "F" }]);
  });

  it("reads only QUIZ and BASIC_EXERCISE steps, keyed <stepId>:<questionId>", () => {
    const items = lessonFingerprintItems(db.lessonStep.rows.filter((s: Row) => s.lessonId === "lesson-lib"));
    expect(items).toEqual([{ itemId: "lesson-lib-quiz:q1", text: "Dòng điện là gì?" }, { itemId: "lesson-lib-ex:e1", text: "Đơn vị của cường độ dòng điện?" }]);
  });
});

describe("fingerprint sync", () => {
  it("keeps library rows only for published, non-synthetic SHARED_LIBRARY lessons", async () => {
    for (const id of ["lesson-lib", "lesson-synthetic", "lesson-private"]) await syncLibraryLessonFingerprints(db, id);
    expect(fingerprints().map((f) => f.sourceId)).toEqual(["lesson-lib", "lesson-lib"]);
    expect(fingerprints()[0]).toMatchObject({ sourceKind: "LIBRARY_LESSON", sourceVersion: 1, ownerTeacherId: null, classId: null, algorithm: "qdup@1" });
    db.lesson.rows[0].status = "quarantined";
    expect(await syncLibraryLessonFingerprints(db, "lesson-lib")).toMatchObject({ deleted: 2, created: 0 });
    expect(fingerprints()).toEqual([]);
  });

  it("is a no-op when nothing changed and replaces only changed rows", async () => {
    db.classResource.rows.push({ id: "res-1", classId: "class-a", kind: "TEST", status: "DRAFT", version: 1, content: { questions: [{ id: "q1", prompt: "A?" }, { id: "q2", prompt: "B?" }] } });
    expect(await syncClassResourceFingerprints(db, "res-1")).toEqual({ created: 2, deleted: 0, total: 2 });
    const firstIds = fingerprints().map((f) => f.id);
    expect(await syncClassResourceFingerprints(db, "res-1")).toEqual({ created: 0, deleted: 0, total: 2 });
    expect(fingerprints().map((f) => f.id)).toEqual(firstIds);
    db.classResource.rows[0].content.questions[1].prompt = "C?";
    expect(await syncClassResourceFingerprints(db, "res-1")).toEqual({ created: 1, deleted: 1, total: 2 });
    expect(fingerprints()[0]).toMatchObject({ ownerTeacherId: "teacher-owner", classId: "class-a", sourceVersion: 1 });
  });

  it("follows an admin class reassignment", async () => {
    db.classResource.rows.push({ id: "res-1", classId: "class-a", kind: "DECK", status: "PUBLISHED", version: 2, content: { cards: [{ id: "c1", front: "Ampe kế", back: "x" }] } });
    await syncClassResourceFingerprints(db, "res-1");
    await reassignClassFingerprints(db, "class-a", "teacher-new");
    expect(fingerprints()[0].ownerTeacherId).toBe("teacher-new");
    db.classroom.rows[0].teacherId = "teacher-new";
    expect(await syncClassResourceFingerprints(db, "res-1")).toMatchObject({ created: 0, deleted: 0 });
  });

  it("never returns another teacher's rows, but includes the teacher's other classes and the library", async () => {
    db.classResource.rows.push(
      { id: "res-a", title: "Đề lớp A", classId: "class-a", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: "Dòng điện là gì?" }] } },
      { id: "res-b", title: "Đề lớp B", classId: "class-b", kind: "TEST", status: "DRAFT", version: 1, content: { questions: [{ id: "q", prompt: "Dòng điện là gì?" }] } },
      { id: "res-x", title: "Đề người khác", classId: "class-x", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: "Dòng điện là gì?" }] } },
    );
    for (const id of ["res-a", "res-b", "res-x"]) await syncClassResourceFingerprints(db, id);
    await syncLibraryLessonFingerprints(db, "lesson-lib");
    const { corpus, truncated } = await loadQdupCorpus(db, "teacher-owner");
    expect(truncated).toBe(false);
    expect(corpus.map((r) => r.sourceId).sort()).toEqual(["lesson-lib", "lesson-lib", "res-a", "res-b"]);
    const found = qdupMatch("Dòng điện là gì?", corpus);
    expect(found.map((m) => m.source.title)).not.toContain("Đề người khác");
    expect(found.map((m) => qdupFlag(m, "class-a")).sort()).toEqual(["EXACT_DUPLICATE", "EXACT_DUPLICATE_ELSEWHERE", "EXACT_DUPLICATE_ELSEWHERE"]);
    expect(found.find((m) => m.source.kind === "LIBRARY_LESSON")?.source.title).toBe("Mạch điện");
  });

  it("loads only exact hashes when the corpus exceeds the limit", async () => {
    for (let i = 0; i <= QDUP_CORPUS_LIMIT; i++)
      db.questionFingerprint.rows.push({ id: `f${i}`, sourceKind: "LIBRARY_LESSON", sourceId: "lesson-lib", itemId: `i${i}`, classId: null, normalizedText: `t${i}`, normalizedHash: `h${i}`, algorithm: "qdup@1" });
    const { corpus, truncated } = await loadQdupCorpus(db, "teacher-owner", ["h5"]);
    expect(truncated).toBe(true);
    expect(corpus.map((r) => r.itemId)).toEqual(["i5"]);
  });
});

describe("ClassResource lifecycle keeps fingerprints atomic", () => {
  const service = () => new ClassResourcesService(db);
  const testBody = (prompt = "Dòng điện là gì?") => ({ kind: "TEST", title: "Đề 1", lessonId: "lesson-lib", content: { questions: [{ prompt, options: ["A", "B"], correctOption: 0 }] } });

  it("create, update-draft, publish, revise and archive change fingerprints in the same transaction", async () => {
    const created: any = await service().create("class-a", req(), testBody());
    expect(fingerprints()).toHaveLength(1);
    expect(fingerprints()[0]).toMatchObject({ sourceId: created.id, sourceVersion: 1, classId: "class-a", ownerTeacherId: "teacher-owner" });

    await service().updateDraft("class-a", created.id, req(), testBody("Cường độ dòng điện đo bằng gì?"));
    expect(fingerprints().map((f) => f.normalizedText)).toEqual(["cường độ dòng điện đo bằng gì"]);

    await service().publish("class-a", created.id, req());
    expect(fingerprints()).toHaveLength(1);

    const draft: any = await service().revise("class-a", created.id, req());
    expect(fingerprints().map((f) => [f.sourceId, f.sourceVersion]).sort()).toEqual([[created.id, 1], [draft.id, 2]].sort());

    await service().archive("class-a", created.id, req());
    expect(fingerprints().map((f) => f.sourceId)).toEqual([draft.id]);
  });

  it("CSV import adds fingerprints", async () => {
    const csv = "prompt,optionA,optionB,optionC,optionD,correctOption,explanation\r\nCâu một?,A,B,,,A,\r\n";
    const result: any = await service().importCsv("class-a", req(), { kind: "TEST", title: "CSV", lessonId: "lesson-lib", filename: "de.csv", csv });
    expect(fingerprints().map((f) => f.sourceId)).toEqual([result.resource.id]);
  });

  it("a failing transaction leaves no fingerprint (rollback fixture)", async () => {
    const realAudit = db.auditLog.create;
    db.auditLog.create = async () => { throw new Error("audit write failed"); };
    await expect(service().create("class-a", req(), testBody())).rejects.toThrow("audit write failed");
    db.auditLog.create = realAudit;
    expect(db.classResource.rows).toHaveLength(0);
    expect(fingerprints()).toHaveLength(0);
  });
});

describe("backfill", () => {
  it("reconciles every source, removes orphans, and a rerun is a no-op with matching counts", async () => {
    db.classResource.rows.push(
      { id: "res-a", classId: "class-a", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: "A?" }, { id: "q2", prompt: "B?" }] } },
      { id: "res-old", classId: "class-a", kind: "TEST", status: "ARCHIVED", version: 1, content: { questions: [{ id: "q", prompt: "C?" }] } },
    );
    db.questionFingerprint.rows.push({ id: "orphan", sourceKind: "CLASS_RESOURCE", sourceId: "res-deleted", sourceVersion: 1, itemId: "q", classId: "class-a", ownerTeacherId: "teacher-owner", normalizedText: "x", normalizedHash: "h", algorithm: "qdup@1" });
    const first = await backfillQuestionFingerprints(db);
    expect(first).toEqual({ classResources: 2, libraryLessons: 2, orphanSources: 1, created: 4, deleted: 1, fingerprints: 4, failed: [] });
    const second = await backfillQuestionFingerprints(db);
    expect(second).toEqual({ classResources: 2, libraryLessons: 2, orphanSources: 0, created: 0, deleted: 0, fingerprints: 4, failed: [] });
  });

  it("reports a source it cannot read and continues with the rest", async () => {
    db.classResource.rows.push(
      { id: "res-bad", classId: "class-a", kind: "DOCUMENT", status: "DRAFT", version: 1, content: {} },
      { id: "res-ok", classId: "class-a", kind: "TEST", status: "DRAFT", version: 1, content: { questions: [{ id: "q", prompt: "A?" }] } },
    );
    const realFind = db.classResource.findUnique;
    db.classResource.findUnique = async (args: any) => {
      if (args.where.id === "res-bad") throw Object.assign(new Error("Value 'DOCUMENT' not found in enum"), { name: "PrismaClientUnknownRequestError" });
      return realFind(args);
    };
    const report = await backfillQuestionFingerprints(db);
    expect(report.failed).toEqual([{ sourceKind: "CLASS_RESOURCE", sourceId: "res-bad", error: "PrismaClientUnknownRequestError" }]);
    expect(fingerprints().filter((f) => f.sourceKind === "CLASS_RESOURCE").map((f) => f.sourceId)).toEqual(["res-ok"]);
  });
});

describe("TAI3-T2 cross-class duplicate warnings", () => {
  const service = () => new ClassResourcesService(db);
  const body = (title: string, prompt: string, kind = "TEST") => ({
    kind, title, lessonId: "lesson-lib",
    content: kind === "DECK" ? { cards: [{ front: prompt, back: "x" }] } : { questions: [{ prompt, options: ["A", "B"], ...(kind === "TEST" ? { correctOption: 0 } : {}) }] },
  });
  const classReq = (classId: string) => service().create(classId, req(), body("Đề gốc", "Dòng điện là gì?"));

  it("warns with source title for a copy in the teacher's other class and in the library, never blocks", async () => {
    await syncLibraryLessonFingerprints(db, "lesson-lib");
    await classReq("class-b");
    const created: any = await service().create("class-a", req(), body("Đề mới", "  dòng điện LÀ GÌ "));
    expect(db.classResource.rows.map((r: Row) => r.id)).toContain(created.id);
    expect(created.duplicateWarnings).toHaveLength(1);
    const flags = created.duplicateWarnings[0].matches.map((m: any) => [m.flag, m.source.title, m.source.className ?? null]);
    expect(flags).toEqual(expect.arrayContaining([["EXACT_DUPLICATE_ELSEWHERE", "Đề gốc", "B"], ["EXACT_DUPLICATE_ELSEWHERE", "Mạch điện", null]]));
  });

  it("never returns teacher.outsider's identical question, not even as a count", async () => {
    db.classResource.rows.push({ id: "res-x", title: "Đề người khác", classId: "class-x", kind: "TEST", status: "PUBLISHED", version: 1, content: { questions: [{ id: "q", prompt: "Câu riêng của lớp X" }] } });
    await syncClassResourceFingerprints(db, "res-x");
    const result: any = await service().duplicateCheck("class-a", req(), { kind: "TEST", items: [{ text: "Câu riêng của lớp X" }] });
    expect(result).toEqual({ algorithm: "qdup@1", warnings: [] });
  });

  it("duplicate-check flags same-class and near matches, and excludes the revise lineage when a title is given", async () => {
    const original: any = await classReq("class-a");
    await service().publish("class-a", original.id, req());
    await service().revise("class-a", original.id, req());
    const withoutLineage: any = await service().duplicateCheck("class-a", req(), { kind: "TEST", items: [{ text: "Dòng điện là gì?" }, { text: "Hoàn toàn khác" }] });
    expect(withoutLineage.warnings).toHaveLength(1);
    expect(withoutLineage.warnings[0]).toMatchObject({ index: 0 });
    expect(withoutLineage.warnings[0].matches.map((m: any) => m.flag)).toEqual(["EXACT_DUPLICATE", "EXACT_DUPLICATE"]);
    const lineage: any = await service().duplicateCheck("class-a", req(), { kind: "TEST", title: "Đề gốc", items: [{ text: "Dòng điện là gì?" }] });
    expect(lineage.warnings).toEqual([]);
    const long = "Cường độ dòng điện chạy qua một dây dẫn tỉ lệ thuận với hiệu điện thế đặt vào hai đầu dây dẫn đó";
    await service().create("class-a", req(), body("Đề dài", long));
    const near: any = await service().duplicateCheck("class-a", req(), { kind: "TEST", items: [{ text: long.replace(/đó$/, "này") }] });
    expect(near.warnings[0]?.matches[0]).toMatchObject({ level: "NEAR", flag: "NEAR_DUPLICATE", source: { title: "Đề dài" } });
    expect(near.warnings[0].matches[0].score).toBeGreaterThanOrEqual(0.85);
  });

  it("a draft edited after revise does not warn about its own previous version, even when renamed", async () => {
    const original: any = await classReq("class-a");
    await service().publish("class-a", original.id, req());
    const draft: any = await service().revise("class-a", original.id, req());
    const same: any = await service().updateDraft("class-a", draft.id, req(), body("Đề gốc", "Dòng điện là gì?"));
    expect(same.duplicateWarnings).toEqual([]);
    const renamed: any = await service().updateDraft("class-a", draft.id, req(), body("Đề gốc (bản 2)", "Dòng điện là gì?"));
    expect(renamed.duplicateWarnings).toEqual([]);
  });

  it("import preview returns warnings and still validates", async () => {
    await classReq("class-b");
    const csv = "prompt,optionA,optionB,optionC,optionD,correctOption,explanation\r\nDòng điện là gì?,A,B,,,A,\r\n";
    const preview: any = await service().previewImport("class-a", req(), { kind: "TEST", filename: "de.csv", csv });
    expect(preview.valid).toBe(true);
    expect(preview.duplicateWarnings[0].matches[0]).toMatchObject({ flag: "EXACT_DUPLICATE_ELSEWHERE", source: { title: "Đề gốc", className: "B" } });
  });

  it("validates the duplicate-check body and denies a foreign class", async () => {
    await expect(service().duplicateCheck("class-a", req(), { kind: "TEST", items: [] })).rejects.toThrow();
    await expect(service().duplicateCheck("class-a", req(), { kind: "TEST", items: [{ text: "a" }], extra: 1 })).rejects.toThrow();
    await expect(service().duplicateCheck("class-x", req(), { kind: "TEST", items: [{ text: "a" }] })).rejects.toMatchObject({ status: 403 });
  });
});
