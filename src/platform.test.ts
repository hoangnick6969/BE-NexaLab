import { describe, expect, it, vi } from "vitest";
import { audit, auditDiff, changedFields } from "./audit";
import { idempotent, readIdempotencyKey, replay, requestHash, stableStringify } from "./idempotency";
import { JOIN_LIMITS, isLocked, nextBucket } from "./limiter";
import {
  formatJoinCode,
  hashSecret,
  issueJoinCode,
  keyRing,
  parseJoinCode,
  randomBase32,
  verifySecret,
  withFreshJoinCode,
} from "./join-code";
import { targetHash } from "./access";

const env = { JWT_SECRET: "x".repeat(40) } as NodeJS.ProcessEnv;

describe("audit allowlist and redaction (B0P-T2)", () => {
  const sentinels = {
    password: "SENTINEL-PASSWORD-123",
    passwordHash: "$argon2id$v=19$SENTINEL",
    temporaryPassword: "Nexa-SENTINELtemporary",
    joinCode: "NL-ABCDEF-0123456789",
    joinSecretHash: "f".repeat(64),
    token: "eyJhbGciOiJIUzI1NiJ9.SENTINEL.sig",
    answerOptionId: "SENTINEL-ANSWER",
    hint: "SENTINEL-HINT-BODY",
    labState: { sentinel: "SENTINEL-LAB" },
    simulationResult: { sentinel: "SENTINEL-SIM" },
  };

  it("drops every non-allowlisted field and nested object", () => {
    const diff = auditDiff({ name: "8A", grade: 8, ...sentinels });
    expect(diff).toEqual({ name: "8A", grade: 8 });
    expect(JSON.stringify(diff)).not.toMatch(/SENTINEL|argon2|NL-/);
  });

  it("redacts credential-looking values even inside allowlisted fields", () => {
    expect(auditDiff({ name: "NL-ABCDEF-0123456789", title: "Nexa-abcdefghijk" })).toEqual({
      name: "[REDACTED]",
      title: "[REDACTED]",
    });
  });

  it("keeps only the allowlisted fields that changed", () => {
    expect(changedFields({ name: "A", grade: 8, joinSecretHash: "a" }, { name: "B", grade: 8, joinSecretHash: "b" })).toEqual({
      before: { name: "A" },
      after: { name: "B" },
    });
  });

  it("writes through the given transaction so a failure aborts the mutation", async () => {
    const tx = {
      auditLog: {
        create: vi.fn().mockRejectedValue(new Error("audit store down")),
      },
    };
    await expect(
      audit(tx, {
        actor: { sub: "t1", role: "TEACHER" },
        action: "class.create",
        targetType: "Classroom",
        targetId: "c1",
        after: { name: "8A" },
      }),
    ).rejects.toThrow("audit store down");
    const ok = { auditLog: { create: vi.fn().mockResolvedValue({}) } };
    await audit(ok, {
      actor: null,
      action: "x",
      targetType: "T",
      before: { password: "p" },
      reason: "NL-ABCDEF-0123456789",
    });
    expect(ok.auditLog.create.mock.calls[0][0].data).toMatchObject({
      before: undefined,
      reason: "[REDACTED]",
      outcome: "success",
    });
  });
});

