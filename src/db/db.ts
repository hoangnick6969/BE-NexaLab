import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from "@nestjs/common";
import { PrismaClient } from "@prisma/client";
import { databaseDriver } from "./database-connection";

const driver = databaseDriver();

@Injectable()
export class Db extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor() {
    super(driver.adapter ? { adapter: driver.adapter } : undefined);
  }
  async onModuleInit() {
    await this.$connect();
    new Logger("Db").log(`database driver: ${driver.label}`);
  }
  async onModuleDestroy() {
    await this.$disconnect();
  }
}
