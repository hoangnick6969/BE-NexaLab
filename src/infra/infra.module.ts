import { Global, Module } from "@nestjs/common";
import { HealthController } from "./health.controller";
import { LocalStorageController } from "./local-storage.controller";
import { Db } from "./db";

/** Process-wide infrastructure: the Prisma client (one pool), health check and the local storage driver's signed-URL endpoint. */
@Global()
@Module({
  controllers: [HealthController, LocalStorageController],
  providers: [Db],
  exports: [Db],
})
export class InfraModule {}
