import "reflect-metadata";
import { beforeEach, describe, expect, it } from "vitest";
import { SimilarityController } from "../interface/similarity.controller";
import { SimilarityRunsService } from "./similarity-runs.service";

/**
 * TAI3-T4 on an in-memory stand-in for Prisma (no database): run creation, digest replay, staleness,
 * limits, archive rules, reviews, isolation between assignments and from every other table.
 */
type Row = Record<string, any>;
let seq = 0;
let db: any;

const OPERATORS = ["in", "not", "contains"];
const isCompound = (key: string, value: any) =>
  key.includes("_") && value && typeof value === "object" && !(value instanceof Date) && !Array.isArray(value) && !Object.keys(value).some((k) => OPERATORS.includes(k));
const flatten = (where: Row = {}) => Object.fromEntries(Object.entries(where).flatMap(([k, v]) => (isCompound(k, v) ? Object.entries(v) : [[k, v]])));
const same = (a: any, b: any) => (a instanceof Date && b instanceof Date ? a.getTime() === b.getTime() : a === b);
function matches(row: Row, where: Row = {}): boolean {
  return Object.entries(flatten(where)).every(([key, cond]) => {
    if (cond === undefined) return true;
    const value = row[key];
    if (cond && typeof cond === "object" && !(cond instanceof Date)) {
      if ("in" in cond) return cond.in.includes(value);
      if ("not" in cond) return !same(value, cond.not);
      return false;
    }
    return same(value, cond);
  });
}
function sortRows(rows: Row[], orderBy: any) {
  const keys = (Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : []).flatMap((o: Row) => Object.entries(o));
  return [...rows].sort((a, b) => {
    for (const [key, dir] of keys) {
      const x = a[key] instanceof Date ? a[key].getTime() : a[key];
      const y = b[key] instanceof Date ? b[key].getTime() : b[key];
      if (x === y) continue;
      return (x > y ? 1 : -1) * (dir === "desc" ? -1 : 1);
    }
    return 0;
  });
}
const pick = (row: Row, select?: Row) => (select ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k]])) : { ...row });

function table(name: string) {
  const t = {
    rows: [] as Row[],
    async findFirst({ where, select, orderBy }: Row = {}) {
      const r = sortRows(t.rows.filter((x) => matches(x, where)), orderBy)[0];
      return r ? pick(r, select) : null;
    },
    async findUnique({ where, select }: Row) {
      const r = t.rows.find((x) => matches(x, where));
      return r ? pick(r, select) : null;
    },
    async findMany({ where, select, orderBy, take, include }: Row = {}) {
      let rows = sortRows(t.rows.filter((x) => matches(x, where)), orderBy);
      if (take) rows = rows.slice(0, take);
      return rows.map((r) => {
        const out = pick(r, select);
        if (include?._count && name === "submissionSimilarityRun") out._count = { matches: db.submissionSimilarityMatch.rows.filter((m: Row) => m.runId === r.id).length };
        return out;
      });
    },
    async count({ where }: Row = {}) { return t.rows.filter((x) => matches(x, where)).length; },
    async create({ data }: Row) {
      const r = { id: `${name}-${++seq}`, createdAt: new Date(Date.now() + seq), ...data };
      t.rows.push(r);
      return { ...r };
    },
    async createMany({ data }: Row) {
      for (const d of data) t.rows.push({ id: `${name}-${++seq}`, createdAt: new Date(Date.now() + seq), ...d });
      return { count: data.length };
    },
    async update({ where, data }: Row) {
      const r = t.rows.find((x) => matches(x, where))!;
      Object.assign(r, data);
      return { ...r };
    },
  };
  return t;
}

const TABLES = ["classroom", "assignment", "assignmentSubmission", "classResource", "user", "submissionSimilarityRun", "submissionSimilarityMatch", "similarityMatchReview", "auditLog", "idempotencyRecord", "notification", "writtenGradeDecision"];

