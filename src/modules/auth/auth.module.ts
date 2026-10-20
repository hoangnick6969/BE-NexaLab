import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { AuthController } from "./interface/auth.controller";
import { AuthGuard } from "./interface/auth";

/** Sessions, login, password change/reset, and the global AuthGuard (JWT + @Roles/@Public). */
@Module({
  controllers: [AuthController],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
})
export class AuthModule {}
