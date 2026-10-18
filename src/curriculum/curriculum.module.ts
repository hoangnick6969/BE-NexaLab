import { Module } from "@nestjs/common";
import { CatalogController } from "./catalog.controller";
import { AdminCurriculumController } from "./admin-curriculum.controller";

/** Subject/chapter/topic/outcome taxonomy: public catalog and admin curation. */
@Module({
  controllers: [CatalogController, AdminCurriculumController],
})
export class CurriculumModule {}