beforeEach(() => {
  seq = 0;
  db = {};
  for (const name of TABLES) db[name] = table(name);
  db.$executeRaw = async () => 0;
  // Roll back every table when the transaction throws, like the real database does.
  db.$transaction = async (fn: (tx: any) => Promise<any>) => {
    const snapshot = TABLES.map((name) => [name, db[name].rows.map((r: Row) => ({ ...r }))] as const);
    try {
      return await fn(db);
    } catch (error) {
      for (const [name, rows] of snapshot) db[name].rows = rows;
      throw error;
    }
  };
  db.classroom.rows.push({ id: "class-a", teacherId: "t1", status: "ACTIVE", name: "8A" }, { id: "class-b", teacherId: "t2", status: "ACTIVE", name: "8B" });
  db.classResource.rows.push({
    id: "wt-1", classId: "class-a", kind: "WRITTEN_TASK", status: "PUBLISHED", version: 1, title: "Tự luận",
    content: { prompts: [{ id: "p1", prompt: "Giải thích vì sao dây tóc nóng lên", maxChars: 3000, commonPhrases: [], criteria: [] }] },
  });
  db.assignment.rows.push(
    { id: "as-1", classId: "class-a", contentType: "written", contentId: "wt-1", status: "ACTIVE" },
    { id: "as-2", classId: "class-a", contentType: "written", contentId: "wt-1", status: "ACTIVE" },
    { id: "as-test", classId: "class-a", contentType: "test", contentId: "test-1", status: "ACTIVE" },
    { id: "as-b", classId: "class-b", contentType: "written", contentId: "wt-b", status: "ACTIVE" },
  );
  for (const id of ["s1", "s2", "s3", "s4"]) db.user.rows.push({ id, fullName: `Học sinh ${id}`, username: id });
});

const L = "abcdefghijklmnopqrstuvwxyz";
const word = (i: number) => "xy" + L[i % 26] + L[Math.floor(i / 26) % 26] + L[Math.floor(i / 676) % 26];
const words = (from: number, count: number) => Array.from({ length: count }, (_, i) => word(from + i)).join(" ");
let clock = 1_800_000_000_000;
function addSubmission(assignmentId: string, studentId: string, text: string, patch: Row = {}) {
  const row = { id: `sub-${assignmentId}-${studentId}-${++seq}`, assignmentId, studentId, resourceVersion: 1, timing: "ON_TIME", submittedAt: new Date((clock += 1000)), answers: [{ promptId: "p1", text }], ...patch };
  db.assignmentSubmission.rows.push(row);
  return row;
}
const OWNER = { sub: "t1", role: "TEACHER" };
const OUTSIDER = { sub: "t2", role: "TEACHER" };
const req = (user = OWNER) => ({ user, headers: { "idempotency-key": `key-${++seq}-abcdefgh` } });
const service = () => new SimilarityRunsService(db);
const run = (assignmentId = "as-1", user = OWNER) => service().create("class-a", assignmentId, req(user), {}) as Promise<any>;
const codeOf = (p: Promise<unknown>) => p.then(() => null, (e: any) => e.response?.code ?? e.status ?? String(e));
const SOURCE = words(0, 80);
const NEAR_COPY = SOURCE.split(" ").map((w, i) => (i % 40 === 0 ? "zz" + w : w)).join(" ");

function threeSubmissions(assignmentId = "as-1") {
  const a = addSubmission(assignmentId, "s1", SOURCE);
  const b = addSubmission(assignmentId, "s2", NEAR_COPY);
  const c = addSubmission(assignmentId, "s3", words(500, 80));
  return { a, b, c };
}

