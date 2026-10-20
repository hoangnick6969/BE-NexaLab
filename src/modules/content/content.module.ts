import { Module } from "@nestjs/common";
import { AdminContentController } from "./interface/admin-content.controller";

/** Content packs, coverage, releases and ingestion sources (admin). */
@Module({
  controllers: [AdminContentController],
})
export class ContentModule {}
