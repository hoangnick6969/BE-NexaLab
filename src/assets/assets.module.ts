import { Module } from "@nestjs/common";
import { AssetsController } from "./assets.controller";
import { FilesController } from "./files.controller";
import { AdminAssetsController } from "./admin-assets.controller";

/** Versioned media assets: uploads, finalize/read grants, legacy files, and admin asset operations. */
@Module({
  controllers: [AssetsController, FilesController, AdminAssetsController],
})
export class AssetsModule {}