describe("TAI3-T4 creating and replaying runs", () => {
  it("creates a run with its matches and audits it without any text", async () => {
    const { a, b } = threeSubmissions();
    const result = await run();
    expect(result.replayed).toBe(false);
    expect(result.run).toMatchObject({ assignmentId: "as-1", algorithmVersion: "subsim@1", submissionCount: 3, matchCount: 1, stale: false });
    expect(db.submissionSimilarityMatch.rows).toEqual([expect.objectContaining({ runId: result.run.id, submissionAId: [a.id, b.id].sort()[0], submissionBId: [a.id, b.id].sort()[1], level: "HIGH" })]);
    const audit = db.auditLog.rows.find((r: Row) => r.action === "similarity_run.create");
    expect(audit.after).toEqual({ assignmentId: "as-1", algorithmVersion: "subsim@1", submissionCount: 3, matchCount: 1, replayed: false });
    expect(JSON.stringify(audit)).not.toContain(SOURCE.slice(0, 20));
  });

  it("replays the run for the same input digest with replayed true and one audit row per request", async () => {
    threeSubmissions();
    const first = await run();
    const second = await run();
    expect(second.replayed).toBe(true);
    expect(second.run.id).toBe(first.run.id);
    expect(db.submissionSimilarityRun.rows).toHaveLength(1);
    expect(db.submissionSimilarityMatch.rows).toHaveLength(1);
    const audits = db.auditLog.rows.filter((r: Row) => r.action === "similarity_run.create");
    expect(audits.map((a: Row) => a.after.replayed)).toEqual([false, true]);
  });

  it("returns the stored response for the same Idempotency-Key without a new audit row", async () => {
    threeSubmissions();
    const same = req();
    const first = await service().create("class-a", "as-1", same, {});
    const again = await service().create("class-a", "as-1", same, {});
    expect(again).toEqual(first);
    expect(db.auditLog.rows.filter((r: Row) => r.action === "similarity_run.create")).toHaveLength(1);
  });

  it("marks old runs stale after a resubmission and a rerun creates a new run", async () => {
    threeSubmissions();
    const first = await run();
    addSubmission("as-1", "s2", words(900, 80)); // s2 resubmits
    const before = (await service().list("class-a", "as-1", req(), {})) as any;
    expect(before.items.map((r: Row) => [r.id, r.stale])).toEqual([[first.run.id, true]]);
    const second = await run();
    expect(second.replayed).toBe(false);
    expect(second.run.id).not.toBe(first.run.id);
    const after = (await service().list("class-a", "as-1", req(), {})) as any;
    expect(after.items.map((r: Row) => r.stale)).toEqual([false, true]);
    expect(after.items[0].id).toBe(second.run.id);
  });

  it("compares only the latest submission of each student, whatever its timing or grading state", async () => {
    addSubmission("as-1", "s1", SOURCE); // old, identical to s2
    addSubmission("as-1", "s1", words(700, 80)); // new, different
    addSubmission("as-1", "s2", SOURCE, { timing: "LATE" }); // late pending is still current evidence
    addSubmission("as-1", "s3", words(300, 80));
    const result = await run();
    expect(result.run.submissionCount).toBe(3);
    expect(result.run.matchCount).toBe(0);
    expect(db.submissionSimilarityMatch.rows).toHaveLength(0);
  });

  it("never compares across assignments", async () => {
    const one = threeSubmissions("as-1");
    const two = threeSubmissions("as-2");
    addSubmission("as-2", "s4", SOURCE); // a second copy only inside as-2
    const first = await run("as-1");
    const second = await run("as-2");
    const idsOf = (runId: string) => db.submissionSimilarityMatch.rows.filter((m: Row) => m.runId === runId).flatMap((m: Row) => [m.submissionAId, m.submissionBId]);
    for (const id of idsOf(first.run.id)) expect([one.a.id, one.b.id, one.c.id]).toContain(id);
    for (const id of idsOf(second.run.id)) expect(id).not.toMatch(/as-1/);
    expect(first.run.submissionCount).toBe(3);
    expect(second.run.submissionCount).toBe(4);
  });

  it("returns the existing run when a concurrent request wins the unique digest (P2002 guard)", async () => {
    threeSubmissions();
    const winner = await run();
    // The digest lookup misses once (the winner committed after it), then create hits the unique key.
    const realFind = db.submissionSimilarityRun.findUnique;
    let lookups = 0;
    db.submissionSimilarityRun.findUnique = async (args: Row) => (++lookups === 1 ? null : realFind(args));
    db.submissionSimilarityRun.create = async () => {
      throw Object.assign(new Error("Unique constraint failed"), { code: "P2002" });
    };
    const result = await run();
    expect(result.replayed).toBe(true);
    expect(result.run.id).toBe(winner.run.id);
    expect(db.submissionSimilarityRun.rows).toHaveLength(1);
  });
});

