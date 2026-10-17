import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./auth.controller";
import { AuthGuard } from "./auth";

/** Sessions, login, password change/reset, and the global AuthGuard (JWT + @Roles/@Public). */
@Module({
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
