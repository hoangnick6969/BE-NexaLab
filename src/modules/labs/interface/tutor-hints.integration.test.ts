import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { circuit } from "../../../../packages/sim";
import { RequestRateLimiter } from "../../../common/request-rate-limiter";
import { StudentAccessService } from "../../progress/application/student-access.service";
import { ParentsController } from "../../parents/interface/parents.controller";
import { ClassProgressController } from "../../reports/interface/class-progress.controller";
import { requestHint } from "../application/hint";
import { renderTutorTemplate } from "../application/tutor-rules";
import { studentAiConfig, type StudentAiProvider } from "../../student-ai/application/student-llm";

// SAI-01 legacy Lab hints, LLM-first (tutor-rules@1 plans and falls back, student-hint@1 phrases): isolated database only.
class TestProvider implements StudentAiProvider {
  readonly name = "fake" as const;
  readonly model = "fake-student@1";
  calls = 0;
  constructor(private readonly reply: string) {}
  async complete() { this.calls += 1; return JSON.stringify({ hint: this.reply }); }
}
const LLM_ON = studentAiConfig({ APP_ENV: "test", STUDENT_AI_LLM_ENABLED: "true" } as any);
const testUrl = process.env.NEXALAB_PINNING_TEST_URL;
if (process.env.CI && !testUrl) throw new Error("CI requires NEXALAB_PINNING_TEST_URL for tutor hint integration");
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || url.pathname !== "/nexalab_pinning_test")
    throw new Error("tutor hint integration only accepts the isolated local nexalab_pinning_test database");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

const loop = (resistance: number | null, closed = true) => ({
  nodes: [
    { id: "b", type: "battery", value: 9 },
    ...(resistance === null ? [] : [{ id: "r", type: "resistor", value: resistance }]),
    { id: "l", type: "led" },
    { id: "s", type: "switch", closed },
  ],
  edges: resistance === null
    ? [{ source: "b", target: "l" }, { source: "l", target: "s" }, { source: "s", target: "b" }]
    : [{ source: "b", target: "r" }, { source: "r", target: "l" }, { source: "l", target: "s" }, { source: "s", target: "b" }],
});
const open = { nodes: [{ id: "b", type: "battery", value: 9 }, { id: "r", type: "resistor", value: 350 }, { id: "l", type: "led" }], edges: [{ source: "b", target: "r" }, { source: "r", target: "l" }] };

async function fixture(p: PrismaClient) {
  const suffix = randomUUID().slice(0, 8);
  await p.subject.create({ data: { id: `subject-${suffix}`, name: "Isolated fixture" } });
  const labId = `circuit-tutor-${suffix}`, challengeId = `circuit-tutor-${suffix}-001`;
  await p.lab.create({ data: { id: labId, subjectId: `subject-${suffix}`, title: "Circuit tutor fixture", topic: "fixture", learningObjective: "fixture", status: "published", scope: "CLASS_PRIVATE", releaseCleared: false, synthetic: true, simulationModelRef: "circuit@1.0.0" } });
  // The objective is hint context, so the guard treats its numbers as grounded: keep the per-run tag (it isolates the
  // wording cache between runs) but digit-free, or a random "9" would ground the unsafe "9 V" reply below.
  const tag = suffix.replace(/\d/g, (d) => "ghijklmnop"[Number(d)]);
  await p.challenge.create({ data: { id: challengeId, labId, objective: `Làm LED sáng mà không quá dòng (fixture ${tag})`, constraints: {} } });
  const student = async (name: string) => {
    const user = await p.user.create({ data: { username: `${name}-${suffix}`, fullName: "Fixture student", passwordHash: "fixture", role: "STUDENT" } });
    const session = await p.session.create({ data: { userId: user.id, tokenHash: randomUUID(), kind: "refresh", expiresAt: new Date(Date.now() + 3600_000) } });
    return { user, actor: { sub: user.id, sid: session.id } };
  };
  let clock = Date.now() - 3600_000;
  const submit = (studentId: string, labState: unknown) => {
    const result = circuit(labState);
    clock += 1000;
    return p.attempt.create({ data: { studentId, challengeId, labState: labState as any, simulationResult: result as any, verdict: result.verdict, durationMs: 100, simulationModelVersion: "1.0.0", createdAt: new Date(clock) } });
  };
  return { suffix, labId, challengeId, student, submit };
}

