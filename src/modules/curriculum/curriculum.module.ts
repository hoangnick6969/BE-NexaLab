import { Module } from "@nestjs/common";
import { CatalogController } from "./interface/catalog.controller";
import { AdminCurriculumController } from "./interface/admin-curriculum.controller";

/** Framework/subject/chapter/topic/outcome taxonomy: public catalog and admin curation. */
@Module({
  controllers: [CatalogController, AdminCurriculumController],
})
export class CurriculumModule {}
