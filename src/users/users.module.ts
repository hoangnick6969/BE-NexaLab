import { Module } from "@nestjs/common";
import { AdminUsersController } from "./admin-users.controller";

/** Admin user lifecycle (C2-T1): create, edit, disable with ownership resolution, reactivate, delete, reset links. */
@Module({
  controllers: [AdminUsersController],
})
export class UsersModule {}
