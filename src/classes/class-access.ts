import { ForbiddenException } from "@nestjs/common";
import { createHash } from "node:crypto";
import { audit } from "../common/audit";

/**
 * One access policy for student-visible assignments (B1-T2/T5, Q-B1-02):
 * the class is active, the enrollment is approved, the assignment is active
 * and the student is in its target snapshot. Pending and removed students,
 * archived classes and archived assignments all fall out of this filter.
 */
export const applicableAssignmentWhere = (studentId: string) => ({
  status: "ACTIVE",
  classroom: {
    status: "ACTIVE" as const,
    enrollments: { some: { studentId, status: "approved" as const } },
  },
  targets: { some: { studentId } },
});

export const applicableLessonAssignmentWhere = (studentId: string, lessonId: string, assignmentId?: string) => ({
  ...applicableAssignmentWhere(studentId),
  ...(assignmentId ? { id: assignmentId } : {}),
  contentId: lessonId,
  contentType: "lesson",
});

/** Ordering of a student's queue: due work first, undated work last. */
export const assignmentQueueOrder = [
  { dueDate: { sort: "asc" as const, nulls: "last" as const } },
  { createdAt: "asc" as const },
  { id: "asc" as const },
];

export const targetHash = (studentIds: string[]) =>
  createHash("sha256").update([...new Set(studentIds)].sort().join(",")).digest("hex");

export const isOverdue = (dueDate: Date | null | undefined, now = new Date()) => Boolean(dueDate && dueDate < now);

const classDenied = () =>
  new ForbiddenException({ code: "CLASS_ACCESS_DENIED", message: "Không phải lớp của bạn hoặc lớp không tồn tại" });

/**
 * Owner check for teacher class routes. Unknown and foreign class IDs get the
 * same 403 body; only a probe of an existing foreign class is audited.
 */
export async function ownedClass(db: any, id: string, user: { sub: string; role: string }) {
  const classroom = await db.classroom.findUnique({ where: { id } });
  if (classroom && classroom.teacherId === user.sub) return classroom;
  if (classroom)
    await audit(db, {
      actor: user,
      action: "class.access",
      targetType: "Classroom",
      targetId: id,
      outcome: "denied",
      reason: "not_owner",
    });
  throw classDenied();
}
