import { ConflictException } from "@nestjs/common";
import { z } from "zod";

/**
 * C2-T1 user-lifecycle policy (D9, Q-C2-01). Hard delete is allowed only when
 * the eligibility query finds no reference at all; anyone with history is
 * disabled instead, and disabling an owner needs an explicit resolution for
 * every active owned class, lesson and asset.
 */
export const DELETION_BLOCKER_LABELS = {
  attempts: "lần thực hành",
  quizAttempts: "lần làm quiz",
  stepProgress: "tiến độ bước học",
  progress: "tiến độ tổng hợp",
  savedExperiments: "thí nghiệm đã lưu",
  enrollments: "ghi danh lớp",
  assignmentTargets: "bài được giao",
  parentLinks: "liên kết phụ huynh",
  parentLinkCodes: "mã liên kết phụ huynh",
  consents: "bản ghi đồng ý",
  gateOverrides: "mở khoá cổng quiz",
  classes: "lớp sở hữu",
  lessons: "bài học sở hữu",
  assets: "tệp sở hữu",
  auditReferences: "tham chiếu nhật ký kiểm toán",
  creditTransactions: "giao dịch tín dụng",
} as const;
export type DeletionBlockers = Record<keyof typeof DELETION_BLOCKER_LABELS, number>;

/** Counts every reference that forbids hard delete. */
export async function deletionBlockers(db: any, userId: string): Promise<DeletionBlockers> {
  const [
    attempts,
    quizAttempts,
    stepProgress,
    progress,
    savedExperiments,
    enrollments,
    assignmentTargets,
    parentLinks,
    parentLinkCodes,
    consents,
    gateOverrides,
    classes,
    lessons,
    assets,
    auditReferences,
    creditTransactions,
  ] = await Promise.all([
    db.attempt.count({ where: { studentId: userId } }),
    db.quizAttempt.count({ where: { studentId: userId } }),
    db.stepProgress.count({ where: { studentId: userId } }),
    db.progress.count({ where: { studentId: userId } }),
    db.savedExperiment.count({ where: { studentId: userId } }),
    db.enrollment.count({ where: { studentId: userId } }),
    db.assignmentTarget.count({ where: { studentId: userId } }),
    db.parentLink.count({ where: { OR: [{ parentId: userId }, { studentId: userId }] } }),
    db.parentLinkCode.count({ where: { OR: [{ studentId: userId }, { teacherId: userId }] } }),
    db.parentConsent.count({ where: { OR: [{ userId }, { actorId: userId }] } }),
    db.teacherGateOverride.count({ where: { OR: [{ studentId: userId }, { actorId: userId }, { revokedById: userId }] } }),
    db.classroom.count({ where: { teacherId: userId } }),
    db.lesson.count({ where: { authorId: userId } }),
    db.asset.count({ where: { ownerId: userId } }),
    // The account's own lifecycle rows (user.create, user.update, …) are about the
    // account itself, not evidence it produced; every other actor/target row counts.
    db.auditLog.count({
      where: {
        OR: [{ actorId: userId }, { targetId: userId, NOT: { targetType: "User", action: { startsWith: "user." } } }],
      },
    }),
    db.creditTransaction.count({ where: { entries: { some: { account: { ownerId: userId, kind: { in: ["TEACHER_AVAILABLE", "TEACHER_RESERVED"] } } } } } }),
  ]);
  return {
    attempts,
    quizAttempts,
    stepProgress,
    progress,
    savedExperiments,
    enrollments,
    assignmentTargets,
    parentLinks,
    parentLinkCodes,
    consents,
    gateOverrides,
    classes,
    lessons,
    assets,
    auditReferences,
    creditTransactions,
  };
}
export const blockingKeys = (blockers: DeletionBlockers) =>
  (Object.keys(blockers) as Array<keyof DeletionBlockers>).filter((key) => blockers[key] > 0);

