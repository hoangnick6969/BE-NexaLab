import { afterEach, describe, expect, it, vi } from "vitest";
import { providerDelayMs, requestHint } from "./hint";
import { explain } from "./llm";

vi.mock("./progress-projection", () => ({ projectLab: vi.fn(async () => undefined), projectLesson: vi.fn(async () => undefined) }));

const actor = { sub: "s1", sid: "sess1" };
function fakeDb(state: { sessionValid: boolean; assignmentApplicable?: boolean }) {
  const log: string[] = [];
  let inTransaction = false;
  const attempt = {
    id: "a1",
    studentId: "s1",
    challengeId: "circuit_001",
    assignmentId: "as1",
    lessonStepId: null,
    labState: {},
    simulationResult: { status: "LED_OVERLOAD", verdict: "partial" },
    verdict: "partial",
    challenge: { id: "circuit_001", labId: "circuit", objective: "x", constraints: {} },
    hints: [] as any[],
  };
  const client: any = {
    attempt: {
      findFirst: async () => ({ ...attempt, hints: [...attempt.hints] }),
      findMany: async () => [{ ...attempt, hints: [...attempt.hints] }],
    },
    session: {
      findFirst: async () => (state.sessionValid ? { user: { status: "active", role: "STUDENT" } } : null),
    },
    assignment: { findFirst: async () => (state.assignmentApplicable === false ? null : { id: "as1" }) },
    user: { findUniqueOrThrow: async () => ({ id: "s1", studentLevel: "basic", grade: 8 }) },
    lessonStep: { findUnique: async () => null },
    hintLog: {
      create: async ({ data }: any) => {
        log.push("persist");
        const hint = { id: "h1", ...data };
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

afterEach(() => vi.unstubAllGlobals());

describe("hint provider boundary (B0P-T4)", () => {
  it("calls the provider with no transaction or advisory lock held, then persists in a short transaction", async () => {
    const db = fakeDb({ sessionValid: true });
    const provider = vi.fn(async () => {
      db.log.push(db.inTransaction() ? "provider:in-tx" : "provider:outside-tx");
      return { content: "Gợi ý", provider: "test" };
    });
    const hint = await requestHint(db.client, actor, "a1", provider);
    expect(hint.content).toBe("Gợi ý");
    expect(db.log).toEqual(["provider:outside-tx", "tx:start", "lock", "persist", "tx:end"]);
  });

  it("persists nothing when the session is revoked while the provider runs", async () => {
    const state = { sessionValid: true };
    const db = fakeDb(state);
    const provider = async () => {
      state.sessionValid = false;
      return { content: "Không được lưu", provider: "test" };
    };
    await expect(requestHint(db.client, actor, "a1", provider)).rejects.toMatchObject({ status: 401 });
    expect(db.log).not.toContain("persist");
  });

  it("persists nothing when the assignment stops applying while the provider runs", async () => {
    const state: { sessionValid: boolean; assignmentApplicable?: boolean } = { sessionValid: true };
    const db = fakeDb(state);
    const provider = async () => {
      state.assignmentApplicable = false;
      return { content: "Không được lưu", provider: "test" };
    };
    await expect(requestHint(db.client, actor, "a1", provider)).rejects.toMatchObject({ status: 403 });
    expect(db.log).not.toContain("persist");
  });

  it("returns the hint stored by a parallel request instead of writing a second one", async () => {
    const db = fakeDb({ sessionValid: true });
    const provider = async () => {
      db.attempt.hints.push({ id: "parallel", level: 1, content: "Đã có" });
      return { content: "Thừa", provider: "test" };
    };
    const hint = await requestHint(db.client, actor, "a1", provider);
    expect(hint.id).toBe("parallel");
    expect(db.log).not.toContain("persist");
  });

  it("honours the test delay only in an explicit development/test environment", () => {
    expect(providerDelayMs({ APP_ENV: "test", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(1500);
    expect(providerDelayMs({ APP_ENV: "test", NODE_ENV: "production", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(0);
    expect(providerDelayMs({ APP_ENV: "pilot", HINT_PROVIDER_TEST_DELAY_MS: "1500" } as any)).toBe(0);
    expect(providerDelayMs({ APP_ENV: "development", HINT_PROVIDER_TEST_DELAY_MS: "999999" } as any)).toBe(30000);
  });

  it("recovers from a failing or unsafe provider with the deterministic rules hint", async () => {
    const env = { ...process.env };
    process.env.ANTHROPIC_API_KEY = "test-key";
    process.env.ANTHROPIC_MODEL = "test-model";
    const context = { hintLevel: 3, studentLevel: "basic", labState: {}, simulation: { status: "LED_OVERLOAD" }, labId: "circuit" };
    try {
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => Promise.reject(new Error("timeout"))),
      );
      expect((await explain(context)).provider).toBe("rules-fallback");
      vi.stubGlobal(
        "fetch",
        vi.fn(async () => new Response("{}", { status: 503 })),
      );
      expect((await explain(context)).provider).toBe("rules-fallback");
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () =>
            new Response(JSON.stringify({ content: [{ type: "text", text: '{"observation":"Dùng 9 V nhé"}' }] }), { status: 200 }),
        ),
      );
      expect((await explain(context)).provider).toBe("rules-fallback");
    } finally {
      process.env = env;
    }
  });
});
