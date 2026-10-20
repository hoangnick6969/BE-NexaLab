import { Module } from "@nestjs/common";
import { NotificationsService } from "./application/notifications.service";
import { NOTIFICATION_REPOSITORY } from "./application/notification.repository";
import { PrismaNotificationRepository } from "./infrastructure/prisma-notification.repository";
import { NotificationsController } from "./interface/notifications.controller";

/**
 * In-app notifications (acc-3), the reference layout for feature modules: the controller (interface) calls the
 * service (application), which depends on the NotificationRepository port; Prisma implements it (infrastructure).
 */
@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, { provide: NOTIFICATION_REPOSITORY, useClass: PrismaNotificationRepository }],
})
export class NotificationsModule {}