describe("TAI3-T4 limits, scope and archive rules", () => {
  it("rejects fewer than 2 current submissions with 409 SIMILARITY_INPUT_TOO_SMALL", async () => {
    addSubmission("as-1", "s1", SOURCE);
    expect(await codeOf(run())).toBe("SIMILARITY_INPUT_TOO_SMALL");
    expect(db.submissionSimilarityRun.rows).toHaveLength(0);
  });

  it("accepts exactly 200 students and returns 413 SIMILARITY_INPUT_TOO_LARGE above that", async () => {
    for (let i = 0; i < 200; i++) addSubmission("as-1", `v${i}`, "x");
    expect((await run()).run.submissionCount).toBe(200);
    addSubmission("as-1", "v200", "x");
    let status = 0;
    const code = await run().then(() => null, (e: any) => ((status = e.getStatus?.() ?? 0), e.response?.code));
    expect(code).toBe("SIMILARITY_INPUT_TOO_LARGE");
    expect(status).toBe(413);
  });

  it("rejects lesson, lab or test assignments (409) and foreign or missing assignments (404)", async () => {
    expect(await codeOf(run("as-test"))).toBe("NOT_A_WRITTEN_ASSIGNMENT");
    expect(await codeOf(run("as-b"))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(run("missing"))).toBe("ASSIGNMENT_NOT_FOUND");
    expect(await codeOf(service().list("class-a", "as-test", req(), {}))).toBe("NOT_A_WRITTEN_ASSIGNMENT");
  });

  it("denies another teacher on every route and restricts every route to TEACHER", async () => {
    threeSubmissions();
    const created = await run();
    const denied = (p: Promise<unknown>) => codeOf(p);
    expect(await denied(run("as-1", OUTSIDER))).toBe("CLASS_ACCESS_DENIED");
    expect(await denied(service().list("class-a", "as-1", req(OUTSIDER), {}))).toBe("CLASS_ACCESS_DENIED");
    expect(await denied(service().detail("class-a", "as-1", created.run.id, req(OUTSIDER)))).toBe("CLASS_ACCESS_DENIED");
    expect(await denied(service().review("class-a", "as-1", created.run.id, "m", req(OUTSIDER), { status: "NOTED" }))).toBe("CLASS_ACCESS_DENIED");
    for (const method of ["create", "list", "detail", "review"] as const)
      expect(Reflect.getMetadata("roles", SimilarityController.prototype[method])).toEqual(["TEACHER"]);
  });

  it("blocks a run and a review only when the class is archived; reads and archived assignments keep working", async () => {
    threeSubmissions();
    db.assignment.rows.find((a: Row) => a.id === "as-1").status = "ARCHIVED";
    const created = await run();
    expect(created.replayed).toBe(false);
    const matchId = db.submissionSimilarityMatch.rows[0].id;
    db.classroom.rows.find((c: Row) => c.id === "class-a").status = "ARCHIVED";
    expect(await codeOf(run())).toBe("CLASS_ARCHIVED");
    expect(await codeOf(service().review("class-a", "as-1", created.run.id, matchId, req(), { status: "NOTED" }))).toBe("CLASS_ARCHIVED");
    await expect(service().list("class-a", "as-1", req(), {})).resolves.toMatchObject({ items: [expect.anything()] });
    await expect(service().detail("class-a", "as-1", created.run.id, req())).resolves.toMatchObject({ matches: [expect.anything()] });
  });
});

