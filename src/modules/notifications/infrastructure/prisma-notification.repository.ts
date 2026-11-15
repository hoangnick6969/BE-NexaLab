import { Inject, Injectable } from "@nestjs/common";
import { Db } from "../../../db/db";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { deadlineStates } from "../../classes/application/assignment-test-state";
import { DEADLINE_CONTENT_TYPES } from "../../classes/application/assignment-written-contract";
import { notify, type NotificationInput } from "../application/notify";
import type { AssignedTestState, NotificationRepository } from "../application/notification.repository";

const view = { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true } as const;

/** Prisma adapter for the notification port. */
@Injectable()
export class PrismaNotificationRepository implements NotificationRepository {
  constructor(@Inject(Db) private db: Db) {}

  list(recipientId: string, limit: number) {
    return this.db.notification.findMany({ where: { recipientId }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: limit, select: view });
  }
  unreadCount(recipientId: string) {
    return this.db.notification.count({ where: { recipientId, readAt: null } });
  }
  async markRead(id: string, recipientId: string) {
    return (await this.db.notification.updateMany({ where: { id, recipientId, readAt: null }, data: { readAt: new Date() } })).count > 0;
  }
  async exists(id: string, recipientId: string) {
    return (await this.db.notification.count({ where: { id, recipientId } })) > 0;
  }
  async markAllRead(recipientId: string) {
    return (await this.db.notification.updateMany({ where: { recipientId, readAt: null }, data: { readAt: new Date() } })).count;
  }
  insert(items: NotificationInput[]) {
    return notify(this.db, items);
  }
  async linkedChildren(parentId: string) {
    const links = await this.db.parentLink.findMany({
      where: { parentId, status: "approved", revokedAt: null },
      select: { student: { select: { id: true, fullName: true } } },
    });
    return links.map((l) => l.student);
  }
  async assignedTestStates(studentId: string): Promise<AssignedTestState[]> {
    const rows = await this.db.assignment.findMany({
      where: { ...applicableAssignmentWhere(studentId), contentType: { in: [...DEADLINE_CONTENT_TYPES] } },
      select: { id: true, title: true, dueDate: true, contentType: true, classroom: { select: { name: true } } },
    });
    if (!rows.length) return [];
    const { states, key } = await deadlineStates(this.db, rows, [studentId]);
    return rows.flatMap((a) => {
      const state = states.get(key(a.id, studentId));
      return state ? [{ assignmentId: a.id, title: a.title, className: a.classroom.name, status: state.status, revision: state.revision, contentType: a.contentType }] : [];
    });
  }
}
