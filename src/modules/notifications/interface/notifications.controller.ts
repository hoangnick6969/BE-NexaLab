import { Controller, Get, Inject, Param, Post, Query, Req } from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import { NotificationsService } from "../application/notifications.service";

const listQuery = z.object({ limit: z.coerce.number().int().min(1).max(100).default(30) });

/** In-app notifications for the signed-in user (acc-3, D-ACC-02); the FE polls the unread count every 30 s. */
@ApiTags("Notifications")
@ApiBearerAuth()
@Controller()
export class NotificationsController {
  // Explicit token: the tsx dev runtime emits no decorator metadata.
  constructor(@Inject(NotificationsService) private notifications: NotificationsService) {}

  @Get("me/notifications/unread-count")
  async unreadCount(@Req() req: any) {
    return { count: await this.notifications.unreadCount(req.user) };
  }

  @Get("me/notifications")
  @ApiOperation({ summary: "Newest notifications first, with the unread count" })
  list(@Req() req: any, @Query() query: unknown) {
    return this.notifications.list(req.user, listQuery.parse(query).limit);
  }

  @Post("me/notifications/:id/read")
  async markRead(@Req() req: any, @Param("id") id: string) {
    await this.notifications.markRead(req.user, id);
    return { read: true };
  }

  @Post("me/notifications/read-all")
  async markAllRead(@Req() req: any) {
    return { updated: await this.notifications.markAllRead(req.user) };
  }
}
