import { Controller, Get, Inject, NotFoundException, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { Db } from "../../../db/db";
import { notify, type NotificationInput } from "../application/notify";
import { applicableAssignmentWhere } from "../../classes/application/class-access";
import { TEST_CONTENT_TYPE } from "../../classes/application/assignment-test-contract";
import { testStates } from "../../classes/application/assignment-test-state";

/** Time-based notices change on a scale of hours, so one sync per user per interval is enough. */
export const TIME_BASED_SYNC_MS = 5 * 60_000;

/** In-app notifications for the signed-in user (acc-3, D-ACC-02); the FE polls the unread count every 30 s. */
@ApiTags("Notifications")
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  constructor(@Inject(Db) private db: Db) {}

  private lastSync = new Map<string, number>();
  private inFlight = new Map<string, Promise<void>>();

  /**
   * Throttles the sync per user: 30 s polls from every open tab must stay a plain count,
   * or they hold pooled connections long enough to starve other requests (seen as 503s on login).
   */
  private syncThrottled(user: { sub: string; role: string }) {
    if (user.role !== "STUDENT" && user.role !== "PARENT") return;
    const running = this.inFlight.get(user.sub);
    if (running) return running;
    const now = Date.now();
    if (now - (this.lastSync.get(user.sub) ?? 0) < TIME_BASED_SYNC_MS) return;
    if (this.lastSync.size > 10_000)
      for (const [id, at] of this.lastSync) if (now - at >= TIME_BASED_SYNC_MS) this.lastSync.delete(id);
    this.lastSync.set(user.sub, now);
    const run = this.syncTimeBased(user)
      .catch((error) => {
        this.lastSync.delete(user.sub);
        throw error;
      })
      .finally(() => this.inFlight.delete(user.sub));
    this.inFlight.set(user.sub, run);
    return run;
  }

  /**
   * Time-based notices have no committing event, so they are materialised when read:
   * due-soon for a student's assigned tests and overdue for a linked parent's children.
   * dedupKey includes the deadline revision, so an extension yields a fresh notice.
   */
  private async syncTimeBased(user: { sub: string; role: string }) {
    const studentIds =
      user.role === "STUDENT"
        ? [user.sub]
        : user.role === "PARENT"
          ? (await this.db.parentLink.findMany({ where: { parentId: user.sub, status: "approved", revokedAt: null }, select: { studentId: true } })).map((l) => l.studentId)
          : [];
    const items: NotificationInput[] = [];
    for (const studentId of studentIds) {
      const rows = await this.db.assignment.findMany({
        where: { ...applicableAssignmentWhere(studentId), contentType: TEST_CONTENT_TYPE },
        select: { id: true, title: true, dueDate: true, classroom: { select: { name: true } } },
      });
      if (!rows.length) continue;
      const { states, key } = await testStates(this.db, rows, [studentId]);
      const child = user.role === "PARENT" ? await this.db.user.findUnique({ where: { id: studentId }, select: { fullName: true } }) : null;
      for (const a of rows) {
        const state = states.get(key(a.id, studentId));
        if (!state) continue;
        if (user.role === "STUDENT" && state.status === "DUE_SOON")
          items.push({ recipientId: user.sub, type: "ASSIGNMENT_DUE_SOON", title: `Sắp đến hạn: ${a.title}`, body: `Lớp ${a.classroom.name}`, link: `/assignments/${a.id}`, dedupKey: `due-soon:${a.id}:${state.revision}` });
        if (user.role === "PARENT" && state.status === "OVERDUE_UNSUBMITTED")
          items.push({ recipientId: user.sub, type: "ASSIGNMENT_OVERDUE", title: `${child?.fullName} chưa nộp "${a.title}" đã quá hạn`, body: `Lớp ${a.classroom.name}`, link: "/progress", dedupKey: `overdue:${a.id}:${studentId}:${state.revision}` });
      }
    }
    await notify(this.db, items);
  }

  @Get("me/notifications/unread-count")
  async unreadCount(@Req() req: any) {
    await this.syncThrottled(req.user);
    return { count: await this.db.notification.count({ where: { recipientId: req.user.sub, readAt: null } }) };
  }

  @Get("me/notifications")
  @ApiOperation({ summary: "Newest notifications first, with the unread count" })
  async list(@Req() req: any, @Query() query: unknown) {
    const q = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) }).parse(query);
    await this.syncThrottled(req.user);
    const [items, unreadCount] = await Promise.all([
      this.db.notification.findMany({ where: { recipientId: req.user.sub }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take: q.limit, select: { id: true, type: true, title: true, body: true, link: true, readAt: true, createdAt: true } }),
      this.db.notification.count({ where: { recipientId: req.user.sub, readAt: null } }),
    ]);
    return { items, unreadCount };
  }

  @Post("me/notifications/:id/read")
  async markRead(@Req() req: any, @Param("id") id: string) {
    const result = await this.db.notification.updateMany({ where: { id, recipientId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    if (!result.count && !(await this.db.notification.count({ where: { id, recipientId: req.user.sub } }))) throw new NotFoundException();
    return { read: true };
  }

  @Post("me/notifications/read-all")
  async markAllRead(@Req() req: any) {
    const result = await this.db.notification.updateMany({ where: { recipientId: req.user.sub, readAt: null }, data: { readAt: new Date() } });
    return { updated: result.count };
  }
}
