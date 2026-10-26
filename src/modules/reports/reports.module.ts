import { Module } from "@nestjs/common";
import { ClassEvidenceController } from "./interface/class-evidence.controller";
import { ClassProgressController } from "./interface/class-progress.controller";
import { LearningJourneyController } from "./interface/learning-journey.controller";

/** Teacher-facing class reports: assignment progress board, analytics, and evidence review with support flags. */
@Module({
  controllers: [ClassProgressController, ClassEvidenceController, LearningJourneyController],
})
export class ReportsModule {}