describe("join codes (B1-T3)", () => {
  const ring = keyRing(env);

  it("issues NL-LLLLLL-SSSSSSSSSS in uppercase Crockford Base32 with a separate secret", () => {
    const issued = issueJoinCode(ring);
    expect(issued.code).toMatch(/^NL-[0-9A-HJKMNP-TV-Z]{6}-[0-9A-HJKMNP-TV-Z]{10}$/);
    expect(issued.secretHash).toMatch(/^[0-9a-f]{64}$/);
    expect(issued.secretHash).not.toContain(issued.code.slice(10));
  });

  it("draws uniformly from the 32-symbol alphabet", () => {
    const counts = new Map<string, number>();
    for (let i = 0; i < 2000; i++) for (const ch of randomBase32(10)) counts.set(ch, (counts.get(ch) ?? 0) + 1);
    expect(counts.size).toBe(32);
    for (const n of counts.values()) expect(n).toBeGreaterThan(400);
  });

  it("parses spacing, case and Crockford look-alikes", () => {
    expect(parseJoinCode("nl-abcdef-0123456789")).toEqual({
      locator: "ABCDEF",
      secret: "0123456789",
    });
    expect(parseJoinCode("NL ABCDEF 0123456789")).toEqual({
      locator: "ABCDEF",
      secret: "0123456789",
    });
    expect(parseJoinCode("NL-ABCDEF-O1I3456789")).toEqual({
      locator: "ABCDEF",
      secret: "0113456789",
    });
    expect(parseJoinCode("NEXA8A")).toBeNull();
    expect(parseJoinCode("NL-ABCDEF-012345678")).toBeNull();
    expect(parseJoinCode("NL-ABCDEU-0123456789")).toBeNull();
  });

  it("verifies only the matching secret and key version", () => {
    const issued = issueJoinCode(ring);
    const stored = {
      joinSecretHash: issued.secretHash,
      joinKeyVersion: issued.keyVersion,
    };
    expect(verifySecret(parseJoinCode(issued.code), stored, ring)).toBe(true);
    const wrong = parseJoinCode(formatJoinCode(issued.locator, "0000000000"))!;
    expect(verifySecret(wrong, stored, ring)).toBe(false);
    expect(verifySecret(parseJoinCode(issued.code), { ...stored, joinKeyVersion: 99 }, ring)).toBe(false);
    expect(verifySecret(null, null, ring)).toBe(false);
    expect(verifySecret(parseJoinCode(issued.code), null, ring)).toBe(false);
  });

  it("supports key rotation and refuses a production deployment without keys", () => {
    const k1 = Buffer.alloc(32, 1).toString("base64");
    const k2 = Buffer.alloc(32, 2).toString("base64");
    const rotated = keyRing({
      JOIN_CODE_HMAC_KEYS: `1:${k1},2:${k2}`,
      JOIN_CODE_HMAC_KEY_VERSION: "2",
    } as any);
    expect(rotated.current).toBe(2);
    expect(hashSecret("ABCDEF", "0123456789", 1, rotated)).not.toBe(hashSecret("ABCDEF", "0123456789", 2, rotated));
    expect(() => keyRing({ NODE_ENV: "production", JWT_SECRET: "x".repeat(40) } as any)).toThrow(/required/);
  });

  it("draws a new locator after a unique collision and gives up with JOIN_CODE_COLLISION", async () => {
    const ring = keyRing(env);
    const collision = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["joinLocator"] },
    });
    const seen: string[] = [];
    const work = vi.fn(async (code: ReturnType<typeof issueJoinCode>) => {
      seen.push(code.locator);
      if (seen.length < 3) throw collision;
      return code.code;
    });
    const issued = await withFreshJoinCode(work, () => issueJoinCode(ring));
    expect(work).toHaveBeenCalledTimes(3);
    expect(new Set(seen).size).toBe(3);
    expect(issued).toBe(formatJoinCode(seen[2], issued.slice(10)));

    const always = vi.fn(async () => {
      throw collision;
    });
    await expect(withFreshJoinCode(always, () => issueJoinCode(ring), 4)).rejects.toMatchObject({
      response: { code: "JOIN_CODE_COLLISION" },
    });
    expect(always).toHaveBeenCalledTimes(4);
  });

  it("does not retry other unique violations or errors", async () => {
    const ring = keyRing(env);
    const other = Object.assign(new Error("Unique constraint failed"), {
      code: "P2002",
      meta: { target: ["actorId", "key"] },
    });
    const work = vi.fn(async () => {
      throw other;
    });
    await expect(withFreshJoinCode(work, () => issueJoinCode(ring))).rejects.toBe(other);
    expect(work).toHaveBeenCalledTimes(1);
  });
});

