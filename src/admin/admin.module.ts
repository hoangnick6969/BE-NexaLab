import { Module } from "@nestjs/common";
import { AdminController } from "./admin.controller";

/** Admin console shell: overview counts and the audit log. Domain admin routes live in their own modules. */
@Module({
  controllers: [AdminController],
})
export class AdminModule {}
