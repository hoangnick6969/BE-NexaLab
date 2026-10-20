import { Module } from "@nestjs/common";
import { LocalStorageController } from "./interface/local-storage.controller";

/**
 * Object storage (R2 or the local driver, see docs/operations/r2-storage.md). `storage()` is a process-wide
 * singleton used by several modules; this module only exposes the local driver's signed-URL endpoint.
 */
@Module({ controllers: [LocalStorageController] })
export class StorageModule {}
