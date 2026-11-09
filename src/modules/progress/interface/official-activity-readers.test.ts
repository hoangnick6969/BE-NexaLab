import { describe, expect, it, vi } from "vitest";
import { ProgressController } from "./progress.controller";
import { ParentsController } from "../../parents/interface/parents.controller";

const exclusion = [{ labRunId: null }, { labRun: { context: { not: "CLASS_PRACTICE" } } }];
const assigned = { id: "assigned", assignmentId: "assignment", challengeId: "challenge", lessonStepId: null, verdict: "passed", durationMs: 10, createdAt: new Date(), challenge: { lab: { id: "lab", title: "Lab" } } };

function fixture() {
  const db: any = {
    progress: { findMany: vi.fn().mockResolvedValue([]) }, quizAttempt: { findMany: vi.fn().mockResolvedValue([]) },
    lessonStep: { findMany: vi.fn().mockResolvedValue([]) }, lesson: { findMany: vi.fn().mockResolvedValue([]) },
    attempt: { findMany: vi.fn(async ({ where }: any) => {
      const filter = where.AND?.[0]?.OR ?? where.OR;
      expect(filter).toEqual(exclusion);
      expect(where.assignmentId).not.toBeNull();
      return [assigned];
    }) },
  };
  const access: any = { readableStudent: vi.fn() };
  return { db, access };
}

describe("official achievement and activity excludes class practice", () => {
  it("keeps assignment evidence in parent summaries/activity while excluding practice", async () => {
    const { db, access } = fixture();
    const controller = new ParentsController(db, access, {} as any);
    const summary = await controller.parentProgress({ user: { sub: "parent" } }, "student");
    expect(summary.summary).toMatchObject({ practicalAttempts: 1, passedPracticals: 1 });
    expect(await controller.parentActivity({ user: { sub: "parent" } }, "student", {})).toMatchObject([{ id: "assigned", kind: "PRACTICAL" }]);
    expect(access.readableStudent).toHaveBeenCalledTimes(2);
  });
  it("filters official progress and activity without losing the cursor predicate", async () => {
    const { db, access } = fixture();
    const controller = new ProgressController(db, access, {} as any);
    expect((await controller.progress("student", { user: { sub: "student", role: "STUDENT" } })).attempts).toEqual([assigned]);
    const cursor = Buffer.from(JSON.stringify({ t: new Date().toISOString(), id: "cursor-id" })).toString("base64url");
    const page = await controller.myActivity({ user: { sub: "student" } }, { kind: "PRACTICAL", cursor });
    expect(page.items).toMatchObject([{ id: "assigned", assignmentId: "assignment" }]);
    const where = db.attempt.findMany.mock.calls[1][0].where;
    expect(where.OR).toEqual(expect.arrayContaining([expect.objectContaining({ id: { lt: "cursor-id" } })]));
    expect(where.AND).toEqual([{ OR: exclusion }]);
  });
});
