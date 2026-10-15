import { describe, expect, it } from "vitest";
import { assertNotLastActiveAdmin, blockingKeys, deletionBlockers, resolutionProblems, resolutionsSchema } from "./admin-policy";

const owned = {
  classes: [{ id: "c1", name: "8A" }],
  lessons: [
    { id: "l-private", title: "Bài riêng", scope: "TEACHER_PRIVATE", status: "draft" },
    { id: "l-shared", title: "Bài chung", scope: "SHARED_LIBRARY", status: "published" },
  ],
  assets: [{ id: "a1", name: "so-do.png", scope: "TEACHER_PRIVATE" }],
};

describe("ownership resolution (C2-T1)", () => {
  it("reports every owned item without a resolution", () => {
    const problems = resolutionProblems(owned, resolutionsSchema.parse({}));
    expect(problems.map((p) => [p.kind, p.id, p.problem])).toEqual([
      ["class", "c1", "missing"],
      ["lesson", "l-private", "missing"],
      ["lesson", "l-shared", "missing"],
      ["asset", "a1", "missing"],
    ]);
  });

  it("allows archive for private lessons but only reassign/quarantine for shared ones", () => {
    const problems = resolutionProblems(
      owned,
      resolutionsSchema.parse({
        classes: [{ id: "c1", action: "archive" }],
        lessons: [
          { id: "l-private", action: "archive" },
          { id: "l-shared", action: "archive" },
        ],
        assets: [{ id: "a1", action: "quarantine" }],
      }),
    );
    expect(problems).toEqual([
      expect.objectContaining({ id: "l-shared", problem: "action_not_allowed", allowed: ["reassign", "quarantine"] }),
    ]);
  });

  it("requires a new owner for reassign and rejects items the user does not own", () => {
    const problems = resolutionProblems(
      owned,
      resolutionsSchema.parse({
        classes: [
          { id: "c1", action: "reassign" },
          { id: "someone-else", action: "archive" },
        ],
        lessons: [
          { id: "l-private", action: "reassign", newOwnerId: "t2" },
          { id: "l-shared", action: "quarantine" },
        ],
        assets: [{ id: "a1", action: "reassign", newOwnerId: "t2" }],
      }),
    );
    expect(problems.map((p) => [p.id, p.problem])).toEqual([
      ["c1", "new_owner_required"],
      ["someone-else", "not_owned"],
    ]);
  });

  it("is satisfied when every item has an allowed resolution", () => {
    expect(
      resolutionProblems(
        owned,
        resolutionsSchema.parse({
          classes: [{ id: "c1", action: "reassign", newOwnerId: "t2" }],
          lessons: [
            { id: "l-private", action: "archive" },
            { id: "l-shared", action: "reassign", newOwnerId: "admin2" },
          ],
          assets: [{ id: "a1", action: "quarantine" }],
        }),
      ),
    ).toEqual([]);
  });
});

describe("deletion eligibility and last admin (C2-T1)", () => {
  const counting = (counts: Record<string, number>) =>
    new Proxy(
      {},
      {
        get: (_target, model: string) => ({ count: async () => counts[model] ?? 0 }),
      },
    );

  it("an empty account is eligible; any evidence, link or audit reference blocks", async () => {
    expect(blockingKeys(await deletionBlockers(counting({}), "u1"))).toEqual([]);
    const blockers = await deletionBlockers(counting({ quizAttempt: 2, parentLinkCode: 1, auditLog: 3 }), "u1");
    expect(blockingKeys(blockers)).toEqual(["quizAttempts", "parentLinkCodes", "auditReferences"]);
  });

  it("refuses to disable or delete the last active admin", async () => {
    const tx = (others: number) => ({ user: { count: async () => others } });
    await expect(assertNotLastActiveAdmin(tx(0), { id: "a1", role: "ADMIN", status: "active" })).rejects.toMatchObject({
      response: { code: "LAST_ACTIVE_ADMIN" },
    });
    await expect(assertNotLastActiveAdmin(tx(1), { id: "a1", role: "ADMIN", status: "active" })).resolves.toBeUndefined();
    await expect(assertNotLastActiveAdmin(tx(0), { id: "t1", role: "TEACHER", status: "active" })).resolves.toBeUndefined();
  });
});