describe.skipIf(!db)("isolated legacy Lab hints (SAI-01)", () => {
  it("rules plan the ladder, the LLM writes it, the cache serves other students, and the verdict never changes", async () => {
    const p = db!;
    const f = await fixture(p);
    const a = await f.student("active");
    const b = await f.student("other");
    const provider = new TestProvider("Em thử lần theo dây từ nguồn xem dòng điện đi đâu?");
    const deps = { provider, config: LLM_ON };
    const ask = (actor: any, attemptId: string, d: any = deps) => requestHint(p, actor, attemptId, d) as Promise<any>;

    // Kill switch off: the rule template, logged as DISABLED.
    const first = await f.submit(a.user.id, open);
    const off = await ask(a.actor, first.id, { provider, config: studentAiConfig({}) });
    expect(off).toMatchObject({ level: 1, escalated: false, provider: "rules" });
    expect(off.content).toBe(renderTutorTemplate("OPEN_CIRCUIT", 1, 0, first.simulationResult));
    expect(await p.hintLog.findUniqueOrThrow({ where: { id: off.id } })).toMatchObject({ fallbackReason: "DISABLED", model: null, ruleVersion: "tutor-rules@1" });
    expect(await ask(a.actor, first.id)).toEqual(off);
    expect(provider.calls).toBe(0);

    // LLM on. Identical re-run → level 1 (variant b), written by the LLM; the rule text stays in the snapshot.
    const same = await f.submit(a.user.id, { ...open, nodes: [...open.nodes].reverse() });
    const h1b = await ask(a.actor, same.id);
    expect(h1b).toMatchObject({ level: 1, escalated: false, provider: "fake", content: "Em thử lần theo dây từ nguồn xem dòng điện đi đâu?" });
    const row1b = await p.hintLog.findUniqueOrThrow({ where: { id: h1b.id } });
    expect(row1b).toMatchObject({ promptVersion: "student-hint@1", model: "fake-student@1", variant: "b", fallbackReason: null });
    expect((row1b.contextSnapshot as any).ruleHint).toBe(renderTutorTemplate("OPEN_CIRCUIT", 1, 1, first.simulationResult));
    // Older attempt → 400; another student's attempt → 404.
    const third = await f.submit(a.user.id, loop(330, false));
    await expect(ask(b.actor, third.id)).rejects.toMatchObject({ status: 404 });
    const fresh = await f.submit(a.user.id, loop(330, false));
    await expect(ask(a.actor, third.id)).rejects.toMatchObject({ response: { code: "HINT_NOT_LATEST_ATTEMPT" } });

    // Changed wiring → 2, then two more real retries → 3 and 4; FR-22: the attempt row is unchanged.
    const before = await p.attempt.findUniqueOrThrow({ where: { id: fresh.id } });
    expect(await ask(a.actor, fresh.id)).toMatchObject({ level: 2, escalated: true, provider: "fake" });
    expect(await p.attempt.findUniqueOrThrow({ where: { id: fresh.id } })).toEqual(before);
    expect(await ask(a.actor, (await f.submit(a.user.id, loop(330))).id)).toMatchObject({ level: 3, escalated: true });
    expect(await ask(a.actor, (await f.submit(a.user.id, loop(300))).id)).toMatchObject({ level: 4, escalated: true });
    expect(provider.calls).toBe(4);

    // Another student reaching the same rule decision gets the cached wording: no provider call.
    const bOpen = await f.submit(b.user.id, open);
    await ask(b.actor, bOpen.id, { provider, config: studentAiConfig({}) });
    const bSame = await ask(b.actor, (await f.submit(b.user.id, open)).id);
    expect(bSame).toMatchObject({ level: 1, provider: "cache", content: h1b.content });
    expect(provider.calls).toBe(4);

    // Passing, then asking → 409.
    const passed = await f.submit(a.user.id, loop(350));
    expect(passed.verdict).toBe("passed");
    await expect(ask(a.actor, passed.id)).rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
  }, 60000);

  it("an unsafe LLM output falls back to the rule text, the window answers 429 with retryAfterSeconds, the budget falls back", async () => {
    const p = db!;
    const f = await fixture(p);
    const s = await f.student("window");
    const unsafe = new TestProvider("Dùng 9 V là được?");
    const config = { ...LLM_ON, hintsPer10Min: 8, dailyProviderCalls: 1 };
    const states = [open, loop(330, false), loop(330), loop(300), loop(250), loop(200), loop(150), loop(100)];
    const hints: any[] = [];
    for (const state of states) hints.push(await requestHint(p, s.actor, (await f.submit(s.user.id, state)).id, { provider: unsafe, config }));
    expect(hints.map((h) => h.level)).toEqual([1, 2, 3, 4, 4, 4, 4, 4]);
    const rows = new Map((await p.hintLog.findMany({ where: { id: { in: hints.map((h) => h.id) } } })).map((row) => [row.id, row]));
    expect(rows.get(hints[0].id)).toMatchObject({ provider: "rules-fallback", fallbackReason: "GUARD:NUMBER_NOT_GROUNDED", model: "fake-student@1" });
    expect(hints[0].content).not.toContain("9 V");
    // One provider call already used today (the guarded one): the next hint is over budget.
    expect(rows.get(hints[1].id)).toMatchObject({ provider: "rules-fallback", fallbackReason: "BUDGET", model: null });
    expect(unsafe.calls).toBe(1);
    const ninth = await f.submit(s.user.id, loop(90));
    const error: any = await requestHint(p, s.actor, ninth.id, { provider: unsafe, config }).catch((e) => e);
    expect(error.getStatus()).toBe(429);
    expect(error.getResponse()).toMatchObject({ code: "HINT_RATE_LIMITED", details: { retryAfterSeconds: expect.any(Number) } });
    expect(error.getResponse().details.retryAfterSeconds).toBeGreaterThan(0);
    expect(error.getResponse().details.retryAfterSeconds).toBeLessThanOrEqual(600);
    // A second "API instance" (another Prisma client on the same database) sees the same window.
    const other = new PrismaClient({ datasourceUrl: testUrl });
    try {
      await expect(requestHint(other, s.actor, ninth.id, { provider: unsafe, config })).rejects.toMatchObject({ response: { code: "HINT_RATE_LIMITED" } });
    } finally {
      await other.$disconnect();
    }
  }, 60000);

  it("teacher reads level, content and provider without the snapshot; parents see no hint fields", async () => {
    const p = db!;
    const f = await fixture(p);
    const s = await f.student("reads");
    const teacher = await p.user.create({ data: { email: `teacher-${f.suffix}@example.test`, fullName: "Fixture teacher", passwordHash: "fixture", role: "TEACHER" } });
    const classroom = await p.classroom.create({ data: { teacherId: teacher.id, name: "Fixture class" } });
    await p.enrollment.create({ data: { classId: classroom.id, studentId: s.user.id, status: "approved", approved: true } });
    const attempt = await f.submit(s.user.id, open);
    await requestHint(p, s.actor, attempt.id);
    const analytics: any[] = await new ClassProgressController(p as any).analytics(classroom.id, { user: { sub: teacher.id, role: "TEACHER" } });
    const hint = analytics[0].attempts[0].hints[0];
    expect(Object.keys(hint).sort()).toEqual(["content", "createdAt", "escalated", "id", "level", "provider"]);
    const parent = await p.user.create({ data: { email: `parent-${f.suffix}@example.test`, fullName: "Fixture parent", passwordHash: "fixture", role: "PARENT" } });
    await p.parentLink.create({ data: { parentId: parent.id, studentId: s.user.id, status: "approved" } });
    const parents = new ParentsController(p as any, new StudentAccessService(p as any), new RequestRateLimiter());
    const preq = { user: { sub: parent.id, role: "PARENT" } };
    const views = [await parents.parentProgress(preq, s.user.id), await parents.parentActivity(preq, s.user.id, {}), await parents.helpSeeking(preq, s.user.id)];
    for (const view of views) expect(JSON.stringify(view)).not.toMatch(/contextSnapshot|"content"|Em có lần theo|labDigest|fallbackReason/);
  }, 60000);
});
