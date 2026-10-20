import { Injectable, Body, ConflictException, Controller, Get, Inject, Param, Post, Put, Query, Req } from "@nestjs/common";
import { z } from "zod";
import { applicableAssignmentWhere, isOverdue, ownedClass } from "./class-access";
import { classArchived, grade, lock, reason, text } from "./class-common";
import { withFreshJoinCode } from "./join-code";
import { audit, changedFields } from "../../../common/audit";
import { idempotent, readIdempotencyKey } from "../../../common/idempotency";
import { Db } from "../../../db/db";

const normalizedName = (name: string) => name.trim().replace(/\s+/g, " ");

function classView(c: any) {
  return {
    id: c.id,
    name: c.name,
    grade: c.grade,
    status: c.status,
    archivedAt: c.archivedAt,
    requiresApproval: c.requiresApproval,
    joinCode: {
      enabled: c.joinCodeEnabled,
      issued: Boolean(c.joinLocator),
      rotatedAt: c.joinCodeRotatedAt,
    },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

/** Use cases behind ClassesController (moved from the controller unchanged; repository ports are the next step). */
@Injectable()
export class ClassesService {
  constructor(@Inject(Db) private db: Db) {}

  async classes(req: any, query: unknown) {
    const q = z.object({ status: z.enum(["ACTIVE", "ARCHIVED", "ALL"]).default("ALL") }).parse(query);
    const now = new Date();
    if (req.user.role === "STUDENT") {
      const studentId = req.user.sub;
      const rows = await this.db.enrollment.findMany({
        where: { studentId, status: { in: ["approved", "pending"] } },
        include: { classroom: true },
        orderBy: { joinedAt: "desc" },
      });
      const assignments = await this.db.assignment.findMany({
        where: applicableAssignmentWhere(studentId),
        select: {
          id: true,
          classId: true,
          title: true,
          contentId: true,
          contentType: true,
          dueDate: true,
        },
      });
      return rows.map((e) => ({
        id: e.classroom.id,
        name: e.classroom.name,
        grade: e.classroom.grade,
        status: e.classroom.status,
        enrollmentStatus: e.status,
        assignments: assignments.filter((a) => a.classId === e.classId).map((a) => ({ ...a, overdue: isOverdue(a.dueDate, now) })),
      }));
    }
    const rows = await this.db.classroom.findMany({
      where: {
        ...(req.user.role === "TEACHER" ? { teacherId: req.user.sub } : {}),
        ...(q.status === "ALL" ? {} : { status: q.status }),
      },
      orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    });
    const ids = rows.map((c) => c.id);
    const [members, assignments] = await Promise.all([
      this.db.enrollment.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: ids } },
        _count: { _all: true },
      }),
      this.db.assignment.groupBy({
        by: ["classId", "status"],
        where: { classId: { in: ids } },
        _count: { _all: true },
      }),
    ]);
    const countOf = (list: any[], classId: string, status: string) =>
      list.find((item) => item.classId === classId && item.status === status)?._count._all ?? 0;
    return rows.map((c) => ({
      ...classView(c),
      members: {
        approved: countOf(members, c.id, "approved"),
        pending: countOf(members, c.id, "pending"),
        removed: countOf(members, c.id, "removed"),
      },
      assignments: {
        active: countOf(assignments, c.id, "ACTIVE"),
        archived: countOf(assignments, c.id, "ARCHIVED"),
      },
    }));
  }

  async classDetail(id: string, req: any) {
    const c = await ownedClass(this.db, id, req.user);
    return classView(c);
  }

  async createClass(req: any, body: unknown) {
    const b = z
      .object({
        name: text,
        grade,
        joinCodeEnabled: z.boolean().default(true),
        requiresApproval: z.boolean().default(false),
      })
      .strict()
      .parse(body);
    const name = normalizedName(b.name);
    const ctx = {
      actorId: req.user.sub,
      key: readIdempotencyKey(req),
      scope: "POST classes",
      payload: { ...b, name },
    };
    return withFreshJoinCode((code) =>
      idempotent(
        this.db,
        ctx,
        async (tx) => {
          await this.assertUniqueName(tx, req.user.sub, name);
          const c = await tx.classroom.create({
            data: {
              name,
              grade: b.grade,
              teacherId: req.user.sub,
              joinCodeEnabled: b.joinCodeEnabled,
              requiresApproval: b.requiresApproval,
              joinLocator: code.locator,
              joinSecretHash: code.secretHash,
              joinKeyVersion: code.keyVersion,
              joinCodeRotatedAt: new Date(),
            },
          });
          await audit(tx, {
            actor: req.user,
            action: "class.create",
            targetType: "Classroom",
            targetId: c.id,
            after: {
              name,
              grade: b.grade,
              joinCodeEnabled: b.joinCodeEnabled,
              requiresApproval: b.requiresApproval,
              joinCodeIssued: true,
            },
          });
          return { class: classView(c), joinCode: code.code };
        },
        // The full join code is shown once; a replay returns the class without it.
        {
          stored: (result: any) => ({
            ...result,
            joinCode: null,
            joinCodeShownOnce: true,
          }),
        },
      ),
    );
  }

  private async assertUniqueName(tx: any, teacherId: string, name: string, exceptId?: string) {
    await lock(tx, "class-name:" + teacherId);
    const clash = await tx.classroom.findFirst({
      where: {
        teacherId,
        status: "ACTIVE",
        name: { equals: name, mode: "insensitive" },
        ...(exceptId ? { id: { not: exceptId } } : {}),
      },
      select: { id: true },
    });
    if (clash)
      throw new ConflictException({
        code: "CLASS_NAME_TAKEN",
        message: "Bạn đã có lớp đang hoạt động trùng tên này",
      });
  }

  async updateClass(id: string, req: any, body: unknown) {
    const b = z
      .object({
        name: text.optional(),
        grade: grade.optional(),
        joinCodeEnabled: z.boolean().optional(),
        requiresApproval: z.boolean().optional(),
      })
      .strict()
      .refine((value) => Object.keys(value).length > 0, "Không có thay đổi")
      .parse(body);
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    const data = { ...b, ...(b.name ? { name: normalizedName(b.name) } : {}) };
    return this.db.$transaction(async (tx) => {
      if (data.name) await this.assertUniqueName(tx, req.user.sub, data.name, id);
      const updated = await tx.classroom.update({ where: { id }, data });
      const diff = changedFields(c, updated);
      if (diff.after)
        await audit(tx, {
          actor: req.user,
          action: "class.update",
          targetType: "Classroom",
          targetId: id,
          ...diff,
        });
      return classView(updated);
    });
  }

  async archiveClass(id: string, req: any, body: unknown) {
    const b = z
      .object({ reason, confirm: z.literal(true) })
      .strict()
      .parse(body ?? {});
    const c = await ownedClass(this.db, id, req.user);
    return this.db.$transaction(async (tx) => {
      const counts = await this.classCounts(tx, id);
      if (c.status === "ARCHIVED") return { class: classView(c), retained: counts, alreadyArchived: true };
      const updated = await tx.classroom.update({
        where: { id },
        data: { status: "ARCHIVED", archivedAt: new Date() },
      });
      await audit(tx, {
        actor: req.user,
        action: "class.archive",
        targetType: "Classroom",
        targetId: id,
        reason: b.reason,
        before: { status: c.status },
        after: { status: "ARCHIVED", ...counts },
      });
      return {
        class: classView(updated),
        retained: counts,
        alreadyArchived: false,
      };
    });
  }

  private async classCounts(db: any, classId: string) {
    const assignmentIds = (await db.assignment.findMany({ where: { classId }, select: { id: true } })).map((a: any) => a.id);
    const [enrollments, assignments, quiz, practical] = await Promise.all([
      db.enrollment.count({ where: { classId } }),
      db.assignment.count({ where: { classId } }),
      db.quizAttempt.count({ where: { assignmentId: { in: assignmentIds } } }),
      db.attempt.count({ where: { assignmentId: { in: assignmentIds } } }),
    ]);
    return { enrollments, assignments, evidence: quiz + practical };
  }

  async rotateJoinCode(id: string, req: any) {
    const c = await ownedClass(this.db, id, req.user);
    if (c.status === "ARCHIVED") throw classArchived();
    return withFreshJoinCode((code) =>
      this.db.$transaction(async (tx) => {
        const updated = await tx.classroom.update({
          where: { id },
          data: {
            joinLocator: code.locator,
            joinSecretHash: code.secretHash,
            joinKeyVersion: code.keyVersion,
            joinCodeRotatedAt: new Date(),
            joinCodeEnabled: true,
          },
        });
        await audit(tx, {
          actor: req.user,
          action: "class.join_code.rotate",
          targetType: "Classroom",
          targetId: id,
          after: { joinCodeRotated: true, joinCodeEnabled: true },
        });
        return { class: classView(updated), joinCode: code.code };
      }),
    );
  }
}
