import { Module } from "@nestjs/common";
import { LessonsController } from "./lessons.controller";
import { EbookController } from "./ebook.controller";
import { AdminLessonsController } from "./admin-lessons.controller";

/** Lesson authoring, library and release review, ebook annotations, and admin content operations. */
@Module({
  controllers: [LessonsController, EbookController, AdminLessonsController],
})
export class LessonsModule {}
