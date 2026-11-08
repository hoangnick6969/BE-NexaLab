import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { legacyHintView, providerDelayMs, requestHint } from "./hint";
import { labHintOpenApiSchemas } from "../interface/hint-contract";
import { studentAiConfig, type StudentTutorProvider } from "./tutor-provider";

vi.mock("../../progress/application/progress-projection", () => ({ projectLab: vi.fn(async () => undefined), projectLesson: vi.fn(async () => undefined) }));

const actor = { sub: "s1", sid: "sess1" };
const config = { ...studentAiConfig({}), llmEnabled: true };
/** Two attempts on circuit_001: the earlier one got a level-2 hint, the current (changed) one asks → level 3. */
function fakeDb(state: { sessionValid: boolean; assignmentApplicable?: boolean; verdict?: string }) {
  const log: string[] = [];
  let inTransaction = false;
  const base = { studentId: "s1", challengeId: "circuit_001", assignmentId: "as1", lessonStepId: null, labRunId: null,
    challenge: { id: "circuit_001", labId: "circuit", objective: "Làm LED sáng an toàn", constraints: {} } };
  const previous = { ...base, id: "a0", createdAt: new Date("2026-11-08T01:00:00Z"), labState: { nodes: [{ id: "b", type: "battery" }], edges: [] },
    simulationResult: { status: "OPEN_CIRCUIT" }, verdict: "not_passed",
    hints: [{ id: "h0", attemptId: "a0", level: 2, labDigest: null, createdAt: new Date("2026-11-08T01:00:01Z") }] as any[] };
  const attempt = { ...base, id: "a1", createdAt: new Date("2026-11-08T01:05:00Z"), labState: { nodes: [{ id: "b", type: "battery" }, { id: "l", type: "led" }], edges: [] },
    simulationResult: { status: "LED_OVERLOAD", minimumResistance: 350, verdict: "partial" }, verdict: state.verdict ?? "partial", hints: [] as any[] };
  const client: any = {
    attempt: {
      findFirst: async () => ({ ...attempt, hints: [...attempt.hints] }),
      findMany: async () => [previous, { ...attempt, hints: [...attempt.hints] }],
    },
    session: {
      findFirst: async () => (state.sessionValid ? { user: { status: "active", role: "STUDENT" } } : null),
    },
    assignment: { findFirst: async () => (state.assignmentApplicable === false ? null : { id: "as1" }) },
    user: { findUniqueOrThrow: async () => ({ id: "s1", studentLevel: "basic", grade: 8 }) },
    lessonStep: { findUnique: async () => null },
    hintObservationCache: { findUnique: async () => null, upsert: async () => { log.push("cache"); return {}; } },
    hintLog: {
      findMany: async () => [],
      count: async () => 0,
      create: async ({ data }: any) => {
        log.push("persist");
        const hint = { id: "h1", createdAt: new Date(), ...data };
        attempt.hints.push(hint);
        return hint;
      },
    },
    $executeRaw: async () => {
      log.push("lock");
      return 1;
    },
    $transaction: async (work: any) => {
      inTransaction = true;
      log.push("tx:start");
      try {
        return await work(client);
      } finally {
        inTransaction = false;
        log.push("tx:end");
      }
    },
  };
  return { client, log, attempt, inTransaction: () => inTransaction };
}

function provider(onCall: () => void, reply = "Điều gì giới hạn dòng điện qua LED?"): StudentTutorProvider {
  return { name: "fake", model: "fake-tutor@1", complete: async () => { onCall(); return JSON.stringify({ observation: reply }); } };
}

