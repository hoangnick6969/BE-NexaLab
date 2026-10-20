import { Module } from "@nestjs/common";
import { AssetsController } from "./interface/assets.controller";
import { FilesController } from "./interface/files.controller";
import { AdminAssetsController } from "./interface/admin-assets.controller";

/** Versioned media assets: uploads, finalize/read grants, legacy files, and admin asset operations. */
@Module({
  controllers: [AssetsController, FilesController, AdminAssetsController],
})
export class AssetsModule {}
