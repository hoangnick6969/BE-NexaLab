import { Global, Module } from "@nestjs/common";
import { Db } from "./db";

/** The Prisma client (one connection pool), global so every module can inject `Db`. */
@Global()
@Module({
  providers: [Db],
  exports: [Db],
})
export class DbModule {}
