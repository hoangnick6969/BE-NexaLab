import { Module } from "@nestjs/common";
import { ProgressController } from "./interface/progress.controller";
import { StudentAccessService } from "./application/student-access.service";
import { FoundationalProgressService } from "./application/foundational-progress.service";

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
