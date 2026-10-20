import { Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { NotificationInput } from "./notify";
import { dueSoonNotice, overdueNotice } from "./time-based-notices";
import { NOTIFICATION_REPOSITORY, type NotificationRepository } from "./notification.repository";

/** Time-based notices change on a scale of hours, so one sync per user per interval is enough. */
export const TIME_BASED_SYNC_MS = 5 * 60_000;

type Viewer = { sub: string; role: string };

/** In-app notifications for the signed-in user (acc-3, D-ACC-02). */
@Injectable()
export class NotificationsService {
  constructor(@Inject(NOTIFICATION_REPOSITORY) private repo: NotificationRepository) {}

  private lastSync = new Map<string, number>();
  private inFlight = new Map<string, Promise<void>>();

  async unreadCount(viewer: Viewer) {
    await this.syncThrottled(viewer);
    return this.repo.unreadCount(viewer.sub);
  }

  async list(viewer: Viewer, limit: number) {
    await this.syncThrottled(viewer);
    const [items, unreadCount] = await Promise.all([this.repo.list(viewer.sub, limit), this.repo.unreadCount(viewer.sub)]);
    return { items, unreadCount };
  }

  async markRead(viewer: Viewer, id: string) {
    if (!(await this.repo.markRead(id, viewer.sub)) && !(await this.repo.exists(id, viewer.sub))) throw new NotFoundException();
  }

  markAllRead(viewer: Viewer) {
    return this.repo.markAllRead(viewer.sub);
  }

  /**
   * Throttles the sync per user: 30 s polls from every open tab must stay a plain count,
   * or they hold pooled connections long enough to starve other requests (seen as 503s on login).
   */
  private syncThrottled(viewer: Viewer) {
    if (viewer.role !== "STUDENT" && viewer.role !== "PARENT") return;
    const running = this.inFlight.get(viewer.sub);
    if (running) return running;
    const now = Date.now();
    if (now - (this.lastSync.get(viewer.sub) ?? 0) < TIME_BASED_SYNC_MS) return;
    if (this.lastSync.size > 10_000)
      for (const [id, at] of this.lastSync) if (now - at >= TIME_BASED_SYNC_MS) this.lastSync.delete(id);
    this.lastSync.set(viewer.sub, now);
    const run = this.syncTimeBased(viewer)
      .catch((error) => {
        this.lastSync.delete(viewer.sub);
        throw error;
      })
      .finally(() => this.inFlight.delete(viewer.sub));
    this.inFlight.set(viewer.sub, run);
    return run;
  }

  /**
   * Time-based notices have no committing event, so they are materialised when read:
   * due-soon for a student's assigned tests and overdue for a linked parent's children.
   * dedupKey includes the deadline revision, so an extension yields a fresh notice.
   */
  private async syncTimeBased(viewer: Viewer) {
    const children = viewer.role === "STUDENT" ? [{ id: viewer.sub, fullName: "" }] : await this.repo.linkedChildren(viewer.sub);
    const items: NotificationInput[] = [];
    for (const child of children) {
      for (const test of await this.repo.assignedTestStates(child.id)) {
        if (viewer.role === "STUDENT" && test.status === "DUE_SOON") items.push(dueSoonNotice(viewer.sub, test));
        if (viewer.role === "PARENT" && test.status === "OVERDUE_UNSUBMITTED") items.push(overdueNotice(viewer.sub, child, test));
      }
    }
    await this.repo.insert(items);
  }
}