describe("TAI3-T4 detail and reviews", () => {
  it("returns names, prompt text, both responses and the stale flag for the owner", async () => {
    const { a, b } = threeSubmissions();
    const created = await run();
    const detail: any = await service().detail("class-a", "as-1", created.run.id, req());
    expect(detail.run).toMatchObject({ id: created.run.id, stale: false });
    const [match] = detail.matches;
    const sides = [a, b].sort((x, y) => (x.id < y.id ? -1 : 1));
    expect(match.submissionA.student).toEqual({ id: sides[0].studentId, fullName: `Học sinh ${sides[0].studentId}`, username: sides[0].studentId });
    const prompt = match.perPrompt[0];
    expect(prompt).toMatchObject({ promptId: "p1", promptText: "Giải thích vì sao dây tóc nóng lên", level: "HIGH" });
    expect(prompt.textA).toBe(sides[0].answers[0].text);
    expect(prompt.textB).toBe(sides[1].answers[0].text);
    for (const span of prompt.spansA) expect(prompt.textA.slice(span.start, span.end).length).toBeGreaterThan(0);
    expect(match.review).toBeNull();
    addSubmission("as-1", "s3", words(1200, 80));
    expect(((await service().detail("class-a", "as-1", created.run.id, req())) as any).run.stale).toBe(true);
    expect(await codeOf(service().detail("class-a", "as-2", created.run.id, req()))).toBe("NOT_FOUND");
  });

  it("appends reviews; the newest is current; the note is normalized and never audited", async () => {
    threeSubmissions();
    const created = await run();
    const matchId = db.submissionSimilarityMatch.rows[0].id;
    const post = (body: unknown) => service().review("class-a", "as-1", created.run.id, matchId, req(), body) as Promise<any>;
    expect((await post({ status: "NOTED", note: "  Cần hỏi lại em  " })).review).toMatchObject({ status: "NOTED", note: "Cần hỏi lại em" });
    addSubmission("as-1", "s4", words(2000, 80)); // the run is stale now; a review is still allowed
    await post({ status: "DISMISSED" });
    expect(db.similarityMatchReview.rows).toHaveLength(2);
    const detail: any = await service().detail("class-a", "as-1", created.run.id, req());
    expect(detail.matches[0]).toMatchObject({ reviewCount: 2, review: { status: "DISMISSED", note: null } });
    for (const audit of db.auditLog.rows.filter((r: Row) => r.action === "similarity_match.review")) {
      expect(audit.after).toEqual({ runId: created.run.id, matchId, status: audit.after.status });
      expect(JSON.stringify(audit)).not.toContain("Cần hỏi lại");
    }
  });

  it("validates the review body and the match", async () => {
    threeSubmissions();
    const created = await run();
    const matchId = db.submissionSimilarityMatch.rows[0].id;
    const post = (id: string, body: unknown, runId = created.run.id) => service().review("class-a", "as-1", runId, id, req(), body);
    await expect(post(matchId, { status: "NOTED", note: "x".repeat(1001) })).rejects.toBeTruthy();
    await expect(post(matchId, { status: "MAYBE" })).rejects.toBeTruthy();
    await expect(post(matchId, { status: "NOTED", extra: 1 })).rejects.toBeTruthy();
    expect(await codeOf(post("missing", { status: "NOTED" }))).toBe("NOT_FOUND");
    expect(await codeOf(post(matchId, { status: "NOTED" }, "other-run"))).toBe("NOT_FOUND");
    expect(db.similarityMatchReview.rows).toHaveLength(0);
  });
});

describe("TAI3-T4 isolation from every other table", () => {
  it("changes nothing outside the similarity tables and the audit log", async () => {
    threeSubmissions();
    db.writtenGradeDecision.rows.push({ id: "g1", submissionId: db.assignmentSubmission.rows[0].id, score: 80, feedback: "ok" });
    const snapshot = () => JSON.stringify(["assignmentSubmission", "assignment", "classResource", "user", "notification", "writtenGradeDecision", "classroom"].map((n) => db[n].rows));
    const before = snapshot();
    const created = await run();
    await run();
    await service().review("class-a", "as-1", created.run.id, db.submissionSimilarityMatch.rows[0].id, req(), { status: "NOTED", note: "n" });
    await service().list("class-a", "as-1", req(), {});
    await service().detail("class-a", "as-1", created.run.id, req());
    expect(snapshot()).toBe(before);
    expect(db.notification.rows).toHaveLength(0);
    expect(db.auditLog.rows.every((a: Row) => /^similarity_/.test(a.action))).toBe(true);
  });
});
