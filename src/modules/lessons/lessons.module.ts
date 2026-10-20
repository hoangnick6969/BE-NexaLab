import { Module } from "@nestjs/common";
import { LessonsController } from "./interface/lessons.controller";
import { EbookController } from "./interface/ebook.controller";
import { AdminLessonsController } from "./interface/admin-lessons.controller";

/** Lesson authoring, library and release review, ebook annotations, and admin content operations. */
@Module({
  controllers: [LessonsController, EbookController, AdminLessonsController],
})
export class LessonsModule {}