describe("shared join limiter transitions (B1-T3)", () => {
  const t0 = new Date("2026-10-14T00:00:00Z");
  const at = (ms: number) => new Date(t0.getTime() + ms);
  const run = (rule = JOIN_LIMITS.pair, n: number, spacingMs = 1000) => {
    let bucket = null as ReturnType<typeof nextBucket> | null;
    for (let i = 0; i < n; i++) bucket = nextBucket(bucket, at(i * spacingMs), rule);
    return bucket!;
  };

  it("locks the IP+account pair on the 10th failure for 15 minutes", () => {
    expect(isLocked(run(JOIN_LIMITS.pair, 9), at(9000))).toBe(false);
    const locked = run(JOIN_LIMITS.pair, 10);
    expect(isLocked(locked, at(10_000))).toBe(true);
    expect(locked.lockedUntil!.getTime() - at(9000).getTime()).toBe(15 * 60_000);
    expect(isLocked(locked, at(9000 + 15 * 60_000))).toBe(false);
  });

  it("applies the account (20→30 min), locator+IP (30→15 min) and endpoint (60→15 min) thresholds", () => {
    expect(isLocked(run(JOIN_LIMITS.account, 19), at(19_000))).toBe(false);
    expect(run(JOIN_LIMITS.account, 20).lockedUntil!.getTime() - at(19_000).getTime()).toBe(30 * 60_000);
    expect(isLocked(run(JOIN_LIMITS.locatorIp, 29), at(29_000))).toBe(false);
    expect(isLocked(run(JOIN_LIMITS.locatorIp, 30), at(30_000))).toBe(true);
    expect(isLocked(run(JOIN_LIMITS.endpointIp, 59), at(59_000))).toBe(false);
    expect(isLocked(run(JOIN_LIMITS.endpointIp, 60), at(60_000))).toBe(true);
  });

  it("starts a new window after 10 minutes instead of accumulating", () => {
    const spaced = run(JOIN_LIMITS.pair, 10, 61_000 + 10_000);
    expect(isLocked(spaced, at(10 * 71_000))).toBe(false);
    expect(spaced.count).toBeLessThan(10);
  });

  it("does not extend an active lock and resets once it expires", () => {
    const locked = run(JOIN_LIMITS.pair, 10);
    expect(nextBucket(locked, at(60_000), JOIN_LIMITS.pair)).toBe(locked);
    const after = nextBucket(locked, new Date(locked.lockedUntil!.getTime() + 1), JOIN_LIMITS.pair);
    expect(after).toMatchObject({ count: 1, lockedUntil: null });
  });
});

