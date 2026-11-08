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
import { studentAiConfig } from "../application/tutor-provider";
import { FakeTutorProvider } from "../infrastructure/llm";

// SAI-01 legacy Lab hints (tutor-rules@1, tutor-observation@1 with the fake adapter): isolated database only.
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
  await p.challenge.create({ data: { id: challengeId, labId, objective: "Làm LED sáng mà không quá dòng", constraints: {} } });
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
  it("climbs only on a real retry, logs provenance, caches across students and never changes the verdict", async () => {
    const p = db!;
    const f = await fixture(p);
    const a = await f.student("active");
    const b = await f.student("other");
    const provider = new FakeTutorProvider("Điều gì đang giới hạn dòng điện qua LED?");
    const deps = { provider, config: { ...studentAiConfig({}), llmEnabled: true } };
    const ask = (actor: any, attemptId: string, d: any = deps) => requestHint(p, actor, attemptId, d) as Promise<any>;

    // Level 1 on an open circuit; replay returns the same row.
    const first = await f.submit(a.user.id, open);
    const h1 = await ask(a.actor, first.id);
    expect(h1).toMatchObject({ level: 1, escalated: false, provider: "rules" });
    expect(h1.content).toBe(renderTutorTemplate("OPEN_CIRCUIT", 1, 0, first.simulationResult));
    expect(await ask(a.actor, first.id)).toEqual(h1);
    // Identical re-run → level 1, variant b.
    const same = await f.submit(a.user.id, { ...open, nodes: [...open.nodes].reverse() });
    const h1b = await ask(a.actor, same.id);
    expect(h1b).toMatchObject({ level: 1, escalated: false });
    expect(h1b.content).toBe(renderTutorTemplate("OPEN_CIRCUIT", 1, 1, first.simulationResult));
    // Older attempt → 400; another student's attempt → 404.
    await expect(ask(a.actor, first.id)).resolves.toMatchObject({ id: h1.id }); // a stored hint is still replayed
    const third = await f.submit(a.user.id, loop(330, false));
    await expect(ask(b.actor, third.id)).rejects.toMatchObject({ status: 404 });
    const fresh = await f.submit(a.user.id, loop(330, false));
    await expect(ask(a.actor, third.id)).rejects.toMatchObject({ response: { code: "HINT_NOT_LATEST_ATTEMPT" } });

    // Changed wiring → level 2 (SWITCH_OPEN), then two more real retries reach 3 and 4 with the fake observation.
    const before = await p.attempt.findUniqueOrThrow({ where: { id: fresh.id } });
    const h2 = await ask(a.actor, fresh.id);
    expect(h2).toMatchObject({ level: 2, escalated: true, provider: "rules" });
    expect(await p.attempt.findUniqueOrThrow({ where: { id: fresh.id } })).toEqual(before);
    const overload = await f.submit(a.user.id, loop(330));
    const h3 = await ask(a.actor, overload.id);
    expect(h3).toMatchObject({ level: 3, escalated: true, provider: "fake" });
    expect(h3.content).toMatch(/^Điều gì đang giới hạn dòng điện qua LED\?\n\n/);
    const row3 = await p.hintLog.findUniqueOrThrow({ where: { id: h3.id } });
    expect(row3).toMatchObject({ ruleVersion: "tutor-rules@1", promptVersion: "tutor-observation@1", provider: "fake", model: "fake-tutor@1", fallbackReason: null, escalated: true, variant: "a" });
    expect((row3.contextSnapshot as any).simulation).toEqual(overload.simulationResult);
    const overload2 = await f.submit(a.user.id, loop(300));
    const h4 = await ask(a.actor, overload2.id);
    expect(h4).toMatchObject({ level: 4, escalated: true });
    expect(h4.content).toContain("350 Ω");
    expect(provider.calls).toBe(2);

    // Another student with the same state (same challenge, digest, level) is served from the cache: no provider call.
    await f.submit(b.user.id, open);
    const bOpen = await p.attempt.findFirstOrThrow({ where: { studentId: b.user.id }, orderBy: { createdAt: "desc" } });
    await ask(b.actor, bOpen.id);
    await ask(b.actor, (await f.submit(b.user.id, loop(330, false))).id);
    const bh3 = await ask(b.actor, (await f.submit(b.user.id, loop(330))).id);
    expect(bh3).toMatchObject({ level: 3, provider: "cache" });
    expect(provider.calls).toBe(2);
    expect(await p.hintLog.findUniqueOrThrow({ where: { id: bh3.id } })).toMatchObject({ provider: "cache", model: "fake-tutor@1" });

    // Kill switch off → template only with DISABLED; an injected digit is dropped by the guard.
    const off = await ask(b.actor, (await f.submit(b.user.id, loop(300))).id, { provider, config: studentAiConfig({}) });
    expect(off).toMatchObject({ level: 4, provider: "rules" });
    expect(await p.hintLog.findUniqueOrThrow({ where: { id: off.id } })).toMatchObject({ fallbackReason: "DISABLED", model: null });

    // Passing, then asking → 409.
    const passed = await f.submit(a.user.id, loop(350));
    expect(passed.verdict).toBe("passed");
    await expect(ask(a.actor, passed.id)).rejects.toMatchObject({ response: { code: "HINT_NOT_NEEDED" } });
  }, 60000);

  it("injected unsafe output falls back, the 10-minute window answers 429 with retryAfterSeconds, the budget falls back to rules", async () => {
    const p = db!;
    const f = await fixture(p);
    const s = await f.student("window");
    const unsafe = new FakeTutorProvider("Dùng 9 V là được?");
    const config = { ...studentAiConfig({}), llmEnabled: true, hintsPer10Min: 8, dailyProviderCalls: 1 };
    // Climb to level 3 with distinct states: open → switch open → overload (provider), → overload changed (budget).
    const states = [open, loop(330, false), loop(330), loop(300), loop(250), loop(200), loop(150), loop(100)];
    const hints: any[] = [];
    for (const state of states) {
      const attempt = await f.submit(s.user.id, state);
      hints.push(await requestHint(p, s.actor, attempt.id, { provider: unsafe, config }));
    }
    expect(hints.map((h) => h.level)).toEqual([1, 2, 3, 4, 4, 4, 4, 4]);
    const rows = await p.hintLog.findMany({ where: { id: { in: hints.map((h) => h.id) } } });
    const byId = new Map(rows.map((row) => [row.id, row]));
    expect(byId.get(hints[2].id)).toMatchObject({ provider: "rules-fallback", fallbackReason: "GUARD:NUMERIC", model: "fake-tutor@1" });
    expect(hints[2].content).not.toContain("9 V");
    // One provider call already used today (the guarded one): the next level-4 hint is over budget.
    expect(byId.get(hints[3].id)).toMatchObject({ provider: "rules-fallback", fallbackReason: "BUDGET", model: null });
    expect(unsafe.calls).toBe(1);
    // Ninth hint inside 10 minutes → 429 with retryAfterSeconds; the eighth was allowed.
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
    await requestHint(p, s.actor, attempt.id, { provider: null });
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
