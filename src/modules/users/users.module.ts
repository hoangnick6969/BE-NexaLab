import { Module } from "@nestjs/common";
import { AdminUsersController } from "./interface/admin-users.controller";
import { ProfileController } from "./interface/profile.controller";

/** Admin user lifecycle (C2-T1) and self-service profile with a private avatar (acc-2). */
@Module({
  controllers: [AdminUsersController, ProfileController],
})
export class UsersModule {}