describe("hint provider boundary (B0P-T4, SAI-01)", () => {
  it("calls the provider with no transaction or advisory lock held, then persists in a short transaction", async () => {
    const db = fakeDb({ sessionValid: true });
    const hint = await requestHint(db.client, actor, "a1", { config, provider: provider(() => db.log.push(db.inTransaction() ? "provider:in-tx" : "provider:outside-tx")) });
    expect(hint).toMatchObject({ level: 3, escalated: true, provider: "fake" });
    expect(hint.content).toMatch(/^Điều gì giới hạn dòng điện qua LED\?\n\n/);
    expect(Object.keys(hint).sort()).toEqual(["attemptId", "content", "createdAt", "escalated", "id", "level", "provider"]);
    expect(db.log).toEqual(["provider:outside-tx", "tx:start", "lock", "persist", "tx:end", "cache"]);
    const row = db.attempt.hints[0];
    expect(row).toMatchObject({ ruleVersion: "tutor-rules@1", promptVersion: "tutor-observation@1", model: "fake-tutor@1", fallbackReason: null, variant: "a" });
    expect(row.labDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(row.contextDigest).toMatch(/^[0-9a-f]{64}$/);
  });

  it("the kill switch keeps the template and records DISABLED without calling the provider", async () => {
    const db = fakeDb({ sessionValid: true });
    const called = vi.fn();
    const hint = await requestHint(db.client, actor, "a1", { config: studentAiConfig({}), provider: provider(called) });
    expect(called).not.toHaveBeenCalled();
    expect(hint).toMatchObject({ level: 3, provider: "rules" });
    expect(db.attempt.hints[0]).toMatchObject({ provider: "rules", fallbackReason: "DISABLED", model: null });
  });

  it("refuses a passed attempt with HINT_NOT_NEEDED", async () => {
    const db = fakeDb({ sessionValid: true, verdict: "passed" });
    await expect(requestHint(db.client, actor, "a1", { config, provider: null })).rejects.toMatchObject({ status: 409, response: { code: "HINT_NOT_NEEDED" } });
  });

  it("persists nothing when the session is revoked while the provider runs", async () => {
    const state = { sessionValid: true };
    const db = fakeDb(state);
    await expect(requestHint(db.client, actor, "a1", { config, provider: provider(() => { state.sessionValid = false; }) })).rejects.toMatchObject({ status: 401 });
    expect(db.log).not.toContain("persist");
  });

  it("persists nothing when the assignment stops applying while the provider runs", async () => {
    const state: { sessionValid: boolean; assignmentApplicable?: boolean } = { sessionValid: true };
    const db = fakeDb(state);
    await expect(requestHint(db.client, actor, "a1", { config, provider: provider(() => { state.assignmentApplicable = false; }) })).rejects.toMatchObject({ status: 403 });
    expect(db.log).not.toContain("persist");
  });

  it("returns the hint stored by a parallel request instead of writing a second one", async () => {
    const db = fakeDb({ sessionValid: true });
    const hint = await requestHint(db.client, actor, "a1", { config, provider: provider(() => {
      db.attempt.hints.push({ id: "parallel", attemptId: "a1", level: 3, content: "Đã có", provider: "rules", escalated: true, createdAt: new Date() });
    }) });
    expect(hint.id).toBe("parallel");
    expect(db.log).not.toContain("persist");
    expect(db.log).not.toContain("cache");
  });

  it("honours the test delay only in an explicit development/test environment", () => {
    expect(providerDelayMs({ APP_ENV: "test", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(1500);
    expect(providerDelayMs({ APP_ENV: "test", NODE_ENV: "production", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(0);
    expect(providerDelayMs({ APP_ENV: "pilot", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(0);
    expect(providerDelayMs({ APP_ENV: "development", HINT_PROVIDER_TEST_DELAY_MS: "999999" } as any)).toBe(30000);
  });

  it("recovers from an unsafe provider observation with the rules template", async () => {
    const db = fakeDb({ sessionValid: true });
    const hint = await requestHint(db.client, actor, "a1", { config, provider: provider(() => undefined, "Dùng 9 V nhé?") });
    expect(hint.provider).toBe("rules-fallback");
    expect(hint.content).not.toContain("9 V");
    expect(db.attempt.hints[0].fallbackReason).toBe("GUARD:NUMERIC");
  });

  it("the hint view matches the OpenAPI fixture and drops every internal field", () => {
    const fixture = JSON.parse(readFileSync("docs/contracts/student-lab-hint-v1.json", "utf8"));
    const view = legacyHintView({ id: "h", attemptId: "a", level: 2, content: "x", escalated: true, provider: "rules", createdAt: new Date(),
      contextSnapshot: { studentLevel: "basic" }, contextDigest: "d", labDigest: "l", model: "m", fallbackReason: "DISABLED", ruleVersion: "tutor-rules@1" });
    expect(Object.keys(view).sort()).toEqual([...fixture.schemas.StudentLabHint].sort());
    expect(labHintOpenApiSchemas.StudentLabHint.required).toEqual(fixture.schemas.StudentLabHint);
    for (const forbidden of fixture.forbiddenResponseProperties) expect(view).not.toHaveProperty(forbidden);
  });
});