/** Active ownership that disabling must resolve explicitly. */
export async function activeOwnership(db: any, userId: string) {
  const [classes, lessons, assets] = await Promise.all([
    db.classroom.findMany({
      where: { teacherId: userId, status: "ACTIVE" },
      select: { id: true, name: true },
      orderBy: { createdAt: "asc" },
    }),
    db.lesson.findMany({
      where: { authorId: userId, status: { in: ["draft", "published"] } },
      select: { id: true, title: true, scope: true, status: true },
      orderBy: { createdAt: "asc" },
    }),
    db.asset
      .findMany({ where: { ownerId: userId, status: "ACTIVE" }, select: { id: true, title: true, scope: true }, orderBy: { createdAt: "asc" } })
      .then((rows: any[]) => rows.map((a) => ({ id: a.id, name: a.title, scope: a.scope }))),
  ]);
  return { classes, lessons, assets } as Ownership;
}
export type Ownership = {
  classes: Array<{ id: string; name: string }>;
  lessons: Array<{ id: string; title: string; scope: string; status: string }>;
  assets: Array<{ id: string; name: string; scope: string }>;
};

const resolution = <A extends string>(actions: readonly [A, ...A[]]) =>
  z.object({ id: z.string().min(1).max(100), action: z.enum(actions), newOwnerId: z.string().min(1).max(100).optional() }).strict();
export const resolutionsSchema = z
  .object({
    classes: z
      .array(resolution(["reassign", "archive"]))
      .max(200)
      .default([]),
    lessons: z
      .array(resolution(["reassign", "archive", "quarantine"]))
      .max(500)
      .default([]),
    assets: z
      .array(resolution(["reassign", "quarantine"]))
      .max(500)
      .default([]),
  })
  .strict()
  .default({});
export type Resolutions = z.infer<typeof resolutionsSchema>;

/** Allowed actions: shared content/assets reassign or quarantine; private lessons reassign or archive. */
export const allowedActions = {
  class: ["reassign", "archive"],
  lesson: (scope: string) => (scope === "SHARED_LIBRARY" ? ["reassign", "quarantine"] : ["reassign", "archive"]),
  asset: ["reassign", "quarantine"],
};

/** Every owned item without a valid resolution, plus resolutions that name nothing owned. */
export function resolutionProblems(owned: Ownership, resolutions: Resolutions) {
  const problems: Array<{ kind: "class" | "lesson" | "asset"; id: string; label: string; problem: string; allowed: string[] }> = [];
  const check = <T extends { id: string }>(
    kind: "class" | "lesson" | "asset",
    items: T[],
    given: Array<{ id: string; action: string; newOwnerId?: string }>,
    label: (item: T) => string,
    allowed: (item: T) => string[],
  ) => {
    const byId = new Map(given.map((item) => [item.id, item]));
    for (const item of items) {
      const chosen = byId.get(item.id);
      const options = allowed(item);
      if (!chosen) problems.push({ kind, id: item.id, label: label(item), problem: "missing", allowed: options });
      else if (!options.includes(chosen.action))
        problems.push({ kind, id: item.id, label: label(item), problem: "action_not_allowed", allowed: options });
      else if (chosen.action === "reassign" && !chosen.newOwnerId)
        problems.push({ kind, id: item.id, label: label(item), problem: "new_owner_required", allowed: options });
    }
    const ownedIds = new Set(items.map((item) => item.id));
    for (const item of given)
      if (!ownedIds.has(item.id)) problems.push({ kind, id: item.id, label: item.id, problem: "not_owned", allowed: [] });
  };
  check(
    "class",
    owned.classes,
    resolutions.classes,
    (c) => c.name,
    () => allowedActions.class,
  );
  check(
    "lesson",
    owned.lessons,
    resolutions.lessons,
    (l) => l.title,
    (l) => allowedActions.lesson(l.scope),
  );
  check(
    "asset",
    owned.assets,
    resolutions.assets,
    (a) => a.name,
    () => allowedActions.asset,
  );
  return problems;
}

/** Serializes admin lifecycle changes so two admins cannot remove each other concurrently. */
export async function lockAdminLifecycle(tx: any) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('nexalab:admin-lifecycle'))`;
}

/** Never leave the platform without an active admin. */
export async function assertNotLastActiveAdmin(tx: any, target: { id: string; role: string; status: string }) {
  if (target.role !== "ADMIN" || target.status !== "active") return;
  const others = await tx.user.count({ where: { role: "ADMIN", status: "active", id: { not: target.id } } });
  if (!others)
    throw new ConflictException({
      code: "LAST_ACTIVE_ADMIN",
      message: "Không thể vô hiệu hóa hoặc xóa quản trị viên đang hoạt động cuối cùng",
    });
}
