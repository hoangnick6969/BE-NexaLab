import { Module } from "@nestjs/common";
import { NotificationsController } from "./interface/notifications.controller";

/** In-app notifications: read API and on-read sync of time-based notices (acc-3). */
@Module({ controllers: [NotificationsController] })
export class NotificationsModule {}
