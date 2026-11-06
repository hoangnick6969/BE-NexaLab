import type { NotificationInput } from "./notify";

/** Persistence port for notifications (acc-3). The application layer depends on this, never on Prisma. */
export const NOTIFICATION_REPOSITORY = Symbol("NOTIFICATION_REPOSITORY");

export type NotificationView = { id: string; type: string; title: string; body: string | null; link: string | null; readAt: Date | null; createdAt: Date };
/** An assigned test with its current state for one student, as the time-based sync needs it. */
/** `contentType` is "test" or "written" (TAI2-T2); parents get no written notices until TAI2-T3. */
export type AssignedTestState = { assignmentId: string; title: string; className: string; status: string; revision: number; contentType?: string };

export interface NotificationRepository {
  list(recipientId: string, limit: number): Promise<NotificationView[]>;
  unreadCount(recipientId: string): Promise<number>;
  /** Marks one unread notice read; false when nothing changed. */
  markRead(id: string, recipientId: string): Promise<boolean>;
  exists(id: string, recipientId: string): Promise<boolean>;
  markAllRead(recipientId: string): Promise<number>;
  /** Idempotent insert keyed by dedupKey. */
  insert(items: NotificationInput[]): Promise<number>;
  linkedChildren(parentId: string): Promise<Array<{ id: string; fullName: string }>>;
  assignedTestStates(studentId: string): Promise<AssignedTestState[]>;
}
