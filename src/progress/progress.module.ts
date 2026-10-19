import { Module } from "@nestjs/common";
import { ProgressController } from "./progress.controller";
import { StudentAccessService } from "./student-access.service";
import { FoundationalProgressService } from "./foundational-progress.service";

/**
 * Student progress, activity history and evidence reads. Exports StudentAccessService: which assignments a student
 * can open and their pathway with derived completion, reused by learning, labs and parents.
 */
@Module({
  controllers: [ProgressController],
  providers: [StudentAccessService, FoundationalProgressService],
  exports: [StudentAccessService],
})
export class ProgressModule {}