describe("idempotency keys (B1)", () => {
  it("validates the header format", () => {
    expect(readIdempotencyKey({ headers: {} })).toBeNull();
    expect(
      readIdempotencyKey({
        headers: { "idempotency-key": "6c0b6f1e-1d2c-4e8f-9a1b-123456789abc" },
      }),
    ).toMatch(/^6c0b/);
    expect(() => readIdempotencyKey({ headers: { "idempotency-key": "bad key!" } })).toThrow();
  });

  it("hashes payloads independently of key order", () => {
    expect(stableStringify({ b: 1, a: [2, { d: 1, c: 2 }] })).toBe('{"a":[2,{"c":2,"d":1}],"b":1}');
    expect(requestHash("s", { a: 1, b: 2 })).toBe(requestHash("s", { b: 2, a: 1 }));
    expect(requestHash("s", { a: 1 })).not.toBe(requestHash("t", { a: 1 }));
  });

  function fakeDb() {
    const records = new Map<string, any>();
    const db: any = {
      idempotencyRecord: {
        findUnique: async ({ where }: any) => records.get(where.actorId_key.actorId + "|" + where.actorId_key.key) ?? null,
        create: async ({ data }: any) =>
          records.set(data.actorId + "|" + data.key, {
            ...data,
            response: null,
          }),
        update: async ({ where, data }: any) => Object.assign(records.get(where.actorId_key.actorId + "|" + where.actorId_key.key), data),
      },
      $transaction: async (work: any) => work(db),
    };
    return db;
  }

  it("replays the same payload and rejects a different one under the same key", async () => {
    const db = fakeDb();
    const work = vi.fn(async () => ({ id: "a1", secret: "show-once" }));
    const ctx = {
      actorId: "t1",
      key: "key-12345678",
      scope: "POST x",
      payload: { n: 1 },
    };
    const first = await idempotent(db, ctx, work, {
      stored: (r: any) => ({ ...r, secret: null }),
    });
    const second = await idempotent(db, ctx, work);
    expect(first).toEqual({ id: "a1", secret: "show-once" });
    expect(second).toEqual({ id: "a1", secret: null });
    expect(work).toHaveBeenCalledTimes(1);
    await expect(replay(db, { ...ctx, payload: { n: 2 } })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
    await expect(replay(db, { ...ctx, scope: "POST y" })).rejects.toMatchObject({ response: { code: "IDEMPOTENCY_KEY_REUSED" } });
  });
});

describe("assignment target hash", () => {
  it("is order- and duplicate-insensitive", () => {
    expect(targetHash(["b", "a", "a"])).toBe(targetHash(["a", "b"]));
    expect(targetHash(["a"])).not.toBe(targetHash(["a", "b"]));
  });
});

import { isStructureChange, publishBlockers } from "./content";
import { materializeQuizQuestions } from "./pathway";

describe("teacher content gates (B1-T4)", () => {
  const lesson = {
    title: "Mạch điện",
    subjectId: "physics",
    chapter: "Điện",
    grade: 8,
    topic: "LED",
    learningObjective: "Lắp mạch an toàn",
    content: "<p>Dòng điện</p>",
    materials: [] as any[],
    questions: [{ prompt: "Q?", options: ["a", "b"], answer: 0 }],
    labId: null,
    review: {
      sources: "SGK KHTN 8 (tham chiếu), tài liệu tự biên soạn",
      license: "ORIGINAL" as const,
      outcome: "KHTN8.E1",
      answerKeyChecked: true,
      safetyChecked: true,
      accessibilityChecked: true,
    },
  };

  it("passes a complete self-reviewed private lesson", () => {
    expect(publishBlockers(lesson, "TEACHER_PRIVATE")).toEqual([]);
  });

  it("lists each missing item: review, transcript, answer-key check", () => {
    expect(publishBlockers({ ...lesson, review: null }, "TEACHER_PRIVATE")).toEqual([expect.stringContaining("phiếu tự kiểm duyệt")]);
    expect(
      publishBlockers(
        {
          ...lesson,
          materials: [{ type: "video", url: "https://x/v.mp4", title: "Video 1" }],
        },
        "TEACHER_PRIVATE",
      ),
    ).toEqual([expect.stringContaining('video "Video 1"')]);
    expect(publishBlockers({ ...lesson, review: { ...lesson.review, answerKeyChecked: false } }, "TEACHER_PRIVATE")).toEqual([
      expect.stringContaining("đáp án"),
    ]);
  });

  it("never lets the self-review checklist publish shared library content", () => {
    expect(publishBlockers(lesson, "SHARED_LIBRARY")).toEqual([expect.stringContaining("thư viện chung")]);
  });

  it("treats content, media, questions and lab as structure but not metadata", () => {
    expect(isStructureChange(lesson, { ...lesson })).toBe(false);
    expect(
      isStructureChange(lesson, {
        ...lesson,
        questions: [{ prompt: "Q2?", options: ["a", "b"], answer: 1 }],
      }),
    ).toBe(true);
    expect(isStructureChange(lesson, { ...lesson, labId: "circuit" })).toBe(true);
    expect(isStructureChange(lesson, { ...lesson, content: "<p>khác</p>" })).toBe(true);
  });

  it("gives a cloned lesson new question and option IDs but keeps historical IDs otherwise", () => {
    const original = materializeQuizQuestions(lesson.questions);
    expect(materializeQuizQuestions(lesson.questions)).toEqual(original);
    const cloned = materializeQuizQuestions(lesson.questions, "lesson-clone-1");
    expect(cloned[0].id).not.toBe(original[0].id);
    expect(cloned[0].options[0].id).not.toBe(original[0].options[0].id);
  });
});
