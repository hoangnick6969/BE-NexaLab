import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { afterAll, describe, expect, it } from "vitest";
import { parseAiConfig } from "../application/ai-config";
import { AiJobRunner, RUNNER_TIMINGS } from "../application/ai-job-runner";
import { AiJobsService } from "../application/ai-jobs.service";
import { FakeAiProvider } from "../infrastructure/fake-provider";
import { AiJobsController } from "./ai-jobs.controller";

/**
 * TAI-T2 against a real PostgreSQL (advisory lock, conditional updates, idempotency unique index). Runs only with
 * NEXALAB_AI_TEST_URL set to the isolated local database (same value as NEXALAB_ISOLATED_DATABASE_URL) after
 * `prisma migrate deploy`; otherwise skipped.
 */
const testUrl = process.env.NEXALAB_AI_TEST_URL;
if (testUrl) {
  const url = new URL(testUrl);
  if (!["localhost", "127.0.0.1", "[::1]"].includes(url.hostname) || testUrl !== process.env.NEXALAB_ISOLATED_DATABASE_URL)
    throw new Error("TAI-T2 integration only accepts the isolated local database (NEXALAB_ISOLATED_DATABASE_URL)");
}
const db = testUrl ? new PrismaClient({ datasourceUrl: testUrl }) : null;
afterAll(async () => { await db?.$disconnect(); });

describe.skipIf(!db)("isolated TAI-T2 AI job runtime", () => {
  it("creates, replays, limits concurrency under the advisory lock, runs, cancels and denies", async () => {
    const p = db!;
    const suffix = randomUUID().slice(0, 8);
    const owner = await p.user.create({ data: { email: `tai-owner-${suffix}@example.test`, fullName: "TAI owner", passwordHash: "fixture", role: "TEACHER" } });
    const outsider = await p.user.create({ data: { email: `tai-out-${suffix}@example.test`, fullName: "TAI outsider", passwordHash: "fixture", role: "TEACHER" } });
    await p.subject.upsert({ where: { id: "tai-isolated-subject" }, update: {}, create: { id: "tai-isolated-subject", name: "TAI isolated fixture" } });
    const lesson = await p.lesson.create({ data: {
      subjectId: "tai-isolated-subject", authorId: owner.id, title: "Mạch điện", chapter: "c", grade: 8, topic: "Dòng điện",
      learningObjective: "Hiểu dòng điện", prerequisites: "", curriculum: "KHTN8", content: "<p>Dòng điện là dòng điện tích.</p>", synthetic: true,
    } });
    const classroom = await p.classroom.create({ data: { teacherId: owner.id, name: `TAI ${suffix}` } });
    const config = parseAiConfig({ AI_PROVIDER: "fake", AI_PROVIDER_MIN_INTERVAL_MS: "0" } as any);
    const provider = new FakeAiProvider();
    const controller = new AiJobsController(new AiJobsService(p as any, config, provider));
    const runner = new AiJobRunner(p as any, config, provider);
    const req = (user: { id: string }, key: string | null = randomUUID()) => ({ user: { sub: user.id, role: "TEACHER" }, headers: key ? { "idempotency-key": key } : {} });
    const body = { purpose: "GENERATE_RESOURCE", targetKind: "TEST", lessonId: lesson.id, itemCount: 3 };

    const key = randomUUID();
    const first = await controller.create(classroom.id, req(owner, key), body);
    expect((await controller.create(classroom.id, req(owner, key), body)).id).toBe(first.id);
    await expect(controller.create(classroom.id, req(owner, key), { ...body, itemCount: 4 })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    await expect(controller.create(classroom.id, req(outsider), body)).rejects.toMatchObject({ status: 403, response: { code: "CLASS_ACCESS_DENIED" } });

    // Second slot is free; two concurrent creates race for it and exactly one wins.
    const race = await Promise.allSettled([controller.create(classroom.id, req(owner), body), controller.create(classroom.id, req(owner), body)]);
    expect(race.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((race.find((r) => r.status === "rejected") as any).reason.response.code).toBe("AI_QUOTA_EXCEEDED");

    expect(await runner.runOnce()).toBe(first.id);
    const done = await controller.get(classroom.id, first.id, req(owner));
    expect(done).toMatchObject({ status: "SUCCEEDED", validCount: 3, lessonChangedSinceGeneration: false });
    expect(done.items).toHaveLength(3);

    const second = (race.find((r) => r.status === "fulfilled") as any).value;
    const claimed = (await runner.claim(new Date()))!;
    expect(claimed.id).toBe(second.id);
    expect((await controller.cancel(classroom.id, second.id, req(owner))).status).toBe("CANCELLED");
    await runner.succeed(claimed, [{ payload: { late: true }, flags: [] }], [], { inputTokens: 1, outputTokens: 1 }, new Date());
    expect(await p.aiJobItem.count({ where: { jobId: second.id } })).toBe(0);

    const third = await controller.create(classroom.id, req(owner), body);
    await runner.claim(new Date());
    await runner.sweep(new Date(Date.now() + RUNNER_TIMINGS.leaseMs + 1000));
    expect((await p.aiJob.findUniqueOrThrow({ where: { id: third.id } })).status).toBe("PENDING");

    await p.aiJob.deleteMany({ where: { classId: classroom.id } });
    await p.classroom.delete({ where: { id: classroom.id } });
    await p.lesson.delete({ where: { id: lesson.id } });
  });
});
